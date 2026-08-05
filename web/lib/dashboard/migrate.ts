/**
 * Hosted substrate migration: move a machine's LOAD to another sandbox lane
 * while the agent, the name, and the record survive (sandbox router, hosted
 * plane). The SDK twin is `Mux.migrate()` (src/mux/router.ts); this module is
 * the same contract driven through the hosted seams -- user config instead of
 * the placement store, the bootstrap runner instead of `ensureInstalled`, the
 * provider facade instead of raw substrate handles.
 *
 * ONE source of truth for the state-move contract: MOVE_ALLOWLIST / REDERIVED
 * / lostState / MOVE_NOTES and the transport (export tar -> sha256 -> chunked
 * base64 out; writeFile -> sha256 re-check on target -> foreground untar) are
 * VALUE-imported from the compiled package ("agent-machines/mux" -- the only
 * import form Turbopack resolves; see lib/mux/placement-store.ts header), so
 * what the API reports as moved/re-derived/lost is the SAME wording the SDK
 * and CLI print, never a retyped list.
 *
 * FAIL CLOSED, always toward the source: the ORIGINAL machine is never
 * destructively touched before the commit (the single setUserConfig that
 * re-points the record). Every pre-commit failure destroys the NEW sandbox
 * (by its explicit id -- never a globally active machine, postmortem
 * 2026-05-18 item 2) and leaves the original record, placement and
 * activeMachineId byte-identical. The state is a COPY until commit, so a
 * failure never loses the load.
 *
 * Progress is the bootstrapState idiom: migrationState is persisted after
 * EVERY step (schema.ts MIGRATION_STEPS) and the dashboard polls it at the
 * existing 5s cadence -- no new progress plumbing.
 */

import { randomUUID } from "node:crypto";

// VALUES through the compiled package (build:sdk runs from web's prebuild).
import {
	MOVE_ALLOWLIST,
	MOVE_NOTES,
	REDERIVED,
	buildExportCommand,
	exportTar,
	lostState,
	probeIncludes,
	restoreTar,
	verifyMarker,
	writeMarker,
} from "agent-machines/mux";
// Types come from the source tree (erased before the bundler sees them).
import type { MigrationMarker, MoveSource, MoveTarget } from "../../../src/mux/statemove.js";

import { machineHomeForProvider } from "@/lib/bootstrap/bootstrap-log";
import { agentArtifactsPresent } from "@/lib/bootstrap/bootstrap-repair";
import {
	finalizeGatewayBootstrap,
	runWebBootstrap,
} from "@/lib/bootstrap/runner";
import { gatewayPort, probeGatewayLocal } from "@/lib/bootstrap/gateway-lifecycle";
import { createMachineForConfig } from "@/lib/dashboard/provision";
import {
	assertUsableProvisionState,
	provisionWithFailover,
} from "@/lib/mux/failover";
import { recordHostedPlacement } from "@/lib/mux/placements";
import { resolveRoute } from "@/lib/mux/route";
import { defaultMemoryBundle, resolveBundle } from "@/lib/memory/bundle";
import { bundleInstallLines } from "@/lib/memory/install";
import { getProvider, type MachineProvider } from "@/lib/providers";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { resolveMachineWorker } from "@/lib/workers/resolve";
import type {
	MachineRef,
	MigrationReport,
	MigrationState,
	MigrationStepId,
	ProviderKind,
	UserConfig,
} from "@/lib/user-config/schema";

export type MigrationSourceOption = "destroy" | "park" | "keep";

export type RunMigrationArgs = {
	machineId: string;
	to: ProviderKind;
	/** default true */
	moveState: boolean;
	/** default "destroy" -- see sourceDisposition() for the justification. */
	source: MigrationSourceOption;
	/**
	 * The tenant whose mux placement gets re-pointed after commit. REQUIRED and
	 * passed in from the route's `getEffectiveUserId()` rather than resolved
	 * here: this function runs inside `after()`, and re-resolving identity in a
	 * background task is exactly how a tenant-scoped write ends up under the
	 * wrong tenant (or under none). Required so the type system, not a reviewer,
	 * catches a call site that forgot it.
	 */
	userId: string;
};

/** The tar rides /tmp on both ends; machine-fs's ~/.agent-machines jail and
 * 8 MiB write cap do not fit tar staging, so transport is raw provider exec. */
const EXPORT_TAR_TIMEOUT_MS = 600_000;
const RESTORE_TIMEOUT_MS = 600_000;
/** 64 KiB per exec argv -- the src/lib/upload.ts ARG_MAX rationale; the
 * per-substrate exec command-length ceiling is unmeasured, so stay boring. */
const WRITE_CHUNK_CHARS = 65_536;

/** Base64 alphabet only: chunks are single-quoted into the exec command, so
 * anything else must fail closed rather than risk shell injection. */
const B64_SAFE = /^[A-Za-z0-9+/=\r\n]*$/;

/** Adapt the hosted provider exec to the mux SandboxHandle slice the
 * statemove helpers drive (they want durationMs; the facade does not report
 * one, so it is measured here). */
function execAdapter(provider: MachineProvider, machineId: string) {
	return async (
		command: string,
		options?: { timeoutMs?: number },
	): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> => {
		const start = Date.now();
		const result = await provider.exec(machineId, command, {
			timeoutMs: options?.timeoutMs,
		});
		return { ...result, durationMs: Date.now() - start };
	};
}

function sourceHandle(provider: MachineProvider, machineId: string): MoveSource {
	return { exec: execAdapter(provider, machineId) };
}

function targetHandle(provider: MachineProvider, machineId: string): MoveTarget {
	return {
		exec: execAdapter(provider, machineId),
		// The hosted MachineProvider has no writeFile primitive, so the restore
		// payload (base64 text by construction -- restoreTar encodes the tar
		// before calling) is appended in argv-sized chunks. Slow but proven:
		// base64 through single quotes cannot break out of the shell, and every
		// exec stays under the 64 KiB argv rule.
		writeFile: async (path, content) => {
			const text =
				typeof content === "string"
					? content
					: Buffer.from(content).toString("base64");
			if (!B64_SAFE.test(text)) {
				throw new Error(
					"migrate writeFile transport only carries base64 payloads; refusing shell-unsafe content",
				);
			}
			const init = await provider.exec(machineId, `rm -f ${path} && touch ${path}`, {
				timeoutMs: 30_000,
			});
			if (init.exitCode !== 0) {
				throw new Error(`could not stage ${path} on the target (exit ${init.exitCode})`);
			}
			for (let offset = 0; offset < text.length; offset += WRITE_CHUNK_CHARS) {
				const chunk = text.slice(offset, offset + WRITE_CHUNK_CHARS);
				const write = await provider.exec(
					machineId,
					`printf '%s' '${chunk}' >> ${path}`,
					{ timeoutMs: 60_000 },
				);
				if (write.exitCode !== 0) {
					throw new Error(
						`writing ${path} failed at offset ${offset} (exit ${write.exitCode})`,
					);
				}
			}
		},
	};
}

class MigrationError extends Error {
	readonly step: MigrationStepId;
	constructor(step: MigrationStepId, message: string) {
		super(message);
		this.name = "MigrationError";
		this.step = step;
	}
}

async function persistMigrationState(
	machineId: string,
	state: MigrationState,
): Promise<void> {
	await setUserConfig({
		patchMachine: { id: machineId, patch: { migrationState: state } },
	});
}

function cliVersionCommand(machine: MachineRef): string {
	const home = machineHomeForProvider(machine.providerKind);
	const bin = machine.agentKind === "codex" ? "codex" : "claude";
	return `export PATH=${home}/.npm-global/bin:${home}/.local/bin:$PATH && ${bin} --version`;
}

/**
 * Run one hosted migration to completion. Designed to run inside `after()`;
 * it never throws -- every outcome lands in migrationState, because a
 * background rejection nobody awaits is a silent failure.
 */
export async function runMachineMigration(args: RunMigrationArgs): Promise<void> {
	const startedAt = new Date().toISOString();
	const state: MigrationState = {
		phase: "running",
		step: "validate",
		startedAt,
		finishedAt: null,
		lastError: null,
		targetSubstrate: args.to,
		newMachineId: null,
		report: null,
	};

	let newMachineId: string | null = null;
	let targetProvider: MachineProvider | null = null;

	const setStep = async (step: MigrationStepId): Promise<void> => {
		state.step = step;
		await persistMigrationState(args.machineId, state);
	};

	try {
		// -- validate ---------------------------------------------------------
		await setStep("validate");
		const config = await getUserConfig();
		const machine = config.machines.find((m) => m.id === args.machineId);
		if (!machine) {
			throw new MigrationError("validate", `machine ${args.machineId} not found`);
		}
		if (machine.providerKind === args.to) {
			throw new MigrationError(
				"validate",
				`already on ${args.to}; migrate moves between substrates`,
			);
		}
		// The pinned-lane idiom (provision-machine failover:false): the target
		// lane or nothing. An uncredentialed target names its missing keys.
		const { route, skipped } = resolveRoute(config, {
			primary: args.to,
			order: [args.to],
		});
		if (route.length === 0) {
			const missing = skipped.find((entry) => entry.substrate === args.to);
			throw new MigrationError(
				"validate",
				`missing credentials for ${args.to}: ${missing?.missing.join(", ") ?? "unknown"}`,
			);
		}
		const sourceProvider = getProvider(machine.providerKind, config.providers);

		// -- provision (new record visible immediately; activate:false so the
		// user is never pointed at an unverified target) -----------------------
		await setStep("provision");
		const placement = await provisionWithFailover({
			route,
			skipped,
			primary: args.to,
			lane: {
				provision: (substrate) =>
					createMachineForConfig(config, {
						providerKind: substrate,
						agentKind: machine.agentKind,
						spec: machine.spec,
						model: machine.model,
						name: machine.name,
						gatewayProfileId: machine.gatewayProfileId,
						environmentProfileId: machine.environmentProfileId,
						activate: false,
					}),
				accept: (substrate, created) =>
					assertUsableProvisionState(substrate, created.machineId, created.state),
				teardown: async (substrate, machineId) => {
					await getProvider(substrate, config.providers).destroy(machineId);
					await setUserConfig({ removeMachine: machineId });
				},
			},
		});
		if (!placement.ok) {
			throw new MigrationError("provision", placement.error.message);
		}
		newMachineId = placement.created.machineId;
		state.newMachineId = newMachineId;
		targetProvider = getProvider(args.to, config.providers);

		// -- bootstrap (foreground inside this background task; progress rides
		// the NEW ref's bootstrapState so the fleet UI renders it unchanged) ---
		await setStep("bootstrap");
		const configAfterProvision = await getUserConfig();
		const newRef = configAfterProvision.machines.find((m) => m.id === newMachineId);
		if (!newRef) {
			throw new MigrationError("bootstrap", `provisioned ${newMachineId} but its record is missing`);
		}
		const bootstrapResult = await runWebBootstrap({
			machine: newRef,
			provider: targetProvider,
			config: configAfterProvision,
			force: false,
			onState: async (bootstrapState) => {
				await setUserConfig({
					patchMachine: { id: newRef.id, patch: { bootstrapState } },
				});
			},
		});
		await setUserConfig({
			patchMachine: {
				id: newRef.id,
				patch: { apiUrl: bootstrapResult.apiUrl, apiKey: bootstrapResult.apiKey },
			},
		});

		// -- export (the only source mutation before commit is the additive
		// marker file) ---------------------------------------------------------
		const plan = MOVE_ALLOWLIST(machine.agentKind);
		const marker: MigrationMarker = {
			name: machine.name,
			fromSubstrate: machine.providerKind,
			fromSandboxId: machine.id,
			nonce: randomUUID(),
			at: startedAt,
		};
		let moved: string[] = [];
		let movedSkipped: Array<{ path: string; reason: string }> = [];
		let bytes = 0;
		let exported: { bytes: Buffer; sha256: string } | null = null;

		if (args.moveState) {
			await setStep("export");
			// A parked source IS woken: a migration is a write, and exporting from
			// a stopped filesystem is meaningless. Best-effort -- providers whose
			// wake is a no-op just return the summary.
			await sourceProvider.wake(machine.id).catch(() => undefined);
			const source = sourceHandle(sourceProvider, machine.id);
			await writeMarker(source, marker);
			const presence = await probeIncludes(source, plan.include);
			moved = presence.present;
			movedSkipped = presence.skipped;
			const tarPath = `/tmp/am-migrate-${marker.nonce.slice(0, 8)}.tgz`;
			const tarCmd = buildExportCommand(
				{ include: presence.present, exclude: plan.exclude },
				tarPath,
			);
			const tarRun = await source.exec(tarCmd, { timeoutMs: EXPORT_TAR_TIMEOUT_MS });
			if (tarRun.exitCode !== 0) {
				throw new MigrationError(
					"export",
					`building the state tar failed (exit ${tarRun.exitCode}): ${(tarRun.stderr || tarRun.stdout).slice(-400)}`,
				);
			}
			exported = await exportTar(source, tarPath, { include: presence.present });
			bytes = exported.bytes.length;
			await source.exec(`rm -f ${tarPath}`, { timeoutMs: 30_000 }).catch(() => undefined);

			// -- restore ---------------------------------------------------------
			await setStep("restore");
			const target = targetHandle(targetProvider, newMachineId);
			await restoreTar(target, exported.bytes, {
				sha256: exported.sha256,
				agent: machine.agentKind,
				// HOME differs per substrate (/home/user vs /home/sprite vs ...);
				// restoreTar rewrites the known text configs when they differ.
				oldHome: machineHomeForProvider(machine.providerKind),
				timeoutMs: RESTORE_TIMEOUT_MS,
			});
			// The restored canonical docs are now authoritative; regenerate the
			// combined entry docs from them so claude/codex/openclaw read the
			// moved memory, not the bootstrap-time bundle.
			const worker = resolveMachineWorker(configAfterProvision, newRef);
			const bundle =
				resolveBundle(configAfterProvision, worker.memoryBundleId) ?? defaultMemoryBundle();
			await targetProvider
				.exec(newMachineId, bundleInstallLines(bundle, machine.agentKind).join("\n"), {
					timeoutMs: 60_000,
				})
				.catch(() => undefined);
			// hermes config.yaml / state.db changed under the gateway; restart it.
			if (machine.agentKind === "hermes" || machine.agentKind === "openclaw") {
				const refreshed = await finalizeGatewayBootstrap({
					machine: { ...newRef, apiUrl: bootstrapResult.apiUrl, apiKey: bootstrapResult.apiKey },
					provider: targetProvider,
					config: configAfterProvision,
					onState: async () => {},
				});
				await setUserConfig({
					patchMachine: {
						id: newRef.id,
						patch: { apiUrl: refreshed.apiUrl, apiKey: refreshed.apiKey },
					},
				});
			}
		}

		// -- verify (which check ran is part of the report) --------------------
		await setStep("verify");
		const newRefForVerify: MachineRef = {
			...newRef,
			apiUrl: bootstrapResult.apiUrl,
			apiKey: bootstrapResult.apiKey,
		};
		let probeDescription: string;
		if (machine.agentKind === "hermes" || machine.agentKind === "openclaw") {
			const port = gatewayPort(newRefForVerify);
			probeDescription = `gateway 127.0.0.1:${port}/v1/models`;
			const gatewayOk = await probeGatewayLocal(
				targetProvider,
				newMachineId,
				port,
				bootstrapResult.apiKey,
			);
			if (!gatewayOk) {
				throw new MigrationError(
					"verify",
					`${machine.agentKind} gateway on the new ${args.to} sandbox does not answer (${probeDescription})`,
				);
			}
		} else {
			probeDescription = cliVersionCommand(newRefForVerify);
			const probe = await targetProvider.exec(newMachineId, probeDescription, {
				timeoutMs: 30_000,
			});
			if (probe.exitCode !== 0) {
				throw new MigrationError(
					"verify",
					`${machine.agentKind} does not answer on the new ${args.to} sandbox (exit ${probe.exitCode})`,
				);
			}
		}
		const artifactsOk = await agentArtifactsPresent(newRefForVerify, targetProvider);
		if (!artifactsOk) {
			throw new MigrationError(
				"verify",
				`${machine.agentKind} install artifacts are missing on the new ${args.to} sandbox`,
			);
		}
		let markerVerdict: boolean | "skipped" = "skipped";
		if (args.moveState) {
			const verdict = await verifyMarker(
				targetHandle(targetProvider, newMachineId),
				marker,
			);
			if (!verdict.ok) {
				throw new MigrationError("verify", `migration marker check failed: ${verdict.reason}`);
			}
			markerVerdict = true;
		}

		// -- commit: the POINT OF NO RETURN is this ONE setUserConfig ----------
		await setStep("commit");
		// Fresh read: active machine and crons may have changed while the
		// bootstrap ran; committing against a stale snapshot would clobber them.
		const commitConfig = await getUserConfig();
		if (!commitConfig.machines.some((m) => m.id === machine.id)) {
			throw new MigrationError(
				"commit",
				"the source machine record disappeared mid-migration; refusing to commit against a record the user removed",
			);
		}
		const wasActive = commitConfig.activeMachineId === machine.id;
		const repointedCrons = commitConfig.crons.map((cron) =>
			cron.machineId === machine.id ? { ...cron, machineId: newMachineId as string } : cron,
		);
		const lost = args.moveState
			? lostState(machine.providerKind)
			: [
					...lostState(machine.providerKind),
					"the entire file-state contract: moveState:false ships no tar, so every path MOVE_ALLOWLIST names stays on the source",
				];
		const report: MigrationReport = {
			from: { providerKind: machine.providerKind, machineId: machine.id },
			to: { providerKind: args.to, machineId: newMachineId },
			state: {
				moved,
				rederived: REDERIVED(machine.agentKind),
				lost,
				skipped: movedSkipped,
				bytes,
			},
			verified: { probe: probeDescription, marker: markerVerdict },
			// Filled in by the post-commit teardown below; committed as "kept"
			// so a crash between commit and teardown reports the sandbox that
			// really still exists.
			source: { action: "kept" },
			newMachineId,
			notes: MOVE_NOTES(machine.agentKind),
		};
		state.report = report;
		const latestNewRef =
			commitConfig.machines.find((m) => m.id === newMachineId) ?? newRefForVerify;
		await setUserConfig({
			// Finalize the new ref, carrying the migration record to the machine
			// the user lands on next.
			upsertMachine: { ...latestNewRef, migrationState: { ...state } },
			// The old RECORD is archived, not removed: the page the user is
			// watching must still answer with the terminal report ("moved to
			// sprites -- N files"), and a visible archived row is destroyable
			// later (?remove=1) where a silently removed one is a 404 mid-read.
			// "keep" leaves it unarchived -- both machines remain addressable.
			patchMachine: {
				id: machine.id,
				patch: {
					migrationState: { ...state },
					...(args.source === "keep" ? {} : { archived: true }),
				},
			},
			crons: repointedCrons,
			// Active flips ONLY here, and only if the user was on the old box.
			...(wasActive ? { activeMachineId: newMachineId } : {}),
		});

		// -- placement mirror (post-commit, best-effort, reported) -------------
		// Re-point the mux ROUTER's memory of this name at the new sandbox, so
		// the SDK's `mux.connect(name)` and the dashboard agree about where the
		// machine lives. Immediately after commit and before the source
		// teardown: that is the shortest window in which the router could still
		// hand a caller a sandbox this migration is about to destroy.
		//
		// The config is RE-READ because the ambiguity guard in
		// resolvePlacementName reads the archived flag the commit above just
		// wrote -- against the pre-commit snapshot both records are live under
		// the same name and every migration would decline to record. Under
		// `source: "keep"` both really do stay live, and declining is then the
		// correct answer (see the placements.ts header).
		try {
			const postCommit = await getUserConfig();
			const mirror = await recordHostedPlacement({
				userId: args.userId,
				config: postCommit,
				machine: {
					id: newMachineId,
					name: machine.name,
					providerKind: args.to,
					agentKind: machine.agentKind,
				},
			});
			report.placement = mirror.recorded
				? { recorded: true, name: mirror.name }
				: { recorded: false, reason: mirror.reason };
		} catch (err) {
			// Bookkeeping for a second plane cannot fail a migration that has
			// already committed; the load is on the new sandbox either way.
			report.placement = {
				recorded: false,
				reason: err instanceof Error ? err.message : "placement mirror failed",
			};
		}

		// -- source disposition (post-commit, best-effort, reported, never
		// silent; a failure here does NOT fail the migration -- the load is
		// safe on the new sandbox) ---------------------------------------------
		await setStep("source-teardown").catch(() => undefined);
		if (args.source === "destroy") {
			// Default destroy: park does not exist on sprites/dedalus, and an
			// always-on substrate bills while parked -- a default that silently
			// accrues cost fails closed the wrong way. Destroy goes through the
			// provider facade so the connected-handle cache invalidates.
			try {
				// By the OLD sandbox id, never by the record's current pointer --
				// the record now names the NEW sandbox (the mux's "never
				// mux.remove(name) here" rule, hosted spelling).
				await sourceProvider.destroy(machine.id);
				report.source = { action: "destroyed" };
			} catch (err) {
				report.source = {
					action: "kept",
					error: `destroy failed; sandbox ${machine.id} on ${machine.providerKind} is orphaned: ${
						err instanceof Error ? err.message : String(err)
					}`,
				};
			}
		} else if (args.source === "park") {
			if (sourceProvider.capabilities.canSleep) {
				try {
					await sourceProvider.sleep(machine.id);
					report.source = { action: "parked" };
				} catch (err) {
					report.source = {
						action: "kept",
						error: `park failed; sandbox ${machine.id} on ${machine.providerKind} is still running: ${
							err instanceof Error ? err.message : String(err)
						}`,
					};
				}
			} else {
				report.source = {
					action: "kept",
					error: `park is not supported on ${machine.providerKind}; the source sandbox is still running`,
				};
			}
		} else {
			report.source = { action: "kept" };
		}

		state.phase = "succeeded";
		state.step = null;
		state.finishedAt = new Date().toISOString();
		state.report = report;
		// Terminal state lands on BOTH records (two writes, post-commit, both
		// best-effort: the migration already succeeded and must not be reported
		// failed because a state write hiccupped).
		await persistMigrationState(machine.id, state).catch((err) =>
			console.warn(`[migrate] terminal state write (old ref) failed:`, err),
		);
		await persistMigrationState(newMachineId, state).catch((err) =>
			console.warn(`[migrate] terminal state write (new ref) failed:`, err),
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "migration failed";
		const failedStep = err instanceof MigrationError ? err.step : state.step;

		// Pre-commit failure: destroy the NEW sandbox best-effort. The copy on
		// it is disposable -- the source still holds everything. A teardown
		// failure keeps the record VISIBLE (never an invisible orphan).
		if (newMachineId && targetProvider) {
			try {
				await targetProvider.destroy(newMachineId);
				await setUserConfig({ removeMachine: newMachineId });
			} catch (teardownErr) {
				console.warn(
					`[migrate] could not tear down ${newMachineId} after a failed migration; the record stays visible:`,
					teardownErr instanceof Error ? teardownErr.message : teardownErr,
				);
			}
		}

		state.phase = "failed";
		state.step = failedStep;
		state.finishedAt = new Date().toISOString();
		state.lastError = message;
		state.newMachineId = null;
		await persistMigrationState(args.machineId, state).catch(() => {});
		console.warn(`[migrate] migration of ${args.machineId} -> ${args.to} failed:`, message);
	}
}

/**
 * POST /api/dashboard/admin/provision-machine
 *
 * Creates a fresh machine for the calling user using their saved
 * provider credentials, appends it to their machines list, and marks
 * it as the new active machine.
 *
 * Body (all optional, falls back to wizard-saved drafts on UserConfig):
 *   { providerKind, agentKind, spec, model, name, force }
 *
 * Idempotency note: previously we refused if any machine existed.
 * The new model supports many machines per user, so we always create
 * unless the user passes the *same* (provider, agent, spec) combo
 * within the last 60 seconds (cheap dedupe to absorb double-clicks).
 *
 * Failover (ROADMAP 0.3): the requested substrate is the FIRST lane, not the
 * only one. A routable error walks on to the next credentialed lane
 * (`lib/mux/failover.ts`) instead of returning 502 on the first provider error,
 * and every lane's outcome comes back in `attempts` so the dashboard can
 * explain why a machine landed where it did.
 *
 * Health (ROADMAP pillar 6, 2026-08-04): that walk is no longer blind. The
 * calling tenant's persisted circuit breaker (`lib/mux/health.ts`, one row per
 * tenant in `mux_placements`) reorders the credentialed lanes -- healthy, then
 * degraded, then open -- and every lane's outcome is fed back into it, so a
 * substrate that is refusing requests right now stops costing a full failed
 * provisioning attempt on every create. It only ever REORDERS: a demoted lane is
 * still walked, last. Pass `failover: false` for the one-lane pin.
 *
 * Still not on this path: constraint filtering and learned selection.
 */

import { after } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { agentUsesRouter } from "@/lib/agents/upstreams";
import { getProvider } from "@/lib/providers";
import { scheduleWebBootstrap } from "@/lib/bootstrap/schedule-bootstrap";
import { createMachineForConfig } from "@/lib/dashboard/provision";
import { primeConsoleSession } from "@/lib/dashboard/terminal-session";
import { recommendArm } from "@/lib/learning/recommend";
import {
	assertUsableProvisionState,
	provisionWithFailover,
	type ProvisionAttempt,
} from "@/lib/mux/failover";
import { loadTenantHealth } from "@/lib/mux/health";
import { resolveRoute, toSubstrateKind } from "@/lib/mux/route";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import {
	AGENT_KINDS,
	DEFAULT_MACHINE_SPEC,
	PROVIDER_KINDS,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
	providerKind?: ProviderKind;
	agentKind?: AgentKind;
	spec?: MachineSpec;
	model?: string;
	name?: string;
	force?: boolean;
	/** Chosen model router (gateway profile id) for hermes/openclaw. */
	gatewayProfileId?: string;
	/** Saved environment profile whose vars should be installed on the VM. */
	environmentProfileId?: string | null;
	/** Fill omitted runtime/substrate/model/router axes from the learned policy. */
	autoRoute?: boolean;
	/** SDK/full-flow callers can own bootstrap sequencing and disable auto-start. */
	startBootstrap?: boolean;
	/**
	 * Pin the placement to `providerKind` with no backups. The escape hatch for
	 * a caller who needs THIS substrate or nothing -- mirroring the mux, where
	 * an explicitly named sandbox is a one-lane route.
	 */
	failover?: boolean;
};

function isProvider(value: unknown): value is ProviderKind {
	return (
		typeof value === "string" &&
		(PROVIDER_KINDS as ReadonlyArray<string>).includes(value)
	);
}

function isAgent(value: unknown): value is AgentKind {
	return (
		typeof value === "string" &&
		(AGENT_KINDS as ReadonlyArray<string>).includes(value)
	);
}

function asSpec(value: unknown, fallback: MachineSpec): MachineSpec {
	if (!value || typeof value !== "object") return fallback;
	const v = value as Record<string, unknown>;
	const vcpu = Number(v.vcpu);
	const mem = Number(v.memoryMib);
	const stor = Number(v.storageGib);
	if (!Number.isFinite(vcpu) || vcpu < 1 || vcpu > 16) return fallback;
	if (!Number.isFinite(mem) || mem < 512 || mem > 65_536) return fallback;
	if (!Number.isFinite(stor) || stor < 5 || stor > 200) return fallback;
	return { vcpu, memoryMib: mem, storageGib: stor };
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let body: Body = {};
	try {
		const parsed = await request.json().catch(() => ({}));
		body = (parsed ?? {}) as Body;
	} catch {
		body = {};
	}

	let config: Awaited<ReturnType<typeof getUserConfig>>;
	try {
		config = await getUserConfig();
	} catch (err) {
		const message = err instanceof Error ? err.message : "config read failed";
		return Response.json(
			{ error: "config_read_failed", message },
			{ status: 500 },
		);
	}

	const explicitModel =
		typeof body.model === "string" && body.model.trim().length > 0
			? body.model.trim()
			: undefined;
	const rec =
		body.autoRoute === true
			? await recommendArm(config, {
					runtime: isAgent(body.agentKind) ? body.agentKind : undefined,
					substrate: isProvider(body.providerKind) ? body.providerKind : undefined,
					model: explicitModel,
					routerId:
						typeof body.gatewayProfileId === "string"
							? body.gatewayProfileId
							: undefined,
				}).catch(() => null)
			: null;

	const providerKind: ProviderKind = isProvider(body.providerKind)
		? body.providerKind
		: rec?.arm.substrate ?? config.draftProviderKind;
	const agentKind: AgentKind = isAgent(body.agentKind)
		? body.agentKind
		: rec?.arm.runtime ?? config.draftAgentKind;
	const spec = asSpec(body.spec, config.draftSpec ?? DEFAULT_MACHINE_SPEC);
	const model = explicitModel ?? rec?.arm.model ?? config.draftModel;
	const gatewayProfileId =
		body.gatewayProfileId ??
		(agentUsesRouter(agentKind) ? rec?.arm.routerId ?? null : null);
	const name =
		typeof body.name === "string" && body.name.trim().length > 0
			? body.name.trim().slice(0, 80)
			: `${agentKind}-${providerKind}-${new Date()
					.toISOString()
					.slice(0, 10)}`;

	// The credential-gated route: requested lane first, then the backups, with
	// uncredentialed lanes dropped. `resolveRoute` is the provider-agnostic gate
	// (postmortem 2026-05-18, item 3) and it knows the two shapes of Vercel auth,
	// which a raw `config.providers[kind]` check does not -- an OIDC deployment
	// was reported as uncredentialed here while the router placed machines fine.
	const primary = toSubstrateKind(providerKind);
	const { route, skipped } = resolveRoute(
		config,
		body.failover === false ? { primary, order: [primary] } : { primary },
	);

	// The lane the caller ASKED for having no credentials stays a 400 with the
	// actionable message, rather than silently placing the machine somewhere the
	// user did not choose. Failover covers lanes that fail, not lanes that were
	// never authenticated.
	const primaryMissing = skipped.find((entry) => entry.substrate === primary);
	if (primaryMissing) {
		return Response.json(
			{
				error: "missing_provider_credentials",
				message: `No ${providerKind} credentials on file. Add them in /dashboard/setup step 1. Missing: ${primaryMissing.missing.join(
					", ",
				)}`,
				attempts: skipped.map(
					(entry): ProvisionAttempt => ({
						substrate: entry.substrate,
						outcome: "skipped",
						reason: `missing credentials: ${entry.missing.join(", ")}`,
					}),
				),
			},
			{ status: 400 },
		);
	}

	if (!body.force) {
		const recent = config.machines.find(
			(m) =>
				m.providerKind === providerKind &&
				m.agentKind === agentKind &&
				m.spec.vcpu === spec.vcpu &&
				m.spec.memoryMib === spec.memoryMib &&
				m.spec.storageGib === spec.storageGib &&
				Date.now() - new Date(m.createdAt).getTime() < 60_000,
		);
		if (recent) {
			return Response.json({
				ok: true,
				deduped: true,
				machineId: recent.id,
				providerKind: recent.providerKind,
				// No lane was walked, so there is nothing to explain. Present and
				// empty rather than absent, so a caller can render `attempts`
				// without special-casing the dedupe reply.
				attempts: [] as ProvisionAttempt[],
				message: "Returning the machine you just provisioned (same spec, <60s).",
			});
		}
	}

	// Read once, after the dedupe reply so a double-click costs no round trip.
	// Scoped to this user: one tenant's expired key must not open another's
	// circuit. Never throws -- an unreadable snapshot degrades to no history.
	const health = await loadTenantHealth({ tenantId: userId });

	const placement = await provisionWithFailover({
		primary,
		route,
		skipped,
		health,
		lane: {
			provision: (substrate) =>
				createMachineForConfig(config, {
					providerKind: substrate,
					agentKind,
					spec,
					model,
					name,
					gatewayProfileId,
					environmentProfileId: body.environmentProfileId ?? null,
				}),
			accept: (substrate, created) =>
				assertUsableProvisionState(substrate, created.machineId, created.state),
			teardown: async (substrate, machineId) => {
				// Explicit machineId, never a globally resolved active machine.
				await getProvider(substrate, config.providers).destroy(machineId);
				// Drop the row only once the substrate says the sandbox is gone. A
				// row kept for a sandbox we failed to destroy is how the operator
				// can still see and retry it; removing it first would turn it into
				// an invisible quota leak (docs/MUX-RESULTS.md, dedalus teardown).
				await setUserConfig({ removeMachine: machineId });
			},
		},
	});

	if (!placement.ok) {
		const { error } = placement;
		const status =
			error.kind === "missing_credentials"
				? 400
				: error.kind === "not_supported"
					? 501
					: 502;
		// Surface the real reason in Vercel logs -- the client only sees the HTTP
		// status, so an opaque 502 is otherwise undiagnosable in production.
		console.error(
			`[provision-machine] ${providerKind}/${agentKind} provision failed (${status}):`,
			error.message,
		);
		return Response.json(
			{
				error:
					status === 400 ? "missing_provider_credentials" : "provision_failed",
				message: error.message,
				attempts: placement.attempts,
			},
			{ status },
		);
	}

	const created = placement.created;
	let bootstrapScheduled = false;
	let bootstrapMessage: string | null = null;
	if (body.startBootstrap !== false) {
		try {
			const latestConfig = await getUserConfig();
			const machine = latestConfig.machines.find((m) => m.id === created.machineId);
			if (machine) {
				const provider = getProvider(machine.providerKind, latestConfig.providers);
				primeConsoleSession(provider, machine.id);
				await setUserConfig({
					patchMachine: {
						id: machine.id,
						patch: {
							bootstrapState: {
								...machine.bootstrapState,
								phase: "running",
								current: null,
								finishedAt: null,
								lastError: null,
								startedAt:
									machine.bootstrapState.startedAt ?? new Date().toISOString(),
							},
						},
					},
				});
				const scheduledConfig = await getUserConfig();
				const scheduledMachine =
					scheduledConfig.machines.find((m) => m.id === machine.id) ?? machine;
				after(() =>
					scheduleWebBootstrap(scheduledMachine, provider, scheduledConfig),
				);
				bootstrapScheduled = true;
			}
		} catch (scheduleErr) {
			bootstrapMessage =
				scheduleErr instanceof Error
					? scheduleErr.message
					: "background bootstrap could not be scheduled";
			console.warn(
				`[provision-machine] background bootstrap scheduling failed for ${created.machineId}:`,
				bootstrapMessage,
			);
		}
	}
	const baseMessage = bootstrapScheduled
		? "Machine accepted. Console is priming now; agent runtime install continues in the background."
		: body.startBootstrap === false
			? "Machine accepted. Bootstrap is waiting for the caller."
			: "Machine accepted. Console is available; run repair bootstrap from the dashboard to install the selected agent runtime.";
	// A machine that landed somewhere the caller did not ask for must say so in
	// the prose too, not only in `attempts`: the dashboard shows the message
	// before anyone opens the route detail.
	//
	// And it must say WHICH reason. Before health ordering existed there was only
	// one -- the requested lane was tried and failed -- so the message hard-coded
	// it. Health can now place a machine on a backup WITHOUT the requested lane
	// being tried at all, and "after e2b failed" would then be a plain untruth
	// about a lane that was never touched.
	const elsewhere = (): string => {
		const primaryFailed = placement.attempts.some(
			(attempt) => attempt.substrate === primary && attempt.outcome === "failed",
		);
		if (primaryFailed) {
			return `Placed on ${placement.substrate} after ${primary} failed; see attempts.`;
		}
		// Defensive: the machine EXISTS and is already recorded by this point, so
		// nothing about composing its confirmation message may throw. A breaker
		// verdict is worth a sentence, never a 500 on a successful provision.
		let verdict = "demoted by health";
		try {
			verdict = `circuit ${health.stateOf(primary)}`;
		} catch {
			// Keep the generic wording.
		}
		return `Placed on ${placement.substrate} ahead of ${primary}, whose recent failures have its ${verdict}; see attempts.`;
	};
	return Response.json({
		ok: true,
		machineId: created.machineId,
		phase: created.phase,
		state: created.state,
		// The lane the machine actually landed on, which may not be the one asked for.
		providerKind: placement.substrate,
		// Every lane the route touched, in order, with its reason.
		attempts: placement.attempts,
		bootstrapScheduled,
		bootstrapMessage,
		message:
			placement.substrate === primary ? baseMessage : `${baseMessage} ${elsewhere()}`,
	});
}

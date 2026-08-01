/**
 * Vercel Sandbox substrate, expressed as a mux `MuxSubstrate` (ROADMAP 0.2).
 *
 * Vendor calls are unchanged from the pre-facade adapter: same `@vercel/sandbox`
 * entry points, same status mapping, same credential rules. Only the shape
 * changed -- `VercelProvider` is now produced by `createMuxBackedProvider`.
 *
 * Sandboxes are persistent by default -- filesystem state auto-saves on stop
 * and resumes on the next command via `Sandbox.get()` / `getOrCreate()`.
 *
 * Auth: VERCEL_OIDC_TOKEN (automatic on Vercel) or token + teamId + projectId.
 *
 * State mapping:
 *   running     -> ready
 *   stopped     -> sleeping
 *   pending / stopping / snapshotting -> starting
 *   failed / aborted -> error
 */

import { randomUUID } from "node:crypto";

import {
	createMuxBackedProvider,
	type MuxDescription,
	type MuxExecOptions,
	type MuxExecResult,
	type MuxExecStreamEvent,
	type MuxExecStreamOptions,
	type MuxMachineState,
	type MuxSandbox,
	type MuxSubstrate,
	type MuxSubstrateBinding,
} from "./mux-facade";
import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type MachineProvider,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

const HERMES_PORT = 8642;
const OPENCLAW_PORT = 18789;
const GATEWAY_PORTS = [HERMES_PORT, OPENCLAW_PORT] as const;
const DEFAULT_SESSION_TIMEOUT_MS = 3_600_000;

export type VercelCreds = {
	token: string;
	teamId: string;
	projectId: string;
};

type SandboxCredentials = {
	token?: string;
	teamId?: string;
	projectId?: string;
};

type VercelSandboxStatus =
	| "aborted"
	| "pending"
	| "running"
	| "stopping"
	| "stopped"
	| "failed"
	| "snapshotting";

async function getSandboxClass() {
	const { Sandbox } = await import("@vercel/sandbox");
	return Sandbox;
}

function mapStatus(status: string | undefined): MuxMachineState {
	switch (status as VercelSandboxStatus) {
		case "running":
			return "ready";
		case "stopped":
			return "sleeping";
		case "pending":
		case "stopping":
		case "snapshotting":
			return "starting";
		case "failed":
		case "aborted":
			return "error";
		default:
			return "unknown";
	}
}

function classifyError(err: unknown): "missing_credentials" | "transient" | "fatal" {
	const msg = err instanceof Error ? err.message : String(err);
	if (
		msg.includes("401") ||
		msg.includes("403") ||
		msg.includes("Unauthorized") ||
		msg.includes("authentication")
	) {
		return "missing_credentials";
	}
	if (
		msg.includes("404") ||
		msg.includes("not found") ||
		msg.includes("Not Found") ||
		msg.includes("not_found")
	) {
		return "fatal";
	}
	return "transient";
}

function vercelError(operation: string, err: unknown): MachineProviderError {
	if (err instanceof MachineProviderError) return err;
	return new MachineProviderError(
		"vercel",
		classifyError(err),
		`vercel ${operation}: ${err instanceof Error ? err.message : String(err)}`,
	);
}

function bashViaBase64(command: string): string {
	const b64 = Buffer.from(command, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

function sanitizeSandboxName(raw: string): string {
	const cleaned = raw
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 63);
	return cleaned.length > 0 ? cleaned : `am-${randomUUID().slice(0, 12)}`;
}

function readEnvCredentials(): VercelCreds | null {
	const token = process.env.VERCEL_TOKEN?.trim();
	const teamId = process.env.VERCEL_TEAM_ID?.trim();
	const projectId = process.env.VERCEL_PROJECT_ID?.trim();
	if (token && teamId && projectId) {
		return { token, teamId, projectId };
	}
	return null;
}

function hasOidcCredentials(): boolean {
	return Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
}

function toCredentialParams(creds: VercelCreds | null): SandboxCredentials {
	if (!creds) return {};
	return {
		token: creds.token,
		teamId: creds.teamId,
		projectId: creds.projectId,
	};
}

/**
 * One sandbox, addressed by name. `resume` is explicit on every call: reading
 * status or deleting must not resume a stopped sandbox (that is what makes the
 * mux's `connect(id)` -> `Sandbox.get({ resume: true })` unusable for the
 * control plane's state polling -- see the mux-facade contract-gap note).
 */
function vercelSandbox(name: string, auth: () => SandboxCredentials): MuxSandbox {
	async function connect(resume: boolean) {
		const Sandbox = await getSandboxClass();
		return Sandbox.get({ ...auth(), name, resume });
	}

	return {
		id: name,

		async exec(command: string, options?: MuxExecOptions): Promise<MuxExecResult> {
			const startedAt = Date.now();
			try {
				const sandbox = await connect(true);
				const signal =
					options?.timeoutMs && options.timeoutMs > 0
						? AbortSignal.timeout(options.timeoutMs)
						: undefined;
				// Object form (not the positional sugar) so cwd/env from the mux
				// ExecOptions are actually applied instead of silently dropped.
				const result = await sandbox.runCommand({
					cmd: "bash",
					args: ["-lc", bashViaBase64(command)],
					signal,
					cwd: options?.cwd,
					env: options?.env,
				});
				return {
					stdout: await result.stdout(),
					stderr: await result.stderr(),
					exitCode: result.exitCode,
					durationMs: Date.now() - startedAt,
				};
			} catch (err) {
				// Non-zero exits arrive as an error carrying the result; return it
				// so the bootstrap runner can inspect exitCode/stderr.
				if (err && typeof err === "object" && "exitCode" in err) {
					const cmdErr = err as {
						exitCode: number;
						stdout?: () => Promise<string>;
						stderr?: () => Promise<string>;
					};
					return {
						stdout: cmdErr.stdout ? await cmdErr.stdout() : "",
						stderr: cmdErr.stderr ? await cmdErr.stderr() : "",
						exitCode: cmdErr.exitCode,
						durationMs: Date.now() - startedAt,
					};
				}
				throw vercelError(`exec failed on ${name}`, err);
			}
		},

		/**
		 * Native streaming via Vercel's `Command.logs()` async iterator. We run
		 * the command detached, relay each stdout/stderr frame as it lands, then
		 * await the exit code. (Vercel Sandbox has no post-start stdin, so this
		 * is live output only -- not an interactive PTY.)
		 */
		async *execStream(
			command: string,
			options?: MuxExecStreamOptions,
		): AsyncGenerator<MuxExecStreamEvent, void, void> {
			const timeoutMs = options?.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
			const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
			try {
				const sandbox = await connect(true);
				const cmd = await sandbox.runCommand({
					cmd: "bash",
					args: ["-lc", bashViaBase64(command)],
					detached: true,
					cwd: options?.cwd,
					env: options?.env,
				});
				for await (const log of cmd.logs({ signal })) {
					if (log.stream === "stdout") {
						yield { type: "stdout", data: log.data };
					} else {
						yield { type: "stderr", data: log.data };
					}
				}
				const finished = await cmd.wait({ signal });
				yield { type: "exit", exitCode: finished.exitCode };
			} catch (err) {
				throw vercelError(`streamExec failed on ${name}`, err);
			}
		},

		async execBackground(command: string): Promise<void> {
			try {
				const sandbox = await connect(true);
				await sandbox.runCommand({
					cmd: "bash",
					args: ["-lc", bashViaBase64(command)],
					detached: true,
				});
			} catch (err) {
				throw vercelError(`execBackground failed on ${name}`, err);
			}
		},

		async publicUrl(port: number): Promise<string | null> {
			try {
				const sandbox = await connect(true);
				return sandbox.domain(port);
			} catch (err) {
				throw vercelError(`getPublicUrl failed for ${name}:${port}`, err);
			}
		},

		async state(): Promise<MuxMachineState> {
			return (await describeVercel(name, auth)).state;
		},

		async sleep(): Promise<void> {
			try {
				// Stopping needs a live session, so this one legitimately resumes.
				const sandbox = await connect(true);
				await sandbox.stop();
			} catch (err) {
				throw vercelError(`sleep (stop) failed for ${name}`, err);
			}
		},

		async wake(): Promise<void> {
			try {
				await connect(true);
			} catch (err) {
				throw vercelError(`wake failed for ${name}`, err);
			}
		},

		async destroy(): Promise<void> {
			try {
				const sandbox = await connect(false);
				await sandbox.delete();
			} catch (err) {
				const wrapped = vercelError(`destroy failed for ${name}`, err);
				// Already gone is success -- a 404 must not strand the machine in
				// the fleet list where it keeps counting against quota.
				if (wrapped.kind === "fatal") return;
				throw wrapped;
			}
		},
	};
}

async function describeVercel(
	name: string,
	auth: () => SandboxCredentials,
): Promise<MuxDescription> {
	const Sandbox = await getSandboxClass();
	const params = auth();
	let info: { status: string; vcpus?: number; memory?: number; createdAt?: number };
	try {
		const sandbox = await Sandbox.get({ ...params, name, resume: false });
		info = {
			status: sandbox.status,
			vcpus: sandbox.vcpus,
			memory: sandbox.memory,
			createdAt: sandbox.createdAt.getTime(),
		};
	} catch {
		const projectId = params.projectId ?? process.env.VERCEL_PROJECT_ID?.trim();
		if (!projectId) {
			throw new MachineProviderError(
				"vercel",
				"fatal",
				`vercel state lookup failed for ${name}: missing projectId`,
			);
		}
		const paginator = await Sandbox.list({
			...params,
			projectId,
			namePrefix: name,
			limit: 20,
		});
		let found: typeof info | null = null;
		for await (const entry of paginator) {
			if (entry.name === name) {
				found = {
					status: entry.status,
					vcpus: entry.vcpus,
					memory: entry.memory,
					createdAt: entry.createdAt,
				};
				break;
			}
		}
		if (!found) {
			throw new MachineProviderError(
				"vercel",
				"fatal",
				`vercel sandbox not found: ${name}`,
			);
		}
		info = found;
	}
	return {
		state: mapStatus(info.status),
		rawPhase: info.status,
		spec: {
			vcpu: info.vcpus ?? 1,
			memoryMib: info.memory ?? 2048,
			storageGib: 0,
		},
		createdAt: info.createdAt ? new Date(info.createdAt).toISOString() : null,
		lastError: null,
	};
}

export function createVercelSubstrate(creds?: VercelCreds | null): MuxSubstrate {
	const resolved = creds ?? readEnvCredentials();
	const auth = (): SandboxCredentials => toCredentialParams(resolved);

	function ready(): { ok: boolean; missing: string[] } {
		if (resolved || hasOidcCredentials()) return { ok: true, missing: [] };
		return {
			ok: false,
			missing: [
				"VERCEL_TOKEN",
				"VERCEL_TEAM_ID",
				"VERCEL_PROJECT_ID",
				"VERCEL_OIDC_TOKEN (alternative to the token triple)",
			],
		};
	}

	function assertReady(): void {
		const readiness = ready();
		if (!readiness.ok) {
			throw new MachineProviderError(
				"vercel",
				"missing_credentials",
				`Vercel Sandbox credentials required: ${readiness.missing.join(", ")}`,
			);
		}
	}

	return {
		kind: "vercel",
		capabilities: {
			pty: "tmux",
			persistence: "filesystem-snapshot",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			detachedWork: "reliable",
		},
		ready,
		async create(options): Promise<MuxSandbox> {
			assertReady();
			const name = sanitizeSandboxName(
				options?.name ?? `am-${randomUUID().slice(0, 12)}`,
			);
			const vcpus = Math.min(Math.max(options?.resources?.vcpu ?? 1, 1), 8);
			try {
				const Sandbox = await getSandboxClass();
				// getOrCreate makes named creates idempotent (reattaches to a live
				// sandbox, recreates when the snapshot is gone).
				const sandbox = await Sandbox.getOrCreate({
					...auth(),
					name,
					persistent: true,
					runtime: "node24",
					resources: { vcpus },
					ports: [...GATEWAY_PORTS],
					timeout: options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
					tags: { "agent-machines": "true" },
					env: options?.env,
				});
				return vercelSandbox(sandbox.name, auth);
			} catch (err) {
				throw vercelError("provision failed", err);
			}
		},
		async connect(id: string): Promise<MuxSandbox> {
			assertReady();
			return vercelSandbox(id, auth);
		},
	};
}

function vercelBinding(creds: VercelCreds | null): MuxSubstrateBinding {
	const resolved = creds ?? readEnvCredentials();
	const auth = (): SandboxCredentials => toCredentialParams(resolved);
	return {
		kind: "vercel",
		substrate: createVercelSubstrate(creds),
		describe: (machineId) => describeVercel(machineId, auth),
		createOptions: (input: ProvisionInput) => ({
			name: input.name,
			timeoutMs: DEFAULT_SESSION_TIMEOUT_MS,
			// HOME is pinned because the bootstrap runner writes its whole tree
			// under $HOME; this is the Vercel Sandbox default home, kept explicit
			// so a runtime change cannot silently relocate the bootstrap.
			env: {
				HOME: "/vercel/sandbox",
				AGENT_KIND: input.agentKind ?? "hermes",
				AGENT_MODEL: input.model ?? "",
				...(input.env ?? {}),
			},
			resources: { vcpu: input.spec?.vcpu, memoryMib: input.spec?.memoryMib },
		}),
		// vercel has never trimmed exec output; keep it byte-exact.
		trimOutput: false,
	};
}

export class VercelProvider implements MachineProvider {
	readonly kind = "vercel" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;

	constructor(creds?: VercelCreds | null) {
		const resolved = creds ?? readEnvCredentials();
		if (!resolved && !hasOidcCredentials()) {
			throw new MachineProviderError(
				"vercel",
				"missing_credentials",
				"Vercel Sandbox credentials required: set token + teamId + projectId, or run on Vercel with OIDC.",
			);
		}
		this.facade = createMuxBackedProvider(vercelBinding(resolved));
		this.capabilities = this.facade.capabilities;
	}

	get hasCredentials(): boolean {
		return this.facade.hasCredentials;
	}

	provision(input: ProvisionInput): Promise<ProvisionResult> {
		return this.facade.provision(input);
	}

	state(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.state(machineId);
	}

	wake(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.wake(machineId);
	}

	sleep(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.sleep(machineId);
	}

	destroy(machineId: string): Promise<void> {
		return this.facade.destroy(machineId);
	}

	exec(machineId: string, command: string, options?: ExecOptions): Promise<ExecResult> {
		return this.facade.exec(machineId, command, options);
	}

	execBackground(machineId: string, command: string): Promise<void> {
		return this.facade.execBackground!(machineId, command);
	}

	streamExec(
		machineId: string,
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		return this.facade.streamExec!(machineId, command, options);
	}

	/** Never null on Vercel: the domain is derived from the sandbox name. */
	async getPublicUrl(machineId: string, port: number): Promise<string> {
		const url = await this.facade.getPublicUrl!(machineId, port);
		if (url === null) {
			throw new MachineProviderError(
				"vercel",
				"transient",
				`vercel returned no public URL for ${machineId}:${port}`,
			);
		}
		return url;
	}
}

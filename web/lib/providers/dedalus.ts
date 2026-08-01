/**
 * Dedalus substrate, expressed as a mux `MuxSubstrate` (ROADMAP 0.2).
 *
 * Vendor calls are unchanged from the pre-facade adapter: same REST paths, same
 * dual-auth headers, same adaptive exec poll, same HMAC-gate workarounds for
 * wake/sleep. Only the shape changed -- `DedalusProvider` is now produced by
 * `createMuxBackedProvider`.
 *
 * We wrap the REST API directly with `fetch` rather than importing the SDK
 * because the dashboard only needs a small read-write surface and skipping the
 * SDK keeps the Vercel function bundle tiny.
 *
 * Phase mapping:
 *   running                       -> ready
 *   starting | wake_pending |     -> starting
 *     placement_pending | accepted
 *   sleeping | sleep_pending      -> sleeping
 *   destroying                    -> destroying
 *   destroyed                     -> destroyed
 *   failed                        -> error
 *   anything else                 -> unknown
 */

import type { MachineSpec } from "@/lib/user-config/schema";

import {
	createMuxBackedProvider,
	notSupported,
	type MuxDescription,
	type MuxExecOptions,
	type MuxExecResult,
	type MuxMachineState,
	type MuxSandbox,
	type MuxSubstrate,
	type MuxSubstrateBinding,
} from "./mux-facade";
import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type MachineProvider,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

// Adaptive exec polling. The execution status endpoint is cheap, so we poll
// quickly at first (a no-op finishes in well under a second) and back off
// toward POLL_MAX_MS for long-running commands. A fixed 1s interval added a
// full second of latency to every exec round-trip -- the dominant cost in
// benchmarks and the interactive terminal alike.
const POLL_INITIAL_MS = 60;
const POLL_MAX_MS = 1000;
const POLL_BACKOFF = 1.6;
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

/**
 * Disk size requested at provision. The mux `CreateSandboxOptions` carries
 * vcpu and memory but has no disk axis, and Dedalus is the only substrate that
 * accepts one, so this adapter provisions the platform default and the binding
 * below refuses any other request instead of silently shrinking the machine.
 * Matches `DEFAULT_MACHINE_SPEC.storageGib`.
 */
const DEFAULT_STORAGE_GIB = 10;

type RawMachine = {
	machine_id: string;
	vcpu: number;
	memory_mib: number;
	storage_gib: number;
	created_at: string;
	configured_at?: string | null;
	desired_state: string;
	status: {
		phase: string;
		revision?: string | number;
		reason?: string | null;
		last_error?: string | null;
	};
};

const BENIGN_REASONS = new Set([
	"DesiredStateReached",
	"Machine already reached desired state",
]);

function mapPhase(phase: string): MuxMachineState {
	switch (phase) {
		case "running":
			return "ready";
		case "starting":
		case "wake_pending":
		case "placement_pending":
		case "accepted":
			return "starting";
		case "sleeping":
		case "sleep_pending":
			return "sleeping";
		case "destroying":
			return "destroying";
		case "destroyed":
			return "destroyed";
		case "failed":
			return "error";
		default:
			return "unknown";
	}
}

function lastError(raw: RawMachine): string | null {
	const value = raw.status.last_error ?? raw.status.reason ?? null;
	if (!value) return null;
	if (BENIGN_REASONS.has(value)) return null;
	return value;
}

function summarize(raw: RawMachine): ProviderMachineSummary {
	return {
		id: raw.machine_id,
		state: mapPhase(raw.status.phase),
		rawPhase: raw.status.phase,
		spec: {
			vcpu: raw.vcpu,
			memoryMib: raw.memory_mib,
			storageGib: raw.storage_gib,
		},
		createdAt: raw.created_at,
		lastError: lastError(raw),
	};
}

function describeRaw(raw: RawMachine): MuxDescription {
	return {
		state: mapPhase(raw.status.phase),
		rawPhase: raw.status.phase,
		spec: {
			vcpu: raw.vcpu,
			memoryMib: raw.memory_mib,
			storageGib: raw.storage_gib,
		},
		createdAt: raw.created_at,
		lastError: lastError(raw),
	};
}

type ExecRaw = {
	execution_id: string;
	status: "queued" | "running" | "succeeded" | "failed" | "expired" | "cancelled";
	exit_code?: number | null;
};

type ExecOutputRaw = {
	stdout?: string;
	stderr?: string;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DedalusCreds = {
	apiKey: string;
	baseUrl?: string;
};

/** REST surface. One auth path, one error taxonomy. */
class DedalusRest {
	readonly baseUrl: string;

	constructor(
		private readonly apiKey: string,
		baseUrl?: string,
	) {
		this.baseUrl = (baseUrl ?? "https://dcs.dedaluslabs.ai").trim().replace(/\/$/, "");
	}

	async fetch(path: string, init?: RequestInit): Promise<Response> {
		// Dedalus auth: send BOTH `Authorization: Bearer <key>` (used by the
		// wake/sleep "internal route" signature check) AND `X-API-Key` for
		// compatibility with older endpoints. The SDK uses Bearer; the dashboard
		// kept getting 401 "missing internal route signature" with X-API-Key
		// alone.
		//
		// `Idempotency-Key` is required on mutating requests so retried
		// operations don't double-spend. UUID per call -- the SDK does the same.
		// Caller can override by passing the header explicitly when retrying the
		// same logical operation.
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
			"X-API-Key": this.apiKey,
			"Content-Type": "application/json",
			...(init?.headers as Record<string, string> | undefined),
		};
		const method = (init?.method ?? "GET").toUpperCase();
		if (method !== "GET" && method !== "HEAD" && !headers["Idempotency-Key"]) {
			headers["Idempotency-Key"] = crypto.randomUUID();
		}
		return fetch(`${this.baseUrl}${path}`, { ...init, headers, cache: "no-store" });
	}

	async getRaw(machineId: string): Promise<RawMachine> {
		const response = await this.fetch(`/v1/machines/${machineId}`);
		if (!response.ok) {
			throw new MachineProviderError(
				"dedalus",
				response.status === 404 ? "fatal" : "transient",
				`dedalus ${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}
		const text = await response.text();
		if (!text) {
			throw new MachineProviderError(
				"dedalus",
				"transient",
				`dedalus ${response.status}: empty response body for machine ${machineId}`,
			);
		}
		try {
			return JSON.parse(text) as RawMachine;
		} catch {
			throw new MachineProviderError(
				"dedalus",
				"transient",
				`dedalus ${response.status}: malformed JSON: ${text.slice(0, 200)}`,
			);
		}
	}
}

function dedalusSandbox(machineId: string, rest: DedalusRest): MuxSandbox {
	return {
		id: machineId,

		async exec(command: string, options?: MuxExecOptions): Promise<MuxExecResult> {
			const startedAt = Date.now();
			const timeoutMs = options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
			const create = await rest.fetch(`/v1/machines/${machineId}/executions`, {
				method: "POST",
				body: JSON.stringify({
					command: ["/bin/bash", "-c", command],
					timeout_ms: timeoutMs,
				}),
			});
			if (!create.ok) {
				throw new MachineProviderError(
					"dedalus",
					"transient",
					`exec create ${create.status}: ${(await create.text()).slice(0, 200)}`,
				);
			}
			const created = (await create.json()) as ExecRaw;

			const deadline = Date.now() + timeoutMs + 5_000;
			let current = created;
			let pollInterval = POLL_INITIAL_MS;
			while (
				current.status !== "succeeded" &&
				current.status !== "failed" &&
				current.status !== "expired" &&
				current.status !== "cancelled"
			) {
				if (Date.now() > deadline) {
					throw new MachineProviderError(
						"dedalus",
						"transient",
						`exec poll timed out after ${timeoutMs}ms: ${command.slice(0, 80)}`,
					);
				}
				await sleep(pollInterval);
				pollInterval = Math.min(POLL_MAX_MS, Math.round(pollInterval * POLL_BACKOFF));
				const poll = await rest.fetch(
					`/v1/machines/${machineId}/executions/${created.execution_id}`,
				);
				if (!poll.ok) {
					throw new MachineProviderError(
						"dedalus",
						"transient",
						`exec poll ${poll.status}: ${(await poll.text()).slice(0, 200)}`,
					);
				}
				current = (await poll.json()) as ExecRaw;
			}

			const out = await rest.fetch(
				`/v1/machines/${machineId}/executions/${created.execution_id}/output`,
			);
			const output: ExecOutputRaw = out.ok ? ((await out.json()) as ExecOutputRaw) : {};
			const exitCode = current.exit_code ?? (current.status === "succeeded" ? 0 : 1);
			return {
				stdout: output.stdout ?? "",
				stderr: output.stderr ?? "",
				exitCode,
				durationMs: Date.now() - startedAt,
			};
		},

		/**
		 * Dedalus exposes execution output only after the execution reaches a
		 * terminal status, so there is no incremental stream to relay. The
		 * substrate declares `streamingExec: false` and the facade therefore
		 * omits `streamExec` entirely, which is what makes
		 * `lib/dashboard/exec-stream.ts` fall back to log-tail polling.
		 */
		execStream(): AsyncGenerator<never, void, void> {
			throw notSupported("dedalus", "incremental exec streaming");
		},

		/**
		 * Submit work without polling for completion. Interactive terminal input
		 * only needs Dedalus to accept the tmux send-keys command; waiting for
		 * status and output added several provider round-trips per input batch.
		 */
		async execBackground(command: string): Promise<void> {
			const create = await rest.fetch(`/v1/machines/${machineId}/executions`, {
				method: "POST",
				body: JSON.stringify({
					command: ["/bin/bash", "-c", command],
					timeout_ms: DEFAULT_EXEC_TIMEOUT_MS,
				}),
			});
			if (!create.ok) {
				throw new MachineProviderError(
					"dedalus",
					"transient",
					`background exec create ${create.status}: ${(await create.text()).slice(0, 200)}`,
				);
			}
		},

		publicUrl(port: number): Promise<string | null> {
			return createPreview(rest, machineId, port);
		},

		async state(): Promise<MuxMachineState> {
			return mapPhase((await rest.getRaw(machineId)).status.phase);
		},

		async sleep(): Promise<void> {
			const raw = await rest.getRaw(machineId);
			if (raw.status.phase !== "running") return;
			// Like /wake, POST /v1/machines/<id>/sleep is an internal lifecycle
			// route guarded by HMAC signing on the dev fleet -- public API keys
			// return 401 "missing internal route signature". We still attempt the
			// call (older deployments accept it) but swallow that specific 401
			// instead of throwing: every Dedalus machine has `autosleep_seconds`
			// (default 300s) so the machine will sleep on its own once traffic
			// stops. The "sleep" button then reads as "sleep sooner" rather than
			// "sleep at all", which is consistent with the platform.
			const revision = raw.status.revision;
			if (revision === undefined || revision === null) {
				throw new MachineProviderError(
					"dedalus",
					"fatal",
					"machine has no revision token; cannot submit sleep",
				);
			}
			const response = await rest.fetch(`/v1/machines/${machineId}/sleep`, {
				method: "POST",
				headers: { "If-Match": String(revision) },
			});
			if (!response.ok) {
				const text = (await response.text()).slice(0, 400);
				if (response.status === 401 && text.includes("internal route signature")) {
					console.warn(
						`[dedalus] sleep blocked by HMAC gate; relying on autosleep (${machineId})`,
					);
					return;
				}
				throw new MachineProviderError(
					"dedalus",
					"transient",
					`sleep ${response.status}: ${text.slice(0, 200)}`,
				);
			}
		},

		async wake(): Promise<void> {
			const raw = await rest.getRaw(machineId);
			const phase = raw.status.phase;
			if (phase === "running" || phase === "wake_pending" || phase === "starting") {
				return;
			}
			if (phase !== "sleeping") {
				throw new MachineProviderError(
					"dedalus",
					"fatal",
					`cannot wake machine in phase '${phase}'; expected 'sleeping'`,
				);
			}
			// Why not POST /v1/machines/<id>/wake?
			//
			// The Dedalus controlplane classifies POST /wake (and /sleep, /admit,
			// /purge) as INTERNAL LIFECYCLE ROUTES guarded by an HMAC signing
			// middleware (see `internal_route_auth.go`). Public API keys reliably
			// 401 with "missing internal route signature" on those paths; the
			// official SDK hits the same wall.
			//
			// The supported public path is to submit ANY execution against the
			// sleeping machine. The execution scheduler internally calls the
			// HMAC-signed admit/wake gate, and the machine transitions from
			// sleeping -> wake_pending -> starting -> running. We submit a fast
			// no-op (`/bin/true`) and don't wait for it to complete; the
			// desired_state flip is what we care about.
			const exec = await rest.fetch(`/v1/machines/${machineId}/executions`, {
				method: "POST",
				headers: { "Idempotency-Key": crypto.randomUUID() },
				body: JSON.stringify({ command: ["/bin/true"], timeout_ms: 5000 }),
			});
			if (!exec.ok) {
				throw new MachineProviderError(
					"dedalus",
					"transient",
					`wake-via-exec ${exec.status}: ${(await exec.text()).slice(0, 200)}`,
				);
			}
		},

		async destroy(): Promise<void> {
			const raw = await rest.getRaw(machineId);
			if (raw.status.phase === "destroyed") return;
			const revision = raw.status.revision;
			if (revision === undefined || revision === null) return;
			const response = await rest.fetch(`/v1/machines/${machineId}`, {
				method: "DELETE",
				headers: { "If-Match": String(revision) },
			});
			if (!response.ok && response.status !== 404) {
				throw new MachineProviderError(
					"dedalus",
					"transient",
					`destroy ${response.status}: ${(await response.text()).slice(0, 200)}`,
				);
			}
		},
	};
}

/**
 * Create or reuse a Dedalus preview URL for a port. Preview URLs are
 * platform-managed and survive sleep/wake -- unlike cloudflared quick tunnels
 * which die on sleep. Returns null if previews aren't configured for the org.
 */
async function createPreview(
	rest: DedalusRest,
	machineId: string,
	port: number,
): Promise<string | null> {
	try {
		const list = await rest.fetch(`/v1/machines/${machineId}/previews`);
		if (list.ok) {
			const body = (await list.json()) as {
				items?: Array<{ port: number; status: string; url: string }>;
			};
			const match = body.items?.find((p) => p.port === port && p.status === "ready");
			if (match?.url) return match.url;
		}

		const create = await rest.fetch(`/v1/machines/${machineId}/previews`, {
			method: "POST",
			body: JSON.stringify({ port, protocol: "http", visibility: "public" }),
		});
		if (create.ok) {
			const body = (await create.json()) as { url?: string };
			if (body.url) return body.url;
		}
	} catch {
		// Previews not available for this org -- fall back to cloudflared.
	}
	return null;
}

export function createDedalusSubstrate(creds: {
	apiKey?: string;
	baseUrl?: string;
}): MuxSubstrate {
	const apiKey = creds.apiKey?.trim() || undefined;
	const rest = apiKey ? new DedalusRest(apiKey, creds.baseUrl) : null;

	function requireRest(): DedalusRest {
		if (!rest) {
			throw new MachineProviderError(
				"dedalus",
				"missing_credentials",
				"DEDALUS_API_KEY is required to talk to the Dedalus provider.",
			);
		}
		return rest;
	}

	return {
		kind: "dedalus",
		capabilities: {
			pty: "tmux",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			// The execution API exposes output only after the command finishes.
			streamingExec: false,
			detachedWork: "reliable",
		},
		ready() {
			return apiKey ? { ok: true, missing: [] } : { ok: false, missing: ["DEDALUS_API_KEY"] };
		},
		async create(options): Promise<MuxSandbox> {
			const api = requireRest();
			const response = await api.fetch("/v1/machines", {
				method: "POST",
				body: JSON.stringify({
					vcpu: options?.resources?.vcpu ?? 1,
					memory_mib: options?.resources?.memoryMib ?? 2048,
					storage_gib: DEFAULT_STORAGE_GIB,
				}),
			});
			if (!response.ok) {
				const text = (await response.text()).slice(0, 400);
				throw new MachineProviderError(
					"dedalus",
					response.status >= 500 ? "transient" : "fatal",
					`dedalus provision ${response.status}: ${text}`,
				);
			}
			const raw = (await response.json()) as RawMachine;
			return dedalusSandbox(raw.machine_id, api);
		},
		async connect(id: string): Promise<MuxSandbox> {
			return dedalusSandbox(id, requireRest());
		},
	};
}

function dedalusBinding(creds: DedalusCreds): MuxSubstrateBinding {
	const rest = new DedalusRest(creds.apiKey, creds.baseUrl);
	return {
		kind: "dedalus",
		substrate: createDedalusSubstrate(creds),
		describe: async (machineId) => describeRaw(await rest.getRaw(machineId)),
		createOptions: (input: ProvisionInput) => {
			const storageGib = input.spec?.storageGib ?? DEFAULT_STORAGE_GIB;
			if (storageGib !== DEFAULT_STORAGE_GIB) {
				// Fail closed rather than shrink the machine behind the user's
				// back. Removing this needs a disk axis on the mux
				// CreateSandboxOptions (see the mux-facade contract-gap note).
				throw notSupported(
					"dedalus",
					`a ${storageGib} GiB disk: the shared substrate contract carries vcpu and memory only, so provisioning is pinned to ${DEFAULT_STORAGE_GIB} GiB`,
				);
			}
			return {
				name: input.name,
				env: input.env,
				resources: { vcpu: input.spec?.vcpu, memoryMib: input.spec?.memoryMib },
			};
		},
		// This adapter has always trimmed dedalus output; `readTextFile` in
		// lib/storage/machine-fs.ts compares stdout to the exact `__MISSING__`.
		trimOutput: true,
	};
}

export class DedalusProvider implements MachineProvider {
	readonly kind = "dedalus" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;
	private readonly rest: DedalusRest;

	constructor(creds: DedalusCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"dedalus",
				"missing_credentials",
				"DEDALUS_API_KEY is required to talk to the Dedalus provider.",
			);
		}
		this.rest = new DedalusRest(creds.apiKey, creds.baseUrl);
		this.facade = createMuxBackedProvider(dedalusBinding(creds));
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

	/**
	 * Dedalus-native preview URL. `lib/bootstrap/runner.ts` feature-detects
	 * this (`"createPreview" in provider`) before falling back to exec-only
	 * gateway access, so it stays on the public surface.
	 */
	createPreview(machineId: string, port: number): Promise<string | null> {
		return createPreview(this.rest, machineId, port);
	}
}

export function _summarize(raw: RawMachine): ProviderMachineSummary {
	return summarize(raw);
}

// Re-exported so route helpers that need to coerce a phase string keep the
// canonical mapping in one place.
export { mapPhase as mapDedalusPhase };

// MachineSpec import unused at runtime; re-export keeps typecheck happy when
// downstream files mirror this module's dependency graph.
export type { MachineSpec };

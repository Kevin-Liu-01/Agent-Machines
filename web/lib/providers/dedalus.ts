/**
 * Dedalus provider implementation.
 *
 * Wraps the Dedalus REST API directly with `fetch` -- we don't import
 * the full SDK because the dashboard only needs a small read-write
 * surface and skipping the SDK keeps the Vercel function bundle tiny.
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
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type MachineProvider,
	type MachineState,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

const POLL_INTERVAL_MS = 1000;
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

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

function mapPhase(phase: string): MachineState {
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
		lastError: raw.status.last_error ?? raw.status.reason ?? null,
	};
}

type ExecRaw = {
	execution_id: string;
	status:
		| "queued"
		| "running"
		| "succeeded"
		| "failed"
		| "expired"
		| "cancelled";
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

export class DedalusProvider implements MachineProvider {
	readonly kind = "dedalus" as const;
	private readonly apiKey: string;
	private readonly baseUrl: string;

	constructor(creds: DedalusCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"dedalus",
				"missing_credentials",
				"DEDALUS_API_KEY is required to talk to the Dedalus provider.",
			);
		}
		this.apiKey = creds.apiKey;
		this.baseUrl = (creds.baseUrl ?? "https://dcs.dedaluslabs.ai")
			.trim()
			.replace(/\/$/, "");
	}

	get hasCredentials(): boolean {
		return Boolean(this.apiKey);
	}

	private async fetch(
		path: string,
		init?: RequestInit,
	): Promise<Response> {
		// Dedalus requires `Idempotency-Key` on every POST so retried
		// requests don't double-spend. Generate a UUID per call -- the
		// SDK does the same. Caller can override by passing the header
		// explicitly (useful when the same logical operation needs to
		// be retried with the same key).
		const headers: Record<string, string> = {
			"X-API-Key": this.apiKey,
			"Content-Type": "application/json",
			...(init?.headers as Record<string, string> | undefined),
		};
		const method = (init?.method ?? "GET").toUpperCase();
		if (method === "POST" && !headers["Idempotency-Key"]) {
			headers["Idempotency-Key"] = crypto.randomUUID();
		}
		return fetch(`${this.baseUrl}${path}`, {
			...init,
			headers,
			cache: "no-store",
		});
	}

	private async getRaw(machineId: string): Promise<RawMachine> {
		const response = await this.fetch(`/v1/machines/${machineId}`);
		if (!response.ok) {
			throw new MachineProviderError(
				"dedalus",
				response.status === 404 ? "fatal" : "transient",
				`dedalus ${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}
		return (await response.json()) as RawMachine;
	}

	async provision(input: ProvisionInput): Promise<ProvisionResult> {
		const response = await this.fetch("/v1/machines", {
			method: "POST",
			body: JSON.stringify({
				vcpu: input.spec.vcpu,
				memory_mib: input.spec.memoryMib,
				storage_gib: input.spec.storageGib,
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
		return {
			id: raw.machine_id,
			state: mapPhase(raw.status.phase),
			rawPhase: raw.status.phase,
		};
	}

	async state(machineId: string): Promise<ProviderMachineSummary> {
		return summarize(await this.getRaw(machineId));
	}

	async wake(machineId: string): Promise<ProviderMachineSummary> {
		const raw = await this.getRaw(machineId);
		if (
			raw.status.phase === "running" ||
			raw.status.phase === "wake_pending" ||
			raw.status.phase === "starting"
		) {
			return summarize(raw);
		}
		if (raw.status.phase !== "sleeping") {
			throw new MachineProviderError(
				"dedalus",
				"fatal",
				`cannot wake machine in phase '${raw.status.phase}'; expected 'sleeping'`,
			);
		}
		const revision = raw.status.revision;
		if (revision === undefined || revision === null) {
			throw new MachineProviderError(
				"dedalus",
				"fatal",
				"machine has no revision token; cannot submit wake",
			);
		}
		const response = await this.fetch(`/v1/machines/${machineId}/wake`, {
			method: "POST",
			headers: { "If-Match": String(revision) },
		});
		if (!response.ok) {
			throw new MachineProviderError(
				"dedalus",
				"transient",
				`wake ${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}
		return summarize(await this.getRaw(machineId));
	}

	async sleep(machineId: string): Promise<ProviderMachineSummary> {
		const raw = await this.getRaw(machineId);
		if (raw.status.phase !== "running") return summarize(raw);
		const revision = raw.status.revision;
		if (revision === undefined || revision === null) {
			throw new MachineProviderError(
				"dedalus",
				"fatal",
				"machine has no revision token; cannot submit sleep",
			);
		}
		const response = await this.fetch(`/v1/machines/${machineId}/sleep`, {
			method: "POST",
			headers: { "If-Match": String(revision) },
		});
		if (!response.ok) {
			throw new MachineProviderError(
				"dedalus",
				"transient",
				`sleep ${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}
		return summarize(await this.getRaw(machineId));
	}

	async destroy(machineId: string): Promise<void> {
		const raw = await this.getRaw(machineId);
		if (raw.status.phase === "destroyed") return;
		const revision = raw.status.revision;
		if (revision === undefined || revision === null) return;
		const response = await this.fetch(`/v1/machines/${machineId}`, {
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
	}

	async exec(
		machineId: string,
		command: string,
		options: ExecOptions = {},
	): Promise<ExecResult> {
		const timeoutMs = options.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
		const create = await this.fetch(
			`/v1/machines/${machineId}/executions`,
			{
				method: "POST",
				body: JSON.stringify({
					command: ["/bin/bash", "-c", command],
					timeout_ms: timeoutMs,
				}),
			},
		);
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
			await sleep(POLL_INTERVAL_MS);
			const poll = await this.fetch(
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

		const out = await this.fetch(
			`/v1/machines/${machineId}/executions/${created.execution_id}/output`,
		);
		const output: ExecOutputRaw = out.ok
			? ((await out.json()) as ExecOutputRaw)
			: {};
		const exitCode =
			current.exit_code ?? (current.status === "succeeded" ? 0 : 1);
		return {
			stdout: (output.stdout ?? "").trim(),
			stderr: (output.stderr ?? "").trim(),
			exitCode,
		};
	}
}

export function _summarize(raw: RawMachine): ProviderMachineSummary {
	return summarize(raw);
}

// Re-exported so route helpers that need to coerce a phase string keep
// the canonical mapping in one place.
export { mapPhase as mapDedalusPhase };

// MachineSpec import unused at runtime; re-export keeps typecheck happy
// when downstream files mirror this module's dependency graph.
export type { MachineSpec };

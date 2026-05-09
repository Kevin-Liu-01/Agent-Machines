/**
 * Server-side Dedalus REST helpers.
 *
 * We talk to Dedalus directly with `fetch` instead of pulling in the full
 * `dedalus` SDK because the dashboard only needs read-only machine state.
 * Skipping the SDK keeps the Vercel function bundle small and the auth
 * surface obvious -- one header, one base URL, one endpoint per call.
 *
 * Multi-tenant: every helper takes a resolved `DedalusEnv` from
 * `getDedalusEnvForUser()` (Clerk metadata, with env fallback). The
 * helpers themselves never reach into `process.env`.
 */

import { getDedalusEnvForUser } from "@/lib/user-config/clerk";

import type { MachinePhase, MachineSummary } from "./types";

export type DedalusEnv = {
	apiKey: string;
	baseUrl: string;
	machineId: string;
};

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
		last_transition_at?: string | null;
		last_progress_at?: string | null;
	};
};

const PHASE_ALLOW: ReadonlyArray<MachinePhase> = [
	"running",
	"sleeping",
	"starting",
	"wake_pending",
	"sleep_pending",
	"placement_pending",
	"accepted",
	"failed",
	"destroyed",
	"destroying",
];

function asPhase(value: string): MachinePhase {
	if ((PHASE_ALLOW as ReadonlyArray<string>).includes(value)) {
		return value as MachinePhase;
	}
	return "unknown";
}

function asDesired(value: string): MachineSummary["desired"] {
	if (value === "running" || value === "sleeping" || value === "destroyed") {
		return value;
	}
	return "unknown";
}

async function fetchRawMachine(env: DedalusEnv): Promise<RawMachine> {
	const response = await fetch(`${env.baseUrl}/v1/machines/${env.machineId}`, {
		headers: { "X-API-Key": env.apiKey },
		cache: "no-store",
	});
	if (!response.ok) {
		throw new Error(
			`dedalus ${response.status}: ${(await response.text()).slice(0, 200)}`,
		);
	}
	return (await response.json()) as RawMachine;
}

function summarize(raw: RawMachine): MachineSummary {
	return {
		machineId: raw.machine_id,
		phase: asPhase(raw.status.phase),
		desired: asDesired(raw.desired_state),
		vcpu: raw.vcpu,
		memoryMib: raw.memory_mib,
		storageGib: raw.storage_gib,
		createdAt: raw.created_at,
		configuredAt: raw.configured_at ?? null,
		reason: raw.status.last_error ?? raw.status.reason ?? null,
		statusReason: raw.status.reason ?? null,
		lastTransitionAt: raw.status.last_transition_at ?? null,
		lastProgressAt: raw.status.last_progress_at ?? null,
	};
}

export async function fetchMachineSummary(): Promise<MachineSummary> {
	const env = await getDedalusEnvForUser();
	return summarize(await fetchRawMachine(env));
}

/**
 * Wake a sleeping machine. Idempotent: if already running, returns the
 * current summary without calling the API; if mid-transition, returns
 * whatever phase the machine is in so the UI can keep polling.
 *
 * Wake is a state-transition request -- Dedalus accepts it asynchronously
 * and the machine moves through `wake_pending` -> `starting` -> `running`.
 * We return immediately after submitting; the caller polls
 * `/api/dashboard/machine` to follow the transition.
 */
export async function wakeMachine(): Promise<MachineSummary> {
	const env = await getDedalusEnvForUser();
	const raw = await fetchRawMachine(env);
	if (
		raw.status.phase === "running" ||
		raw.status.phase === "wake_pending" ||
		raw.status.phase === "starting"
	) {
		return summarize(raw);
	}
	if (raw.status.phase !== "sleeping") {
		throw new Error(
			`cannot wake machine in phase '${raw.status.phase}'; expected 'sleeping'`,
		);
	}
	const revision = raw.status.revision;
	if (revision === undefined || revision === null) {
		throw new Error("machine has no revision token; cannot submit wake");
	}
	const response = await fetch(
		`${env.baseUrl}/v1/machines/${env.machineId}/wake`,
		{
			method: "POST",
			headers: {
				"X-API-Key": env.apiKey,
				"If-Match": String(revision),
			},
		},
	);
	if (!response.ok) {
		throw new Error(
			`wake ${response.status}: ${(await response.text()).slice(0, 200)}`,
		);
	}
	return summarize(await fetchRawMachine(env));
}

/**
 * Sleep a running machine. Idempotent: returns the current summary
 * unchanged if the machine is already in any non-running state.
 */
export async function sleepMachine(): Promise<MachineSummary> {
	const env = await getDedalusEnvForUser();
	const raw = await fetchRawMachine(env);
	if (raw.status.phase !== "running") return summarize(raw);
	const revision = raw.status.revision;
	if (revision === undefined || revision === null) {
		throw new Error("machine has no revision token; cannot submit sleep");
	}
	const response = await fetch(
		`${env.baseUrl}/v1/machines/${env.machineId}/sleep`,
		{
			method: "POST",
			headers: {
				"X-API-Key": env.apiKey,
				"If-Match": String(revision),
			},
		},
	);
	if (!response.ok) {
		throw new Error(
			`sleep ${response.status}: ${(await response.text()).slice(0, 200)}`,
		);
	}
	return summarize(await fetchRawMachine(env));
}

/**
 * Server-side Dedalus REST helpers.
 *
 * We talk to Dedalus directly with `fetch` instead of pulling in the full
 * `dedalus` SDK because the dashboard only needs read-only machine state.
 * Skipping the SDK keeps the Vercel function bundle small and the auth
 * surface obvious -- one header, one base URL, one endpoint per call.
 */

import type { MachinePhase, MachineSummary } from "./types";

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
		reason?: string | null;
		last_error?: string | null;
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

function getEnv() {
	const apiKey = process.env.DEDALUS_API_KEY?.trim();
	const baseUrl = (process.env.DEDALUS_BASE_URL ?? "https://dcs.dedaluslabs.ai")
		.trim()
		.replace(/\/$/, "");
	const machineId = process.env.HERMES_MACHINE_ID?.trim();
	if (!apiKey) throw new Error("DEDALUS_API_KEY is not set");
	if (!machineId) throw new Error("HERMES_MACHINE_ID is not set");
	return { apiKey, baseUrl, machineId };
}

export async function fetchMachineSummary(): Promise<MachineSummary> {
	const { apiKey, baseUrl, machineId } = getEnv();
	const response = await fetch(`${baseUrl}/v1/machines/${machineId}`, {
		headers: { "X-API-Key": apiKey },
		cache: "no-store",
	});
	if (!response.ok) {
		throw new Error(
			`dedalus ${response.status}: ${(await response.text()).slice(0, 200)}`,
		);
	}
	const raw = (await response.json()) as RawMachine;
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
	};
}

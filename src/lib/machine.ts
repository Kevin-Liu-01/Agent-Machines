/**
 * Machine lifecycle helpers: create, find, wait, sleep, wake, destroy.
 *
 * The deploy command treats machines as cattle when there's no state file,
 * but as pets once one is recorded -- so a re-deploy reuses the same machine
 * (waking it from sleep if needed) instead of provisioning a fresh one.
 */

import type Dedalus from "dedalus";
import type { Machine } from "dedalus/resources/machines/machines";

const POLL_MS = 2000;
const WAKE_GRACE_MS = 5000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Transient infra errors observed in the wild on this org's Dedalus dev fleet:
 *   - SNAPSHOT_LAUNCH_HYPERVISOR_CONNECT_FAILED -- DHV socket not ready
 *   - STORAGE_DAEMON_API_ERROR (HTTP 500 during provision)
 *   - "machine launch throttle exhausted on this host"
 *   - 503 placement_pending stalls
 * The scheduler picks a different host on a fresh request, so the cure is
 * destroy-the-failed-machine-and-create-again. We give it three attempts
 * before surfacing the error; quota errors are NOT retried (those need a
 * `npm run destroy` first).
 */
const TRANSIENT_PATTERNS = [
	"SNAPSHOT_LAUNCH_HYPERVISOR_CONNECT_FAILED",
	"STORAGE_DAEMON_API_ERROR",
	"machine launch throttle exhausted",
	"placement_pending",
] as const;

function isTransient(message: string): boolean {
	return TRANSIENT_PATTERNS.some((p) => message.includes(p));
}

async function destroyQuiet(client: Dedalus, machineId: string): Promise<void> {
	try {
		const m = await getMachine(client, machineId);
		if (m.status.phase === "destroyed") return;
		await client.machines.delete({
			machine_id: machineId,
			"If-Match": m.status.revision,
		});
	} catch {
		// Best-effort cleanup; we're already on a failure path.
	}
}

export type CreateMachineOptions = {
	maxAttempts?: number;
	onAttempt?: (info: {
		attempt: number;
		machineId: string;
		event: "created" | "transient_retry" | "fatal";
		message?: string;
	}) => void;
};

export async function createMachine(
	client: Dedalus,
	config: { vcpu: number; memoryMib: number; storageGib: number },
	options: CreateMachineOptions = {},
): Promise<Machine> {
	const maxAttempts = options.maxAttempts ?? 5;
	const onAttempt = options.onAttempt;
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const machine = await client.machines.create({
			vcpu: config.vcpu,
			memory_mib: config.memoryMib,
			storage_gib: config.storageGib,
		});
		onAttempt?.({
			attempt,
			machineId: machine.machine_id,
			event: "created",
		});
		try {
			return await waitForRunning(client, machine.machine_id);
		} catch (err) {
			lastError = err;
			const message = err instanceof Error ? err.message : String(err);
			const transient = isTransient(message);
			if (!transient || attempt === maxAttempts) {
				onAttempt?.({
					attempt,
					machineId: machine.machine_id,
					event: "fatal",
					message,
				});
				throw err;
			}
			onAttempt?.({
				attempt,
				machineId: machine.machine_id,
				event: "transient_retry",
				message,
			});
			// Transient placement failure: destroy this dead-on-arrival
			// machine so we don't burn quota, then back off and retry.
			await destroyQuiet(client, machine.machine_id);
			await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
		}
	}
	throw lastError ?? new Error("machine create failed for an unknown reason");
}

export async function getMachine(
	client: Dedalus,
	machineId: string,
): Promise<Machine> {
	return client.machines.retrieve({ machine_id: machineId });
}

/** Wait until the machine reaches `running`, with a graceful failure surface. */
export async function waitForRunning(
	client: Dedalus,
	machineId: string,
	onPhase?: (phase: string) => void,
): Promise<Machine> {
	let machine = await getMachine(client, machineId);
	let lastPhase = "";
	while (machine.status.phase !== "running") {
		if (
			machine.status.phase === "failed" ||
			machine.status.phase === "destroyed"
		) {
			throw new Error(
				`Machine ${machineId} entered ${machine.status.phase}: ${machine.status.last_error ?? machine.status.reason}`,
			);
		}
		if (machine.status.phase !== lastPhase) {
			onPhase?.(machine.status.phase);
			lastPhase = machine.status.phase;
		}
		await sleep(POLL_MS);
		machine = await getMachine(client, machineId);
	}
	await sleep(WAKE_GRACE_MS);
	return machine;
}

export async function wakeMachine(
	client: Dedalus,
	machine: Machine,
): Promise<Machine> {
	if (machine.status.phase === "running") return machine;
	if (machine.status.phase === "sleeping") {
		await client.machines.wake({
			machine_id: machine.machine_id,
			"If-Match": machine.status.revision,
		});
	}
	return waitForRunning(client, machine.machine_id);
}

export async function sleepMachine(
	client: Dedalus,
	machine: Machine,
): Promise<Machine> {
	if (machine.status.phase !== "running") return machine;
	await client.machines.sleep({
		machine_id: machine.machine_id,
		"If-Match": machine.status.revision,
	});
	return getMachine(client, machine.machine_id);
}

export async function destroyMachine(
	client: Dedalus,
	machine: Machine,
): Promise<void> {
	if (machine.status.phase === "destroyed") return;
	await client.machines.delete({
		machine_id: machine.machine_id,
		"If-Match": machine.status.revision,
	});
}

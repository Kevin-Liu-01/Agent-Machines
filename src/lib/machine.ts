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

export async function createMachine(
	client: Dedalus,
	config: { vcpu: number; memoryMib: number; storageGib: number },
): Promise<Machine> {
	return client.machines.create({
		vcpu: config.vcpu,
		memory_mib: config.memoryMib,
		storage_gib: config.storageGib,
	});
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

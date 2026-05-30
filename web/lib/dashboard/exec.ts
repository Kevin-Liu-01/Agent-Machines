/**
 * Server-side helper that runs a shell command on a user's machine
 * through the selected provider's exec adapter.
 *
 * When `machineId` is provided, the command targets that specific
 * machine (used by per-machine dashboard pages). When omitted, it
 * falls back to the account's active machine for backward compat.
 *
 * Multi-tenant: the provider credentials and machine come from
 * the Clerk-backed UserConfig. Each request resolves the caller's
 * machine, never a shared one.
 */

import { getProvider } from "@/lib/providers";
import { getUserConfigCached } from "@/lib/user-config/request-cache";
import { activeMachine, type UserConfig } from "@/lib/user-config/schema";

export type ExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Resolve a machine from the user's config by explicit ID or active fallback.
 */
export function resolveMachine(config: UserConfig, machineId?: string | null) {
	if (machineId) {
		return config.machines.find((m) => m.id === machineId) ?? null;
	}
	return activeMachine(config);
}

export async function execOnMachine(
	command: string,
	options: { timeoutMs?: number; machineId?: string | null } = {},
): Promise<ExecResult> {
	const config = await getUserConfigCached();
	const machine = resolveMachine(config, options.machineId);
	if (!machine) {
		throw new Error(
			options.machineId
				? `Machine ${options.machineId} not found in your account.`
				: "No active machine selected.",
		);
	}
	const provider = getProvider(machine.providerKind, config.providers);
	return provider.exec(machine.id, command, {
		timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});
}

/**
 * True iff the specified (or active) machine is currently in a state
 * where an exec is likely to succeed. Routes call this first so they
 * can return a typed "machine_offline" payload instead of timing out.
 */
export async function isMachineRunning(machineId?: string | null): Promise<boolean> {
	try {
		const config = await getUserConfigCached();
		const machine = resolveMachine(config, machineId);
		if (!machine) return false;
		const provider = getProvider(machine.providerKind, config.providers);
		const summary = await provider.state(machine.id);
		return summary.state === "ready";
	} catch {
		return false;
	}
}

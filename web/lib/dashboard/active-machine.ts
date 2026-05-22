/**
 * Provider-backed active-machine helpers.
 *
 * Older dashboard routes used `lib/dashboard/dedalus.ts` directly,
 * which meant active-machine wake/sleep followed a different code path
 * from the per-machine fleet routes. That split broke on Dedalus fleets
 * where public API keys cannot call the HMAC-gated lifecycle endpoints.
 *
 * This module resolves the caller's active machine, asks the selected
 * provider for state / transitions, and adapts the provider summary to
 * the legacy `MachineSummary` wire shape consumed by existing UI.
 */

import { ensureGatewayRunning } from "@/lib/bootstrap/gateway-lifecycle";
import { MachineProviderError, getProvider } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import { activeMachine, type MachineRef } from "@/lib/user-config/schema";

import type { MachineSummary } from "./types";
import type { MachineProvider, ProviderMachineSummary } from "@/lib/providers";

async function resolveMachineRef(machineId?: string | null): Promise<{
	machine: MachineRef;
	provider: MachineProvider;
}> {
	const config = await getUserConfig();
	const machine = machineId
		? config.machines.find((m) => m.id === machineId) ?? null
		: activeMachine(config);
	if (!machine) {
		throw new MachineProviderError(
			"dedalus",
			"missing_credentials",
			machineId
				? `Machine ${machineId} not found in your account.`
				: "No active machine configured. Provision or select one in /dashboard/machines.",
		);
	}
	const provider = getProvider(machine.providerKind, config.providers);
	return { machine, provider };
}

export async function fetchMachineSummary(
	machineId?: string | null,
): Promise<MachineSummary> {
	const { machine, provider } = await resolveMachineRef(machineId);
	const summary = await provider.state(machine.id);
	return toMachineSummary(summary);
}

export async function fetchActiveMachineSummary(): Promise<MachineSummary> {
	return fetchMachineSummary(null);
}

export async function wakeMachine(machineId?: string | null): Promise<MachineSummary> {
	const { machine, provider } = await resolveMachineRef(machineId);
	const summary = await provider.wake(machine.id);
	if (
		summary.state === "ready" &&
		machine.bootstrapState.phase === "succeeded" &&
		machine.agentKind !== "claude-code" &&
		machine.agentKind !== "codex"
	) {
		await ensureGatewayRunning(machine, provider).catch((err) => {
			console.warn(
				`[wake] gateway restart skipped for ${machine.id}:`,
				err instanceof Error ? err.message : err,
			);
		});
	}
	return toMachineSummary(summary);
}

export async function wakeActiveMachine(): Promise<MachineSummary> {
	return wakeMachine(null);
}

export async function sleepActiveMachine(): Promise<MachineSummary> {
	const { machine, provider } = await resolveMachineRef(null);
	const summary = await provider.sleep(machine.id);
	return toMachineSummary(summary);
}

function toMachineSummary(summary: ProviderMachineSummary): MachineSummary {
	const phase = toPhase(summary);
	const spec = summary.spec ?? { vcpu: 1, memoryMib: 2048, storageGib: 10 };
	return {
		machineId: summary.id,
		phase,
		desired: toDesired(summary),
		vcpu: spec.vcpu ?? 1,
		memoryMib: spec.memoryMib ?? 2048,
		storageGib: spec.storageGib ?? 10,
		createdAt: summary.createdAt ?? new Date(0).toISOString(),
		configuredAt: null,
		reason: summary.lastError,
		statusReason: summary.rawPhase,
		lastTransitionAt: null,
		lastProgressAt: null,
	};
}

function toPhase(summary: ProviderMachineSummary): MachineSummary["phase"] {
	if (summary.state === "ready") return "running";
	if (summary.state === "starting") return "starting";
	if (summary.state === "sleeping") return "sleeping";
	if (summary.state === "destroying") return "destroying";
	if (summary.state === "destroyed") return "destroyed";
	if (summary.state === "error") return "failed";
	return "unknown";
}

function toDesired(summary: ProviderMachineSummary): MachineSummary["desired"] {
	if (summary.state === "ready" || summary.state === "starting") {
		return "running";
	}
	if (summary.state === "sleeping") return "sleeping";
	if (summary.state === "destroyed" || summary.state === "destroying") {
		return "destroyed";
	}
	return "unknown";
}

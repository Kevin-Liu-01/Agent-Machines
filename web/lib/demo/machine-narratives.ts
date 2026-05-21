/**
 * Per-machine demo narratives — resolved from demo-config.json via config.ts.
 */

import type {
	CursorRunsPayload,
	LogLine,
	LogsPayload,
	SessionsPayload,
} from "@/lib/dashboard/types";
import type { AgentKind } from "@/lib/user-config/schema";

import {
	getDemoSeedActiveMachineId,
	getDemoSeedMachines,
	getMachineNarrative as resolveNarrative,
	type DemoMachineUsage,
	type MachineNarrative,
} from "./config";
import { resolveDemoExec } from "./exec-replies";

export type DemoChatRecord = MachineNarrative["chats"][number];

export type DemoArtifact = MachineNarrative["artifacts"][number];

export type { DemoMachineUsage, MachineNarrative } from "./config";

function seedDemoMachines() {
	return getDemoSeedMachines();
}

export function resolveDemoMachineId(machineId?: string | null): string {
	const machines = seedDemoMachines();
	if (machineId && machines.some((m) => m.id === machineId)) {
		return machineId;
	}
	return getDemoSeedActiveMachineId() ?? machines[0]?.id ?? "demo-fullstack";
}

export function getMachineNarrative(machineId?: string | null): MachineNarrative {
	const id = resolveDemoMachineId(machineId);
	const machine = seedDemoMachines().find((m) => m.id === id);
	return resolveNarrative(id, machine);
}

export function demoExecStdout(
	machineId: string | null | undefined,
	command: string,
): string {
	const id = resolveDemoMachineId(machineId);
	return resolveDemoExec(command, id).stdout;
}

export function agentKindForDemoMachine(machineId: string): AgentKind {
	return seedDemoMachines().find((m) => m.id === machineId)?.agentKind ?? "hermes";
}

export { STARTER_PROMPTS_BY_MACHINE } from "./starter-prompts";

// Re-export payload types used by handlers
export type { LogLine, LogsPayload, SessionsPayload, CursorRunsPayload };

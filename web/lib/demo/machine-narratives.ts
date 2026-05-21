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
	getMachineNarrative as resolveNarrative,
	type DemoMachineUsage,
	type MachineNarrative,
} from "./config";
import { resolveDemoExec } from "./exec-replies";
import {
	allDemoMachinesIncludingArchived,
	getDemoActiveMachineId,
} from "./state";

export type DemoChatRecord = MachineNarrative["chats"][number];

export type DemoArtifact = MachineNarrative["artifacts"][number];

export type { DemoMachineUsage, MachineNarrative } from "./config";

export function resolveDemoMachineId(machineId?: string | null): string {
	const fleet = allDemoMachinesIncludingArchived();
	if (machineId && fleet.some((m) => m.id === machineId)) {
		return machineId;
	}
	return (
		getDemoActiveMachineId() ??
		getDemoSeedActiveMachineId() ??
		fleet[0]?.id ??
		"demo-fullstack"
	);
}

export function getMachineNarrative(machineId?: string | null): MachineNarrative {
	const id = resolveDemoMachineId(machineId);
	const machine = fleetMachineById(id);
	return resolveNarrative(id, machine);
}

function fleetMachineById(id: string) {
	return allDemoMachinesIncludingArchived().find((m) => m.id === id);
}

export function demoExecStdout(
	machineId: string | null | undefined,
	command: string,
): string {
	const id = resolveDemoMachineId(machineId);
	return resolveDemoExec(command, id).stdout;
}

export function agentKindForDemoMachine(machineId: string): AgentKind {
	return fleetMachineById(machineId)?.agentKind ?? "hermes";
}

export { STARTER_PROMPTS_BY_MACHINE } from "./starter-prompts";

// Re-export payload types used by handlers
export type { LogLine, LogsPayload, SessionsPayload, CursorRunsPayload };

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
	getMachineNarrative as resolveNarrative,
	getStarterPromptsForMachine,
	demoExecStdout as execStdout,
	type DemoMachineUsage,
	type MachineNarrative,
} from "./config";
import { allDemoMachines, getDemoActiveMachineId } from "./state";

export type DemoChatRecord = MachineNarrative["chats"][number];

export type DemoArtifact = MachineNarrative["artifacts"][number];

export type { DemoMachineUsage, MachineNarrative } from "./config";

export function resolveDemoMachineId(machineId?: string | null): string {
	if (machineId && allDemoMachines().some((m) => m.id === machineId)) {
		return machineId;
	}
	return getDemoActiveMachineId() ?? "demo-fullstack";
}

export function getMachineNarrative(machineId?: string | null): MachineNarrative {
	const id = resolveDemoMachineId(machineId);
	const machine = allDemoMachines().find((m) => m.id === id);
	return resolveNarrative(id, machine);
}

export function demoExecStdout(
	machineId: string | null | undefined,
	command: string,
): string {
	const id = resolveDemoMachineId(machineId);
	const machine = allDemoMachines().find((m) => m.id === id);
	return execStdout(id, command, machine);
}

export function agentKindForDemoMachine(machineId: string): AgentKind {
	return allDemoMachines().find((m) => m.id === machineId)?.agentKind ?? "hermes";
}

export const STARTER_PROMPTS_BY_MACHINE: Record<
	string,
	ReadonlyArray<{ label: string; prompt: string }>
> = new Proxy({} as Record<string, ReadonlyArray<{ label: string; prompt: string }>>, {
	get(_target, prop: string) {
		return getStarterPromptsForMachine(prop);
	},
});

// Re-export payload types used by handlers
export type { LogLine, LogsPayload, SessionsPayload, CursorRunsPayload };

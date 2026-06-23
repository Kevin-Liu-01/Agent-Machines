import type { AgentKind } from "@/lib/user-config/schema";

export type AgentMachineCandidate = {
	id: string;
	name?: string;
	agentKind: AgentKind;
	providerKind?: string;
	apiUrl?: string | null;
	archived?: boolean;
	bootstrapState?: {
		phase?: string;
		lastError?: string | null;
	} | null;
	live?:
		| { ok: true; state?: string }
		| { ok: false; reason?: string }
		| null;
};

export function selectAgentMachine({
	knownMachines,
	catalogMachines,
	agentKind,
	currentMachineId,
}: {
	knownMachines: AgentMachineCandidate[];
	catalogMachines: AgentMachineCandidate[];
	agentKind: AgentKind;
	currentMachineId?: string;
}): AgentMachineCandidate | null {
	return (
		bestMachineForAgent(knownMachines, agentKind, currentMachineId) ??
		bestMachineForAgent(catalogMachines, agentKind, currentMachineId)
	);
}

export function bestMachineForAgent(
	machines: AgentMachineCandidate[],
	agentKind: AgentKind,
	currentMachineId?: string,
): AgentMachineCandidate | null {
	const matches = machines
		.filter((machine) => !machine.archived && machine.agentKind === agentKind)
		.sort((a, b) => machineScore(b) - machineScore(a));
	const target =
		matches.find((machine) => machine.id !== currentMachineId) ?? matches[0];
	return target ?? null;
}

export function machineScore(machine: AgentMachineCandidate): number {
	const ready = machine.live?.ok === true && machine.live.state === "ready";
	const booted = machine.bootstrapState?.phase === "succeeded";
	const reachable = Boolean(machine.apiUrl);
	const cleanBootstrap = !machine.bootstrapState?.lastError;
	return (
		(ready ? 8 : 0) +
		(reachable ? 4 : 0) +
		(booted ? 4 : 0) +
		(cleanBootstrap ? 2 : 0) +
		(machine.providerKind === "sprites" ? 1 : 0)
	);
}

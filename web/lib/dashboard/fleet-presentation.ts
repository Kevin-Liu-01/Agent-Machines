import { AGENT_LABEL, PROVIDER_LABEL, type AgentKind, type ProviderKind } from "@/lib/user-config/schema";

export type FleetFilter = "all" | "ready" | "sleeping" | "attention";
type SearchableMachine = {
	id: string;
	name: string;
	agentKind: AgentKind;
	providerKind: ProviderKind;
	model: string;
	live: { ok: true; state: string } | { ok: false; reason: string };
};

export function filterFleet<T extends SearchableMachine>(machines: T[], query: string, status: FleetFilter): T[] {
	const search = query.trim().toLocaleLowerCase();
	return machines.filter((machine) => {
		const state = machine.live.ok ? machine.live.state : "unknown";
		if (status === "attention" && ["ready", "sleeping"].includes(state)) return false;
		if (status !== "all" && status !== "attention" && state !== status) return false;
		return !search || [machine.name, machine.id, AGENT_LABEL[machine.agentKind], PROVIDER_LABEL[machine.providerKind], machine.model]
			.some((value) => value?.toLocaleLowerCase().includes(search));
	});
}

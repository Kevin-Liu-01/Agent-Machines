import type { ServiceSlug } from "@/components/ServiceIcon";
import { AGENTS } from "@/lib/agents";
import type { ToolCategory } from "@/lib/dashboard/loadout";
import type { AgentKind, ProviderKind } from "@/lib/user-config/schema";

export type FleetToolBadge =
	| { kind: "service"; slug: ServiceSlug }
	| { kind: "tool"; name: ToolCategory | "task" | "skill" | "subagent" | "rig" };

export const AGENT_HUE: Record<AgentKind, string> = {
	hermes: "#7c8cf8",
	openclaw: "#e5443b",
	"claude-code": "#d4a574",
	codex: "#4ae0a0",
};

const PROVIDER_REGION: Partial<Record<ProviderKind, string>> = {
	dedalus: "us-east-1",
	e2b: "us-west-2",
	sprites: "us-east-2",
};

const DEFAULT_TOOLS: Record<AgentKind, FleetToolBadge[]> = {
	hermes: [
		{ kind: "tool", name: "memory" },
		{ kind: "tool", name: "schedule" },
		{ kind: "tool", name: "search" },
		{ kind: "service", slug: "github" },
		{ kind: "service", slug: "slack" },
		{ kind: "service", slug: "supabase" },
	],
	openclaw: [
		{ kind: "tool", name: "browser" },
		{ kind: "tool", name: "vision" },
		{ kind: "tool", name: "shell" },
		{ kind: "service", slug: "googlechrome" },
		{ kind: "service", slug: "playwright" },
	],
	"claude-code": [
		{ kind: "tool", name: "code" },
		{ kind: "tool", name: "filesystem" },
		{ kind: "tool", name: "shell" },
		{ kind: "service", slug: "github" },
		{ kind: "service", slug: "anthropic" },
	],
	codex: [
		{ kind: "tool", name: "code" },
		{ kind: "tool", name: "shell" },
		{ kind: "tool", name: "filesystem" },
		{ kind: "service", slug: "openai" },
		{ kind: "service", slug: "github" },
	],
};

export function agentMetaForKind(agentKind: AgentKind) {
	return AGENTS.find((a) => a.id === agentKind) ?? AGENTS[0];
}

export function fleetHue(agentKind: AgentKind): string {
	return AGENT_HUE[agentKind] ?? "var(--ret-purple)";
}

export function fleetRegion(providerKind: ProviderKind): string {
	return PROVIDER_REGION[providerKind] ?? "us-east-1";
}

export function fleetTools(agentKind: AgentKind): FleetToolBadge[] {
	return DEFAULT_TOOLS[agentKind] ?? [];
}

export function formatFleetUptime(createdAt: string): string {
	const ms = Date.now() - new Date(createdAt).getTime();
	if (!Number.isFinite(ms) || ms < 0) return "0h";
	const hours = Math.floor(ms / 3_600_000);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	const rem = hours % 24;
	return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

export function formatRelativeTime(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	if (!Number.isFinite(ms) || ms < 0) return "just now";
	const mins = Math.floor(ms / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 48) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function shortMachineId(id: string): string {
	const tail = id.replace(/^demo-/, "").slice(-4);
	if (id.startsWith("demo-")) return `dm-${tail.padStart(4, "0")}`;
	if (id.length <= 8) return id;
	return `dm-${id.slice(-4)}`;
}

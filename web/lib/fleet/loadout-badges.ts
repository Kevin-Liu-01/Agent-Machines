import type { Mark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";
import { AGENTS } from "@/lib/agents";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { ToolCategory } from "@/lib/dashboard/loadout";
import type { AgentKind, LoadoutPreset } from "@/lib/user-config/schema";

const SERVICE_SLUGS = new Set<string>([
	"vercel",
	"stripe",
	"supabase",
	"clerk",
	"firebase",
	"figma",
	"posthog",
	"sentry",
	"datadog",
	"linear",
	"slack",
	"shopify",
	"clickhouse",
	"github",
	"googlechrome",
	"playwright",
	"neon",
	"upstash",
	"sanity",
	"grafana",
]);

export type LoadoutDisplayBadge =
	| { kind: "service"; slug: ServiceSlug }
	| { kind: "mark"; mark: Mark }
	| { kind: "tool"; name: ToolCategory | "task" | "skill" | "subagent" | "rig" };

const NATIVE_TOOL_MAP: Record<string, ToolCategory | "skill" | "task"> = {
	terminal: "shell",
	read_file: "filesystem",
	write_file: "filesystem",
	patch: "code",
	search: "search",
	browser_navigate: "browser",
	browser_click: "browser",
	browser_snapshot: "browser",
	vision_analyze: "vision",
	memory: "memory",
	cronjob: "schedule",
	delegate_task: "delegate",
	skills_list: "skill",
	skill_view: "skill",
	web_search: "search",
	execute_code: "code",
};

function mcpEnabled(id: string, serverName: string): boolean {
	if (id === "*") return true;
	if (id.endsWith("*")) return serverName.startsWith(id.slice(0, -1));
	if (id === serverName) return true;
	const tail = id.split("-").pop();
	if (tail && tail.length > 2 && serverName.includes(tail)) return true;
	return serverName.includes(id) || id.includes(serverName);
}

function badgeKey(b: LoadoutDisplayBadge): string {
	if (b.kind === "service") return `s:${b.slug}`;
	if (b.kind === "mark") return `m:${b.mark}`;
	return `t:${b.name}`;
}

export function resolveMachineLoadoutBadges(
	preset: LoadoutPreset | null,
	mcps: McpServerWithBrand[],
	agentKind: AgentKind,
): { tools: LoadoutDisplayBadge[]; mcpCount: number } {
	const enabledMcpIds = preset?.enabledMcpServerIds ?? ["*"];
	const enabledMcps = mcps.filter((m) => enabledMcpIds.some((id) => mcpEnabled(id, m.name)));

	const mcpBadges: LoadoutDisplayBadge[] = [];
	for (const mcp of enabledMcps) {
		if (!mcp.brand) continue;
		if (SERVICE_SLUGS.has(mcp.brand)) {
			mcpBadges.push({ kind: "service", slug: mcp.brand as ServiceSlug });
		} else {
			mcpBadges.push({ kind: "mark", mark: mcp.brand as Mark });
		}
	}

	const nativeBadges: LoadoutDisplayBadge[] = [];
	for (const name of AGENTS.find((a) => a.id === agentKind)?.nativeToolNames ?? []) {
		const mapped = NATIVE_TOOL_MAP[name];
		if (!mapped) continue;
		nativeBadges.push({ kind: "tool", name: mapped });
		if (nativeBadges.length >= 5) break;
	}

	const seen = new Set<string>();
	const tools = [...nativeBadges, ...mcpBadges].filter((b) => {
		const key = badgeKey(b);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	}).slice(0, 14);

	return { tools, mcpCount: enabledMcps.length };
}

/**
 * Agent Machines harness — registry-derived stats and product framing.
 *
 * Open-source building blocks for agent harnesses. Catalog availability,
 * installed capabilities, and runtime compatibility are distinct concepts.
 *
 * Counts come from live registries (loadout, MCP catalog, skills manifest).
 */

import mcpCatalog from "@/data/mcps-catalog.json";
import skillsManifest from "@/data/skills.json";
import { AGENTS } from "@/lib/agents";
import {
	BUILTIN_TOOLS,
	SERVICES,
	TASKS,
	TRUSTED_ADDONS,
	type TrustedAddOnKind,
} from "@/lib/dashboard/loadout";
import type { AgentKind } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Product vision (stable copy — not derived from counts)              */
/* ------------------------------------------------------------------ */

export const PRODUCT = {
	name: "Agent Machines",
	/** Shared public positioning; operational boundaries stay explicit below. */
	tagline: "Open-source building blocks for agent harnesses.",
	oneLiner:
		"Start with a working agent setup. Choose a runtime and compute, connect your tools, and make the source your own.",
	summary:
		"Agent Machines provides open-source building blocks for agent harnesses: runtime adapters, sandbox providers, browser terminals, editable instructions and memory, skills, and MCP configuration. Start from a preset or assemble your own setup, run the actual agent CLI, and manage remote agents from one dashboard. Inspect, modify, and extend the source as your workflow changes.",
	analogies: {
		primary:
			"Think shadcn for agent harnesses: useful starting points and source you can inspect and adapt—not a shadcn component registry or a one-command harness installer.",
		substrate:
			"Daytona, E2B, Sprites, and Vercel Sandbox provide compute through capability-aware adapters.",
	},
	audiences: {
		humans:
			"For developers and technical teams building custom agent environments without rebuilding provisioning, terminals, and configuration from scratch.",
		agents:
			"Use the SDK and HTTP API to create and run agents programmatically; the dashboard exposes the same remote workspaces.",
	},
	fleet:
		"Save an agent setup, provision its compute, and manage its terminal, configuration, files, and logs. A Worker is a saved setup and its running workspace—not a claim that a preset can complete a job without configuration or supervision.",
	substrateNote:
		"Runtimes, models, tools, memory, and compute have separate configuration surfaces. Supported combinations differ between the hosted dashboard and direct SDK; lifecycle and migration operations depend on the provider.",
	moat: [
		"A working foundation — runtime and provider adapters, lifecycle controls, and real browser CLIs",
		"Inspectable source — MIT-licensed code you can fork, modify, and extend",
		"Configurable setups — instructions, selected skills, MCP connections, and model credentials",
		"One dashboard — multiple remote agents with files, sessions, and logs",
		"Clear boundaries — explicit compatibility, provider capabilities, and catalog installation requirements",
	],
} as const;

export const HARNESS_LAYERS = [
	{
		id: "skills",
		label: "Skills",
		description:
			"Browse SKILL.md procedures from knowledge/, select abilities, and inspect the instructions before installing them.",
	},
	{
		id: "services",
		label: "Service lanes",
		description:
			"Per-vendor interface rankings (MCP → CLI → plugin skill → personal skill). Mirrors tool-hierarchy.mdc.",
	},
	{
		id: "mcp",
		label: "MCP servers",
		description:
			"Core (playwright, cursor-bridge), bundled SaaS integrations, IDE bridges, and utility servers from mcps/catalog.json.",
	},
	{
		id: "cli",
		label: "CLI catalog",
		description:
			"Discover tools such as agent-browser, Playwright, and gh. Installation, credentials, and runtime support are checked separately.",
	},
	{
		id: "builtins",
		label: "Agent-native tools",
		description:
			"Terminal, filesystem, browser, vision, cron, memory, delegation — set varies by runtime (Hermes, OpenClaw, Claude Code, Codex).",
	},
	{
		id: "tasks",
		label: "Task lanes",
		description:
			"Category-level rankings for browser automation, QA, security, design review, research, SEO, animation, 3D, etc.",
	},
] as const;

/* ------------------------------------------------------------------ */
/* Registry-derived counts                                             */
/* ------------------------------------------------------------------ */

type McpTier = "core" | "bundled" | "ide" | "reference";

function countAddons(kind: TrustedAddOnKind): number {
	return TRUSTED_ADDONS.filter((a) => a.kind === kind).length;
}

function mcpTierCounts(): Record<McpTier, number> {
	const out: Record<McpTier, number> = { core: 0, bundled: 0, ide: 0, reference: 0 };
	for (const server of mcpCatalog.servers) {
		const tier = server.tier as McpTier;
		if (tier in out) out[tier] += 1;
	}
	return out;
}

function nativeToolCountByAgent(): Record<AgentKind, number> {
	return Object.fromEntries(
		AGENTS.map((a) => [a.id, a.nativeToolNames.length]),
	) as Record<AgentKind, number>;
}

function minNativeTools(): number {
	return Math.min(...AGENTS.map((a) => a.nativeToolNames.length));
}

function maxNativeTools(): number {
	return Math.max(...AGENTS.map((a) => a.nativeToolNames.length));
}

/** Computed once at module load from registries — re-run sync-skills before release builds. */
export const HARNESS = {
	skillCount: skillsManifest.length,
	mcpServerCount: mcpCatalog.servers.length,
	mcpTiers: mcpTierCounts(),
	serviceRouteCount: SERVICES.length,
	taskRouteCount: TASKS.length,
	rigToolSurfaceCount: BUILTIN_TOOLS.length,
	trustedAddonCount: TRUSTED_ADDONS.length,
	cliCount: countAddons("cli"),
	mcpAddonCount: countAddons("mcp"),
	pluginAddonCount: countAddons("plugin"),
	skillAddonCount: countAddons("skill"),
	sourceCount: countAddons("source"),
	nativeToolsByAgent: nativeToolCountByAgent(),
	nativeToolMin: minNativeTools(),
	nativeToolMax: maxNativeTools(),
	agentRuntimeCount: AGENTS.length,
	providersLive: ["daytona", "e2b", "sprites", "vercel"] as const,
	catalogUpdated: mcpCatalog.updated,
} as const;

/** One-line harness summary for SEO / OG / hero pills. */
export const HARNESS_SUMMARY = [
	`${HARNESS.skillCount} skills`,
	`${HARNESS.serviceRouteCount} service lanes`,
	`${HARNESS.cliCount}+ CLIs`,
	`${HARNESS.mcpServerCount} MCP servers`,
	"agent-native tools",
].join(" · ");

/** Deploy pitch — matches demo script framing. */
export const HARNESS_DEPLOY_LINE =
	`Start with a preset, then choose from ${HARNESS.skillCount} skill entries and ${HARNESS.mcpServerCount} MCP catalog entries. Configure and install what your runtime supports; connect your own service credentials.`;

/** FAQ-safe tools answer — registry-aware, not a fake single number. */
export const HARNESS_TOOLS_ANSWER =
	`The source includes ${HARNESS.skillCount} SKILL.md entries and ${HARNESS.mcpServerCount} MCP catalog entries, plus CLI and service guides. These are available building blocks, not a promise that every tool is installed, authenticated, or compatible with every runtime. Preview and select abilities, connect the required services, then use the dashboard installation controls. Runtime-native tools vary by agent.`;

export function nativeToolsLabel(agent: AgentKind = "hermes"): string {
	const n = HARNESS.nativeToolsByAgent[agent];
	return `${n} native tools (${AGENTS.find((a) => a.id === agent)?.name ?? agent})`;
}

/**
 * Agent Machines harness — registry-derived stats and product framing.
 *
 * OpenRouter for agents and containers: route runtime + substrate, deploy a
 * persistent agent worker (skills, MCP, cron, observation, fleet management).
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
	/** Site title suffix, OG, GitHub — lead with the routing analogy. */
	tagline: "OpenRouter for agents and containers.",
	oneLiner:
		"Route agent runtimes, model paths, and machine providers in one account, then deploy persistent workers with skills, MCP, cron, logs, usage, and fleet controls already wired.",
	summary:
		"Agent Machines is the product layer above sandboxes: a control plane that provisions a persistent agent worker as one unit — runtime, model route, skills, MCP, integrations, cron, observation, and fleet management — on the machine provider you choose.",
	analogies: {
		primary: "OpenRouter for agents and containers",
		substrate:
			"Vercel on AWS — Agent Machines is the product layer; E2B, Sprites.dev, Dedalus Machines, and Vercel Sandbox are interchangeable infrastructure underneath",
	},
	audiences: {
		humans:
			"Pick runtime + substrate in clicks. Provision specialist agents from presets (design, news, code, ops). Supervise the fleet from one dashboard.",
		agents:
			"MCP + CLI surface so a head agent can provision, route, observe, and tear down worker machines (the endgame).",
	},
	fleet:
		"Provision specialist workers from opinionated presets (Hermes, OpenClaw, Claude Code, Codex). Each preset is runtime + model route + memory bundle + loadout, visible from one fleet dashboard.",
	substrateNote:
		"Dedalus Machines is one of four live providers (with E2B, Sprites.dev, and Vercel Sandbox) and currently benchmarks best on boot latency and sleep/wake — a strong default, not the product. Sandboxed environments are hard; we route rather than rebuild infra.",
	moat: [
		"SKILL.md protocol — versioned agent procedures that compound every session",
		"Combined harness — runtime + skills + services + CLIs + observation in one deploy",
		"Dual routing — agent runtime and container substrate, OpenRouter-style",
		"Programmatic control plane — dashboard for humans, MCP/CLI for agent-to-agent orchestration",
	],
} as const;

export const HARNESS_LAYERS = [
	{
		id: "skills",
		label: "Skills",
		description:
			"SKILL.md behavior packs synced from knowledge/. Loaded on intent — npm for agent intelligence.",
	},
	{
		id: "services",
		label: "Service routes",
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
		label: "Closed-loop CLIs",
		description:
			"agent-browser, Playwright, gh, curl, httpx, jq, sqlite3, ss, dig — verification without hallucinating success.",
	},
	{
		id: "builtins",
		label: "Agent-native tools",
		description:
			"Terminal, filesystem, browser, vision, cron, memory, delegation — set varies by runtime (Hermes, OpenClaw, Claude Code, Codex).",
	},
	{
		id: "tasks",
		label: "Task routes",
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
	providersLive: ["dedalus", "e2b", "sprites", "vercel"] as const,
	catalogUpdated: mcpCatalog.updated,
} as const;

/** One-line harness summary for SEO / OG / hero pills. */
export const HARNESS_SUMMARY = [
	`${HARNESS.skillCount} skills`,
	`${HARNESS.serviceRouteCount} service routes`,
	`${HARNESS.cliCount}+ CLIs`,
	`${HARNESS.mcpServerCount} MCP servers`,
	"agent-native tools",
].join(" · ");

/** Deploy pitch — matches demo script framing. */
export const HARNESS_DEPLOY_LINE =
	`One click: ${HARNESS.skillCount} skills, ${HARNESS.mcpTiers.bundled}+ service MCPs, ${HARNESS.cliCount}+ CLIs, ${HARNESS.nativeToolMin}+ native tools (varies by agent), browser automation, cron, optional Cursor bridge.`;

/** FAQ-safe tools answer — registry-aware, not a fake single number. */
export const HARNESS_TOOLS_ANSWER =
	`The harness ships ${HARNESS.skillCount} SKILL.md files, ${HARNESS.serviceRouteCount} ranked service routes (MCP → CLI → skills per vendor), ${HARNESS.mcpServerCount} MCP catalog entries (${HARNESS.mcpTiers.core} core + ${HARNESS.mcpTiers.bundled} bundled + ${HARNESS.mcpTiers.ide} IDE), ${HARNESS.cliCount}+ closed-loop CLIs, and ${HARNESS.nativeToolMin}–${HARNESS.nativeToolMax} agent-native tools depending on runtime (Hermes, OpenClaw, Claude Code, Codex). The loadout registry — not static marketing copy — is the source of truth.`;

export function nativeToolsLabel(agent: AgentKind = "hermes"): string {
	const n = HARNESS.nativeToolsByAgent[agent];
	return `${n} native tools (${AGENTS.find((a) => a.id === agent)?.name ?? agent})`;
}

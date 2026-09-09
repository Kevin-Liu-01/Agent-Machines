/**
 * Agent Machines harness — registry-derived stats and product framing.
 *
 * Durable Workers with replaceable machinery: describe or choose a specialist,
 * then route its runtime, model, substrate, and abilities without losing the
 * Worker's identity, responsibility, state, or evidence.
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
	/** Site title suffix, OG, GitHub — lead with the durable-Worker invariant. */
	tagline: "Persistent Workers. Replaceable machinery.",
	oneLiner:
		"Describe the work you need or choose a trusted specialist, then keep its memory, files, schedules, abilities, and evidence while runtimes, models, and sandboxes change underneath it.",
	summary:
		"Agent Machines is the Worker system for persistent digital labor: create a long-running specialist from intent or a template, supervise its work, and preserve its identity, responsibility, memory, files, schedules, permissions, and evidence across replaceable runtimes, models, tools, and sandbox providers.",
	analogies: {
		primary:
			"OpenRouter for routing the machinery, Lovable/Bolt/v0 for composing a Worker, and ChatGPT-simple access to the first useful result",
		substrate:
			"Agent Machines is the product layer; Daytona, E2B, Sprites.dev, and Vercel Sandbox supply replaceable infrastructure underneath",
	},
	audiences: {
		humans:
			"Describe a responsibility or choose a specialist, connect the services it may use, then watch, approve, inspect, and move the Worker from one dashboard.",
		agents:
			"MCP + CLI surface so a head agent can launch, switch, observe, and tear down worker machines (the endgame).",
	},
	fleet:
		"Provision specialist Workers from opinionated templates or modular primitives. Each Worker keeps its identity, responsibility, memory bundle, schedules, files, loadout, history, and evidence while the implementation beneath it changes.",
	substrateNote:
		"Daytona, E2B, Sprites.dev, and Vercel Sandbox implement the substrate contract, but each lane exposes only its supported capabilities. The provider is replaceable machinery, never the Worker itself.",
	moat: [
		"Durable Worker identity — responsibility, memory, files, schedules, permissions, history, and evidence survive implementation changes",
		"Worker composer — useful off-the-shelf specialists today, intent-to-Worker assembly as the creation layer",
		"Outcome router — runtime, model, substrate, abilities, cost, constraints, and health become one evaluated lane",
		"Owned harness — SKILL.md procedures, MCPs, CLIs, tools, and service routes compound outside a closed chat",
		"Programmatic control plane — dashboard for humans, MCP/CLI for Worker-to-Worker orchestration",
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
	`One click: ${HARNESS.skillCount} skills, ${HARNESS.mcpTiers.bundled}+ service MCPs, ${HARNESS.cliCount}+ CLIs, ${HARNESS.nativeToolMin}+ native tools (varies by agent), browser automation, cron, optional Cursor bridge.`;

/** FAQ-safe tools answer — registry-aware, not a fake single number. */
export const HARNESS_TOOLS_ANSWER =
	`The harness ships ${HARNESS.skillCount} SKILL.md files, ${HARNESS.serviceRouteCount} ranked service lanes (MCP → CLI → skills per vendor), ${HARNESS.mcpServerCount} MCP catalog entries (${HARNESS.mcpTiers.core} core + ${HARNESS.mcpTiers.bundled} bundled + ${HARNESS.mcpTiers.ide} IDE), ${HARNESS.cliCount}+ closed-loop CLIs, and ${HARNESS.nativeToolMin}–${HARNESS.nativeToolMax} agent-native tools depending on runtime (Hermes, OpenClaw, Claude Code, Codex). The loadout registry — not static marketing copy — is the source of truth.`;

export function nativeToolsLabel(agent: AgentKind = "hermes"): string {
	const n = HARNESS.nativeToolsByAgent[agent];
	return `${n} native tools (${AGENTS.find((a) => a.id === agent)?.name ?? agent})`;
}

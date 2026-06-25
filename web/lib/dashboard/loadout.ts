/**
 * Loadout registry for the rig.
 *
 * Mirrors the wiki's `config/cursor/rules/tool-hierarchy.mdc` -- the
 * always-applied tool registry that ranks interfaces per service and
 * tools per task. Surfaced on `/dashboard/loadout` so the user can see
 * exactly what's available to their agent at a glance.
 *
 * Three layers, ordered from most to least concrete:
 *
 *   1. Built-in agent tools (`BUILTIN_TOOLS`) -- ship with the agent
 *      install itself. The agent calls these directly without any
 *      MCP roundtrip.
 *
 *   2. MCP servers (in `mcps.ts`) -- stdio/http servers the agent
 *      starts during bootstrap. Each exposes its own tool catalog
 *      (cursor_agent, etc.).
 *
 *   3. Services + tasks (`SERVICES` + `TASKS`) -- the wiki-level
 *      service/task hierarchy. Each entry ranks the available
 *      interfaces (MCP, CLI, plugin skills) so the agent picks the
 *      right one for the job.
 *
 * Plus skills (in `skills.ts`) -- 161 SKILL.md files that load on
 * demand to nudge the agent's behavior on a specific task type.
 */

import type { Mark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";
import { AGENTS } from "@/lib/agents";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { SkillSummary } from "@/lib/dashboard/types";
import type { AgentKind } from "@/lib/types";

export type ToolCategory =
	| "shell"
	| "filesystem"
	| "browser"
	| "vision"
	| "code"
	| "memory"
	| "schedule"
	| "search"
	| "audio"
	| "image"
	| "delegate";

export type TrustedAddOnKind =
	| "skill"
	| "mcp"
	| "cli"
	| "tool"
	| "plugin"
	| "provider"
	| "source";

export type TrustedAddOn = {
	id: string;
	name: string;
	kind: TrustedAddOnKind;
	provider: string;
	description: string;
	source: string;
	command: string | null;
	brand?: ServiceSlug;
};

export type BuiltinTool = {
	name: string;
	title: string;
	description: string;
	category: ToolCategory;
	provider: Mark | "rig";
};

/**
 * Native tools exposed on the rig surface. Agent runtimes ship different
 * native sets (see AGENTS[].nativeToolNames); the loadout UI shows which
 * agents declare each tool natively vs via the shared rig extension.
 */
export const BUILTIN_TOOLS: ReadonlyArray<BuiltinTool> = [
	{
		name: "terminal",
		title: "Shell terminal",
		description:
			"Run any shell command in the VM. Streams stdout/stderr back to the chat. Used for git, tests, build pipelines, package installs, system inspection.",
		category: "shell",
		provider: "rig",
	},
	{
		name: "read_file",
		title: "Read file",
		description:
			"Read a file from the VM filesystem with optional offset/limit. Bounded output to keep the agent's context window healthy.",
		category: "filesystem",
		provider: "rig",
	},
	{
		name: "write_file",
		title: "Write file",
		description:
			"Write or overwrite a file on the VM. Strict path checks keep writes inside ~/work and ~/.agent-machines by default.",
		category: "filesystem",
		provider: "rig",
	},
	{
		name: "patch",
		title: "Patch file",
		description:
			"Apply a unified diff to an existing file. Cheaper than full rewrites for surgical edits.",
		category: "filesystem",
		provider: "rig",
	},
	{
		name: "search",
		title: "Repo search",
		description:
			"ripgrep over the working directory. Supports regex, glob filters, multiline matches.",
		category: "filesystem",
		provider: "rig",
	},
	{
		name: "browser_navigate",
		title: "Navigate browser",
		description:
			"Drive a Playwright browser inside the VM. Navigate to a URL, wait for load, return the rendered DOM.",
		category: "browser",
		provider: "rig",
	},
	{
		name: "browser_click",
		title: "Click element",
		description:
			"Click an element by accessible selector. Pairs with browser_snapshot to find the right ref.",
		category: "browser",
		provider: "rig",
	},
	{
		name: "browser_type",
		title: "Type text",
		description:
			"Type into a focused input. Handles complex IME and shift-modifier sequences.",
		category: "browser",
		provider: "rig",
	},
	{
		name: "browser_snapshot",
		title: "Page snapshot",
		description:
			"Returns a YAML-shaped accessibility snapshot of the current page. Refs from this snapshot drive subsequent click/type calls.",
		category: "browser",
		provider: "rig",
	},
	{
		name: "browser_screenshot",
		title: "Screenshot page",
		description:
			"PNG screenshot of the viewport or a specific element. Stored as an artifact under ~/.agent-machines/artifacts/.",
		category: "browser",
		provider: "rig",
	},
	{
		name: "computer_use",
		title: "Computer-use macro",
		description:
			"Mouse + keyboard automation against a virtual display. The Anthropic computer-use loop, drives a real X server inside the VM.",
		category: "browser",
		provider: "rig",
	},
	{
		name: "vision_analyze",
		title: "Vision analysis",
		description:
			"Send a screenshot or image file to the LLM with a vision-capable model. Returns a structured description.",
		category: "vision",
		provider: "rig",
	},
	{
		name: "image_generate",
		title: "Generate image",
		description:
			"Generate images with FLUX via FAL. Optional. Requires FAL_KEY in ~/.agent-machines/.env when used.",
		category: "image",
		provider: "rig",
	},
	{
		name: "tts",
		title: "Text-to-speech",
		description:
			"Synthesize speech from text. Edge TTS by default; ElevenLabs if ELEVENLABS_API_KEY is set.",
		category: "audio",
		provider: "rig",
	},
	{
		name: "execute_code",
		title: "Run Python",
		description:
			"Sandboxed Python that can call other tools via internal RPC. Best for analysis, math, data wrangling, multi-step scripts.",
		category: "code",
		provider: "rig",
	},
	{
		name: "delegate_task",
		title: "Delegate to subagent",
		description:
			"Spawn a subagent for parallel work. Subagent inherits parent's tools + skills; returns a final message back to the parent.",
		category: "delegate",
		provider: "rig",
	},
	{
		name: "cronjob",
		title: "Schedule cron",
		description:
			"Create / list / edit / remove scheduled tasks. Persisted across machine sleep/wake; the cron runner wakes the machine when due.",
		category: "schedule",
		provider: "rig",
	},
	{
		name: "skills_list",
		title: "List skills",
		description:
			"Enumerate the SKILL.md files in ~/.agent-machines/skills. The agent inspects this when picking which skill conventions to load.",
		category: "memory",
		provider: "rig",
	},
	{
		name: "skill_view",
		title: "View skill",
		description:
			"Read a single SKILL.md body to load its conventions into the active turn.",
		category: "memory",
		provider: "rig",
	},
	{
		name: "memory",
		title: "Persistent memory",
		description:
			"Read / update USER.md and MEMORY.md so future conversations have context without re-explaining.",
		category: "memory",
		provider: "rig",
	},
	{
		name: "session_search",
		title: "FTS5 session search",
		description:
			"Full-text search over every prior conversation stored in ~/.agent-machines/sessions/*.db. Surfaces past tool outputs as context.",
		category: "search",
		provider: "rig",
	},
	{
		name: "web_search",
		title: "Web search",
		description:
			"Live web search. Returns ranked results with snippets. Used as the first move for any 'what's the latest on X' question.",
		category: "search",
		provider: "rig",
	},
	{
		name: "web_extract",
		title: "Extract page",
		description:
			"Pull the readable content from a URL with images + metadata. Defuddle-style cleanup before the LLM sees the bytes.",
		category: "search",
		provider: "rig",
	},
];

/* ------------------------------------------------------------------ */
/* Per-tool agent support (informational only -- all tools always on)  */
/* ------------------------------------------------------------------ */

export type AgentToolBadge = {
	agentId: AgentKind;
	agentName: string;
	native: boolean;
	mark: Mark;
};

/**
 * For a given built-in tool, returns which agents ship it natively vs
 * via the rig extension layer.
 */
export function getAgentSupportForTool(toolName: string): AgentToolBadge[] {
	return AGENTS.map((agent) => ({
		agentId: agent.id,
		agentName: agent.name,
		native: agent.nativeToolNames.includes(toolName),
		mark: agent.logoMark as Mark,
	}));
}

/**
 * Pre-computed map of tool name -> agent badges. Avoids recomputing
 * on every card render.
 */
export const TOOL_AGENT_SUPPORT: ReadonlyMap<string, ReadonlyArray<AgentToolBadge>> =
	new Map(BUILTIN_TOOLS.map((t) => [t.name, getAgentSupportForTool(t.name)]));

/* ------------------------------------------------------------------ */
/* Service registry (mirrors tool-hierarchy.mdc)                       */
/* ------------------------------------------------------------------ */

export type InterfaceKind = "mcp" | "cli" | "plugin-skill" | "personal-skill";

export type ServiceInterface = {
	rank: 1 | 2 | 3 | 4;
	kind: InterfaceKind;
	label: string;
	use: string;
};

export type ServiceEntry = {
	id: string;
	name: string;
	tagline: string;
	icon: ToolCategory;
	color?: string;
	/** Brand slug for `<ServiceIcon>`. When present, render the brand mark
	 *  next to the service name; falls back to the category `<ToolIcon>`
	 *  when omitted (e.g. for cross-cutting categories that don't map
	 *  to a single vendor). */
	brand?: ServiceSlug;
	interfaces: ServiceInterface[];
};

export const SERVICES: ReadonlyArray<ServiceEntry> = [
	{
		id: "vercel",
		name: "Vercel",
		tagline: "Deployments, env vars, logs, project config, domains",
		icon: "code",
		color: "#fff",
		brand: "vercel",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-vercel-vercel", use: "deploys, env, logs, project config, domains" },
			{ rank: 2, kind: "cli", label: "vercel", use: "vercel dev, vercel deploy, env pull, link" },
			{ rank: 3, kind: "plugin-skill", label: "28 skills", use: "Next.js patterns, AI SDK, caching, middleware, functions, storage, shadcn, Turbopack" },
		],
	},
	{
		id: "stripe",
		name: "Stripe",
		tagline: "Customers, subscriptions, payments, invoices, products",
		icon: "search",
		color: "#635bff",
		brand: "stripe",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-stripe-stripe", use: "read customers, subscriptions, payments, invoices, products" },
			{ rank: 2, kind: "cli", label: "stripe", use: "listen, trigger, fixtures, logs tail" },
			{ rank: 3, kind: "personal-skill", label: "stripe", use: "query Stripe via .env keys (write ops blocked on live keys)" },
			{ rank: 4, kind: "plugin-skill", label: "2 skills", use: "stripe-best-practices, upgrade-stripe" },
		],
	},
	{
		id: "supabase",
		name: "Supabase",
		tagline: "Schema, RLS, queries, auth, migrations",
		icon: "filesystem",
		color: "#3ecf8e",
		brand: "supabase",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-supabase-supabase", use: "schema, read-only queries, RLS policies, auth config" },
			{ rank: 2, kind: "cli", label: "supabase", use: "db diff, db push, init, migration new, gen types" },
			{ rank: 3, kind: "personal-skill", label: "db, db-write", use: "read-only SQL via scripts; db-write for mutations + migrations + seed" },
			{ rank: 4, kind: "plugin-skill", label: "2 skills", use: "supabase, supabase-postgres-best-practices" },
		],
	},
	{
		id: "clerk",
		name: "Clerk",
		tagline: "Auth, user mgmt, orgs, webhooks",
		icon: "memory",
		color: "#6c47ff",
		brand: "clerk",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-clerk-clerk", use: "auth mgmt, user lookup, org management" },
			{ rank: 2, kind: "plugin-skill", label: "7 skills", use: "setup, orgs, webhooks, testing, nextjs-patterns, custom-ui, clerk router" },
		],
	},
	{
		id: "firebase",
		name: "Firebase",
		tagline: "Auth, Firestore, hosting, App Hosting, Genkit",
		icon: "filesystem",
		color: "#ffcb2b",
		brand: "firebase",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-firebase-firebase", use: "project config, deploys, auth, Firestore" },
			{ rank: 2, kind: "plugin-skill", label: "11 skills", use: "auth, Firestore, hosting, App Hosting, Genkit, Data Connect, AI Logic" },
		],
	},
	{
		id: "figma",
		name: "Figma",
		tagline: "Read files, inspect designs, generate components",
		icon: "vision",
		color: "#f24e1e",
		brand: "figma",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-figma-figma", use: "read files, inspect designs, get component specs" },
			{ rank: 2, kind: "plugin-skill", label: "9 skills", use: "always load figma-use first; design systems, implement-design, code-connect, diagrams" },
		],
	},
	{
		id: "posthog",
		name: "PostHog",
		tagline: "HogQL, events, replays, flags",
		icon: "search",
		color: "#f9bd2b",
		brand: "posthog",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-posthog-posthog", use: "HogQL queries, event data, session replays, feature flags" },
			{ rank: 2, kind: "plugin-skill", label: "16 skills", use: "instrumentation (analytics, errors, flags, logs, LLM), experiments, autocapture, traces, query examples" },
		],
	},
	{
		id: "sentry",
		name: "Sentry",
		tagline: "Issues, alerts, error details, perf",
		icon: "search",
		color: "#362d59",
		brand: "sentry",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-sentry-sentry", use: "issues, alerts, error details, performance data" },
			{ rank: 2, kind: "plugin-skill", label: "26 skills", use: "SDK setup (15+ platforms), workflow, feature setup, code review, AI monitoring" },
		],
	},
	{
		id: "datadog",
		name: "Datadog",
		tagline: "Logs, metrics, traces, dashboards, monitors",
		icon: "search",
		color: "#632ca6",
		brand: "datadog",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-datadog-datadog", use: "logs, metrics, traces, dashboards, monitors (run ddsetup if MCP not responding)" },
			{ rank: 2, kind: "plugin-skill", label: "3 skills", use: "ddsetup, ddconfig, ddtoolsets" },
		],
	},
	{
		id: "linear",
		name: "Linear",
		tagline: "Issues, projects, team workflows",
		icon: "code",
		color: "#5e6ad2",
		brand: "linear",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-linear-linear", use: "issues, projects, team workflows" },
			{ rank: 2, kind: "personal-skill", label: "linear", use: "workflow automation via MCP" },
		],
	},
	{
		id: "slack",
		name: "Slack",
		tagline: "Messages, channels, search",
		icon: "memory",
		color: "#4a154b",
		brand: "slack",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-slack-slack", use: "messages, channels, search" },
			{ rank: 2, kind: "personal-skill", label: "slack", use: "browser-based automation via agent-browser" },
		],
	},
	{
		id: "shopify",
		name: "Shopify",
		tagline: "Admin API, Hydrogen, Liquid, Polaris, POS",
		icon: "code",
		color: "#95bf47",
		brand: "shopify",
		interfaces: [
			{ rank: 1, kind: "plugin-skill", label: "20+ skills", use: "Admin API, Hydrogen, Liquid, Polaris, checkout, POS, customer accounts, Shopify Functions, custom data" },
		],
	},
	{
		id: "clickhouse",
		name: "ClickHouse",
		tagline: "Query runs, schema inspection",
		icon: "search",
		color: "#fc0",
		brand: "clickhouse",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-clickhouse", use: "query runs, schema inspection" },
			{ rank: 2, kind: "plugin-skill", label: "1 skill", use: "clickhouse-best-practices (28 rules, MUST check before writing queries)" },
		],
	},
	{
		id: "github",
		name: "GitHub",
		tagline: "PRs, issues, checks, releases, API calls",
		icon: "code",
		color: "#fff",
		brand: "github",
		interfaces: [
			{ rank: 1, kind: "cli", label: "gh", use: "PRs, issues, checks, releases, API calls" },
			{ rank: 2, kind: "personal-skill", label: "9 skills", use: "issue, pr, yeet, pr-review, gh-fix-ci, gh-address-comments, split-to-prs, babysit, hotfix-preview" },
			{ rank: 3, kind: "mcp", label: "GitLens MCP", use: "git history, blame, diff" },
		],
	},
	{
		id: "aws",
		name: "AWS",
		tagline: "S3, ECS, SSM, ECR via SSO profiles",
		icon: "code",
		color: "#ff9900",
		brand: "amazonwebservices",
		interfaces: [
			{ rank: 1, kind: "cli", label: "aws", use: "SSO profiles: dcs (dev/preview), admin (prod), dcs-prod. S3, ECS, SSM, ECR." },
		],
	},
	{
		id: "cloudflare",
		name: "Cloudflare",
		tagline: "Workers, KV, D1, R2, tunnels",
		icon: "browser",
		color: "#f38020",
		brand: "cloudflare",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "cloudflare-workers MCP", use: "deploy Workers, KV read/write, D1 queries, R2 storage" },
			{ rank: 2, kind: "cli", label: "cloudflared", use: "Quick tunnels expose the agent's gateway publicly without a stable hostname" },
		],
	},
	{
		id: "neon",
		name: "Neon",
		tagline: "Serverless Postgres with branching",
		icon: "filesystem",
		color: "#00e599",
		brand: "neon",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "neon MCP", use: "create branches, run SQL, inspect schema, get connection strings" },
		],
	},
	{
		id: "upstash",
		name: "Upstash",
		tagline: "Serverless Redis + QStash message queue",
		icon: "filesystem",
		color: "#00e9a3",
		brand: "upstash",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "upstash MCP", use: "Redis get/set/scan, QStash publish/schedule" },
		],
	},
	{
		id: "turso",
		name: "Turso",
		tagline: "Edge SQLite databases",
		icon: "filesystem",
		color: "#4ff8d2",
		brand: "turso",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "turso MCP", use: "run queries, create databases, inspect schema" },
		],
	},
	{
		id: "resend",
		name: "Resend",
		tagline: "Transactional email API",
		icon: "memory",
		color: "#000",
		brand: "resend",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "resend MCP", use: "send emails, manage domains, track delivery" },
		],
	},
	{
		id: "notion",
		name: "Notion",
		tagline: "Workspace pages and databases",
		icon: "memory",
		color: "#000",
		brand: "notion",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "notion MCP", use: "search pages, query databases, create/update content" },
		],
	},
	{
		id: "brave-search",
		name: "Brave Search",
		tagline: "Independent web search index",
		icon: "search",
		color: "#fb542b",
		brand: "brave",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "brave-search MCP", use: "web search with independent index, local business search" },
		],
	},
	{
		id: "exa",
		name: "Exa",
		tagline: "Neural semantic search",
		icon: "search",
		color: "#5046e5",
		brand: "exa",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "exa MCP", use: "semantic search, content extraction, find similar pages" },
		],
	},
	{
		id: "memory-graph",
		name: "Memory",
		tagline: "Persistent knowledge graph for cross-session context",
		icon: "memory",
		color: "#d97706",
		brand: "anthropic",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "memory MCP", use: "create entities/relations, search graph, persist observations across sessions" },
		],
	},
	{
		id: "grafana",
		name: "Grafana",
		tagline: "Dashboards, alerts, Loki logs, Prometheus",
		icon: "search",
		color: "#f46800",
		brand: "grafana",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "grafana MCP", use: "query datasources, list dashboards, search logs, check alerts" },
		],
	},
	{
		id: "vercel-ai-gateway",
		name: "Vercel AI Gateway",
		tagline: "Unified model paths, provider failover, cost tracking",
		icon: "delegate",
		color: "#fff",
		brand: "vercel",
		interfaces: [
			{ rank: 1, kind: "cli", label: "@ai-sdk/gateway", use: "provider/model paths, OIDC auth, 200+ models via one endpoint" },
			{ rank: 2, kind: "plugin-skill", label: "ai-gateway skill", use: "model path guidance, provider failover, cost tracking" },
			{ rank: 3, kind: "plugin-skill", label: "ai-sdk skill", use: "streaming, tool calling, structured output" },
		],
	},
	{
		id: "browser",
		name: "Browser",
		tagline: "Automation, scraping, frontend verification",
		icon: "browser",
		color: "#fff",
		brand: "googlechrome",
		interfaces: [
			{ rank: 1, kind: "cli", label: "agent-browser", use: "ad-hoc browsing, frontend verification, scraping, computer use" },
			{ rank: 2, kind: "mcp", label: "Chrome DevTools MCP", use: "inspect user's existing browser session" },
			{ rank: 3, kind: "mcp", label: "cursor-ide-browser", use: "Cursor's built-in vision pipeline" },
			{ rank: 4, kind: "plugin-skill", label: "Playwright", use: "deterministic E2E in CI only" },
		],
	},
];

/* ------------------------------------------------------------------ */
/* Task hierarchy (mirrors tool-hierarchy.mdc Task Hierarchy)          */
/* ------------------------------------------------------------------ */

export type TaskTool = {
	rank: 1 | 2 | 3 | 4 | 5;
	label: string;
	use: string;
	skill?: string;
	/** Brand slug for `<ServiceIcon>` when this tool maps to a known
	 *  vendor (Playwright, GSAP, Framer Motion, etc.). Falls back to a
	 *  category `<ToolIcon>` when omitted. */
	brand?: ServiceSlug;
};

export type TaskCategoryIcon =
	| "browser"
	| "code"
	| "vision"
	| "search"
	| "memory"
	| "schedule"
	| "filesystem"
	| "shell"
	| "image";

export type TaskEntryIcon = TaskCategoryIcon;

export type TaskEntry = {
	id: string;
	name: string;
	tagline: string;
	/** ToolCategory key for the fallback `<ToolIcon>` in the task card
	 *  header. Picks the most representative category for the task. */
	category: ToolCategory;
	tools: TaskTool[];
};

export const TASKS: ReadonlyArray<TaskEntry> = [
	{
		id: "browser-automation",
		name: "Browser automation",
		tagline: "Snapshots, visual diff, React introspection, batch commands",
		category: "browser",
		tools: [
			{ rank: 1, label: "agent-browser", brand: "googlechrome", use: "ref-based snapshots, visual diff, React introspection, Web Vitals, batch commands", skill: "agent-browser" },
			{ rank: 2, label: "Chrome DevTools MCP", brand: "googlechrome", use: "inspect user's existing browser session" },
			{ rank: 3, label: "cursor-ide-browser", use: "Cursor's built-in vision pipeline" },
			{ rank: 4, label: "Playwright", brand: "playwright", use: "deterministic E2E in CI only" },
		],
	},
	{
		id: "frontend-verification",
		name: "Frontend verification",
		tagline: "Diff snapshots, screenshots, vitals, React renders",
		category: "vision",
		tools: [
			{ rank: 1, label: "agent-browser diff", brand: "googlechrome", use: "diff snapshot + diff screenshot + vitals + react renders", skill: "agent-browser" },
			{ rank: 2, label: "agent-browser screenshot --annotate", brand: "googlechrome", use: "visual inspection" },
			{ rank: 3, label: "Playwright", brand: "playwright", use: "regression test suites in CI only" },
		],
	},
	{
		id: "generative-ui",
		name: "Generative UI",
		tagline: "Catalog-constrained UI generation",
		category: "code",
		tools: [
			{ rank: 1, label: "json-render", use: "@json-render/core + shadcn + directives, catalog-constrained" },
			{ rank: 2, label: "AI SDK structured output", use: "when json-render not installed" },
		],
	},
	{
		id: "code-review",
		name: "Code review",
		tagline: "Find bugs that pass CI but blow up in prod",
		category: "code",
		tools: [
			{ rank: 1, label: "code-review", use: "staff-engineer review, production bugs", skill: "code-review" },
			{ rank: 2, label: "counterfactual", use: "compare against minimal correct algorithm", skill: "counterfactual" },
			{ rank: 3, label: "cross-modal-review", use: "second opinion from different model", skill: "cross-modal-review" },
		],
	},
	{
		id: "design-review",
		name: "Design review",
		tagline: "6-phase audit + animation + art direction",
		category: "vision",
		tools: [
			{ rank: 1, label: "design-review", use: "6-phase audit, 80-item checklist, letter grades", skill: "design-review" },
			{ rank: 2, label: "design-engineering", use: "animation decisions, component polish, performance rules", skill: "design-engineering" },
			{ rank: 3, label: "frontend-design-taste", use: "anti-slop enforcement, art direction", skill: "frontend-design-taste" },
			{ rank: 4, label: "frontend-design", use: "building new UI", skill: "frontend-design" },
			{ rank: 5, label: "web-design-guidelines", use: "Vercel Web Interface Guidelines", skill: "web-design-guidelines" },
		],
	},
	{
		id: "qa",
		name: "QA + testing",
		tagline: "Real-browser testing, regression tests, invariants",
		category: "browser",
		tools: [
			{ rank: 1, label: "qa", use: "exploratory QA with real browser", skill: "qa" },
			{ rank: 2, label: "dogfood", use: "systematic app exploration, structured bug reports" },
			{ rank: 3, label: "invariant-first-testing", use: "tests as invariants", skill: "invariant-first-testing" },
			{ rank: 4, label: "test-writing", use: "terse Unix-tradition harnesses", skill: "test-writing" },
			{ rank: 5, label: "Playwright", brand: "playwright", use: "deterministic E2E in CI only" },
		],
	},
	{
		id: "research",
		name: "Research",
		tagline: "Multi-platform social search, page extraction",
		category: "search",
		tools: [
			{ rank: 1, label: "last30days", use: "multi-platform social search (Reddit, X, YouTube, TikTok, IG, HN)", skill: "last30days" },
			{ rank: 2, label: "agent-reach", use: "17 platforms via CLI", skill: "agent-reach" },
			{ rank: 3, label: "web_search", use: "fallback for general web queries" },
		],
	},
	{
		id: "content",
		name: "Content creation",
		tagline: "Drafts, strategy, conversion copy",
		category: "memory",
		tools: [
			{ rank: 1, label: "social-draft", use: "platform-optimized drafting (X, LinkedIn)", skill: "social-draft" },
			{ rank: 2, label: "social-content", use: "strategy, repurposing, engagement", skill: "social-content" },
			{ rank: 3, label: "copywriting", use: "conversion copy, CTAs, headlines", skill: "copywriting" },
			{ rank: 4, label: "content-strategy", use: "positioning arcs, calendars", skill: "content-strategy" },
		],
	},
	{
		id: "seo",
		name: "SEO + GEO",
		tagline: "AI-search optimization + traditional SEO + audits",
		category: "search",
		tools: [
			{ rank: 1, label: "seo-geo-optimization", use: "GEO for AI search + traditional SEO", skill: "seo-geo-optimization" },
			{ rank: 2, label: "seo-audit", use: "technical SEO audit", skill: "seo-audit" },
			{ rank: 3, label: "og-metadata-audit", use: "OpenGraph, Twitter cards", skill: "og-metadata-audit" },
		],
	},
	{
		id: "security",
		name: "Security",
		tagline: "Vuln scans, CTF-style review, threat modeling",
		category: "shell",
		tools: [
			{ rank: 1, label: "deepsec", use: "agent-powered vulnerability scanner", skill: "deepsec" },
			{ rank: 2, label: "bugs", use: "CTF-style adversarial review", skill: "bugs" },
			{ rank: 3, label: "security-best-practices", use: "language-specific secure coding" },
			{ rank: 4, label: "security-threat-model", use: "trust boundaries, abuse paths" },
		],
	},
	{
		id: "animation",
		name: "Animation",
		tagline: "Scroll, component, physics, AE",
		category: "image",
		tools: [
			{ rank: 1, label: "GSAP + ScrollTrigger", brand: "gsap", use: "scroll-driven narratives, pinned sections" },
			{ rank: 2, label: "Motion (Framer Motion)", brand: "framer", use: "component entrances, layout, gestures" },
			{ rank: 3, label: "React Spring", brand: "react", use: "physics-based spring dynamics" },
			{ rank: 4, label: "Lottie", use: "After Effects JSON animations" },
		],
	},
	{
		id: "three-d",
		name: "3D",
		tagline: "WebGL / WebGPU rendering",
		category: "vision",
		tools: [
			{ rank: 1, label: "React Three Fiber + drei", brand: "react", use: "declarative 3D in React" },
			{ rank: 2, label: "Three.js", brand: "threedotjs", use: "outside React or no abstraction needed" },
			{ rank: 3, label: "OGL / custom GLSL", use: "shader IS the idea" },
			{ rank: 4, label: "Babylon.js", use: "game engine features" },
		],
	},
];

/* ------------------------------------------------------------------ */
/* Trusted add-on catalog                                              */
/* ------------------------------------------------------------------ */

export const TRUSTED_ADDONS: ReadonlyArray<TrustedAddOn> = [
	{
		id: "mcp-vercel",
		name: "Vercel MCP",
		kind: "mcp",
		provider: "Vercel",
		description:
			"Deployments, logs, env vars, domains, projects, and Vercel platform configuration through MCP.",
		source: "plugin-vercel-vercel",
		command: null,
		brand: "vercel",
	},
	{
		id: "mcp-supabase",
		name: "Supabase MCP",
		kind: "mcp",
		provider: "Supabase",
		description:
			"Schema inspection, auth settings, RLS checks, and safe database reads through Supabase MCP.",
		source: "plugin-supabase-supabase",
		command: null,
		brand: "supabase",

	},
	{
		id: "mcp-stripe",
		name: "Stripe MCP",
		kind: "mcp",
		provider: "Stripe",
		description:
			"Customers, subscriptions, invoices, products, and payment lookup without writing custom API glue.",
		source: "plugin-stripe-stripe",
		command: null,
		brand: "stripe",

	},
	{
		id: "mcp-clerk",
		name: "Clerk MCP",
		kind: "mcp",
		provider: "Clerk",
		description:
			"User lookup, auth configuration, organizations, membership, and webhooks for B2B SaaS agents.",
		source: "plugin-clerk-clerk",
		command: null,
		brand: "clerk",

	},
	{
		id: "mcp-posthog",
		name: "PostHog MCP",
		kind: "mcp",
		provider: "PostHog",
		description:
			"HogQL, feature flags, experiments, session replays, LLM traces, analytics, and product events.",
		source: "plugin-posthog-posthog",
		command: null,
		brand: "posthog",

	},
	{
		id: "mcp-sentry",
		name: "Sentry MCP",
		kind: "mcp",
		provider: "Sentry",
		description:
			"Production issues, stack traces, alert context, release health, and performance traces.",
		source: "plugin-sentry-sentry",
		command: null,
		brand: "sentry",

	},
	{
		id: "mcp-datadog",
		name: "Datadog MCP",
		kind: "mcp",
		provider: "Datadog",
		description:
			"Logs, metrics, traces, dashboards, monitors, and incident investigation across Datadog orgs.",
		source: "plugin-datadog-datadog",
		command: null,
		brand: "datadog",

	},
	{
		id: "mcp-figma",
		name: "Figma MCP",
		kind: "mcp",
		provider: "Figma",
		description:
			"Read file structure, inspect components, create frames, and generate design system artifacts.",
		source: "plugin-figma-figma",
		command: null,
		brand: "figma",

	},
	{
		id: "mcp-linear",
		name: "Linear MCP",
		kind: "mcp",
		provider: "Linear",
		description:
			"Create and update issues, read project state, link implementation work to tickets, and triage backlog.",
		source: "plugin-linear-linear",
		command: null,
		brand: "linear",

	},
	{
		id: "cli-gh",
		name: "GitHub CLI",
		kind: "cli",
		provider: "GitHub",
		description:
			"Canonical interface for PRs, issues, checks, releases, API calls, and branch workflow automation.",
		source: "github/cli",
		command: "gh",
		brand: "github",

	},
	{
		id: "cli-vercel",
		name: "Vercel CLI",
		kind: "cli",
		provider: "Vercel",
		description:
			"Deploy, link, inspect logs, pull env vars, manage domains, and debug builds from the machine.",
		source: "vercel/vercel",
		command: "vercel",
		brand: "vercel",

	},
	{
		id: "cli-sprites",
		name: "Sprites CLI",
		kind: "cli",
		provider: "Sprites.dev",
		description:
			"Manage Sprites sandboxes, checkpoints, command sessions, and public URLs when Sprites is selected as a provider.",
		source: "sprites-dev/cli",
		command: "sprites",

	},
	{
		id: "cli-cloudflared",
		name: "cloudflared",
		kind: "cli",
		provider: "Cloudflare",
		description:
			"Quick tunnels for public agent gateway exposure when provider-native previews are unavailable.",
		source: "cloudflare/cloudflared",
		command: "cloudflared",
		brand: "cloudflare",

	},
	{
		id: "cli-aws",
		name: "AWS CLI",
		kind: "cli",
		provider: "AWS",
		description:
			"SSO-backed access to S3, ECR, ECS, SSM, CloudWatch, and account diagnostics with profile guardrails.",
		source: "aws/aws-cli",
		command: "aws",
		brand: "amazonwebservices",

	},
	{
		id: "tool-cursor-sdk",
		name: "Cursor TypeScript SDK",
		kind: "tool",
		provider: "Cursor",
		description:
			"Programmatically run Cursor coding agents from scripts, services, CI, and machine-side automations.",
		source: "@cursor/sdk",
		command: "pnpm add @cursor/sdk",

	},
	{
		id: "tool-agent-browser",
		name: "agent-browser",
		kind: "tool",
		provider: "Browser automation",
		description:
			"Agent-friendly browser automation with snapshots, screenshots, ref-based actions, and visual QA hooks.",
		source: "bootstrap + CLI",
		command: "agent-browser",
		brand: "googlechrome",

	},
	{
		id: "tool-playwright",
		name: "Playwright",
		kind: "tool",
		provider: "Microsoft",
		description:
			"Deterministic browser testing and replayable E2E specs for CI, smoke tests, and regressions.",
		source: "microsoft/playwright",
		command: "pnpm exec playwright",
		brand: "playwright",

	},
	{
		id: "cli-api-probing",
		name: "API probing toolkit",
		kind: "cli",
		provider: "Machine baseline",
		description:
			"curl, httpx, and jq are installed for endpoint smoke tests, JSON inspection, and real response verification.",
		source: "apt + uv tool",
		command: "curl | jq; httpx",

	},
	{
		id: "cli-sqlite3",
		name: "sqlite3",
		kind: "cli",
		provider: "SQLite",
		description:
			"Inspect local databases, verify migrations, query schemas, and confirm persisted state without leaving the VM.",
		source: "sqlite.org",
		command: "sqlite3",

	},
	{
		id: "cli-network-debugging",
		name: "Network debugging",
		kind: "cli",
		provider: "Linux",
		description:
			"ss, dig, curl -v, and nc are available for listener checks, DNS lookups, and connection debugging.",
		source: "iproute2 + dnsutils + netcat",
		command: "ss -tlnp; dig; curl -v; nc",

	},
	{
		id: "skill-deepsec",
		name: "deepsec",
		kind: "skill",
		provider: "Security",
		description:
			"Agent-powered vulnerability scanner with regex calibration, parallel investigation, and revalidation.",
		source: ".cursor/skills/deepsec/SKILL.md",
		command: null,

	},
	{
		id: "skill-gstack-qa",
		name: "gstack-qa",
		kind: "skill",
		provider: "QA",
		description:
			"Real-browser QA lead that tests flows, captures evidence, fixes obvious bugs, and writes regressions.",
		source: ".cursor/skills/gstack-qa/SKILL.md",
		command: null,

	},
	{
		id: "skill-frontend-design-taste",
		name: "frontend-design-taste",
		kind: "skill",
		provider: "Design",
		description:
			"Anti-generic frontend taste skill with art direction, design dials, and production UI guardrails.",
		source: ".cursor/skills/frontend-design-taste/SKILL.md",
		command: null,

	},
	{
		id: "plugin-vercel",
		name: "Vercel skill pack",
		kind: "plugin",
		provider: "Vercel",
		description:
			"Next.js, AI SDK, caching, deployments, functions, storage, middleware, shadcn, and platform guidance.",
		source: "cursor-public/vercel skills",
		command: null,
		brand: "vercel",

	},
	{
		id: "source-github-skill-repo",
		name: "GitHub skill repo",
		kind: "source",
		provider: "GitHub",
		description:
			"Import a repository containing SKILL.md files, MCP descriptors, scripts, or package manifests.",
		source: "github:<owner>/<repo>",
		command: null,
		brand: "github",

	},
	{
		id: "source-url-manifest",
		name: "URL manifest",
		kind: "source",
		provider: "Web",
		description:
			"Load a remote JSON/YAML manifest that defines skills, MCP servers, CLIs, npm packages, or docs links.",
		source: "https://example.com/agent-machines.json",
		command: null,

	},
	{
		id: "source-official-mcp-registry",
		name: "Official MCP server registry",
		kind: "source",
		provider: "Model Context Protocol",
		description:
			"Add maintained MCP servers from the official modelcontextprotocol server registry instead of hand-copying descriptors.",
		source: "github:modelcontextprotocol/servers",
		command: null,
		brand: "github",

	},
	{
		id: "source-cursor-plugin-skills",
		name: "Cursor plugin skill packs",
		kind: "source",
		provider: "Cursor",
		description:
			"Import plugin-published SKILL.md packs and MCP descriptors from installed Cursor plugins into a machine preset.",
		source: "~/.cursor/plugins + ~/.cursor/skills",
		command: null,

	},
	{
		id: "source-internal-agent-manifest",
		name: "Internal agent manifest",
		kind: "source",
		provider: "Private catalog",
		description:
			"Point at a company-owned JSON/YAML manifest that declares approved skills, CLIs, MCP servers, package installs, and docs.",
		source: "https://your-domain.example/agent-machines.json",
		command: null,

	},
	{
		id: "source-openapi-docs",
		name: "OpenAPI / docs source",
		kind: "source",
		provider: "API documentation",
		description:
			"Attach OpenAPI specs or docs URLs so an agent preset can ground service-specific tools against reputable source material.",
		source: "openapi:https://api.example.com/openapi.json",
		command: null,

	},
	{
		id: "cli-pnpm",
		name: "pnpm",
		kind: "cli",
		provider: "Node.js",
		description:
			"Workspace-aware package manager for installing and running project tools inside the VM without changing the app contract.",
		source: "pnpm.io",
		command: "corepack enable pnpm",

	},
	{
		id: "cli-uv",
		name: "uv",
		kind: "cli",
		provider: "Astral",
		description:
			"Fast Python package and tool runner for Python-heavy agents, analysis scripts, and isolated command-line utilities.",
		source: "astral-sh/uv",
		command: "uv tool install <package>",
		brand: "github",

	},
	{
		id: "cli-docker",
		name: "Docker CLI",
		kind: "cli",
		provider: "Docker",
		description:
			"Optional container workflow surface for repos that already ship Dockerfiles or compose files and need parity checks.",
		source: "docker/cli",
		command: "docker",

	},
	{
		id: "mcp-playwright",
		name: "Playwright MCP",
		kind: "mcp",
		provider: "Microsoft",
		description:
			"Browser automation MCP option for deterministic page inspection, screenshots, and user-flow testing.",
		source: "@playwright/mcp",
		command: "npx @playwright/mcp",
		brand: "playwright",

	},
	{
		id: "tool-shadcn-registry",
		name: "shadcn registry",
		kind: "tool",
		provider: "shadcn/ui",
		description:
			"Composable UI source for importing audited component recipes and custom registry items into frontend presets.",
		source: "ui.shadcn.com/registry",
		command: "pnpm dlx shadcn@latest add <component>",

	},
	{
		id: "tool-tailwindcss",
		name: "Tailwind CSS",
		kind: "tool",
		provider: "Tailwind Labs",
		description:
			"Tokenized utility CSS surface for frontend-heavy agents that need to edit dense responsive interfaces quickly.",
		source: "tailwindcss.com/docs",
		command: "pnpm add tailwindcss @tailwindcss/postcss",
		brand: "tailwindcss",

	},
	{
		id: "provider-sprites-dev",
		name: "Sprites.dev",
		kind: "provider",
		provider: "Sprites",
		description:
			"Sprites.dev compute with public URL proxy. Live MachineProvider alongside Dedalus and E2B.",
		source: "sprites.dev",
		command: null,
	},
	{
		id: "cli-agent-browser",
		name: "agent-browser",
		kind: "cli",
		provider: "Browser automation",
		description:
			"Persistent browser sessions with ref-based snapshots, visual diff, React introspection, Web Vitals, and batch commands. 164K+ weekly installs.",
		source: "vercel-labs/agent-browser",
		command: "agent-browser",
		brand: "googlechrome",

	},
	{
		id: "cli-agent-reach",
		name: "agent-reach",
		kind: "cli",
		provider: "Internet access",
		description:
			"17-platform CLI for reading and searching Twitter/X, Reddit, YouTube, GitHub, LinkedIn, RSS, and web pages with zero API fees.",
		source: "Panniantong/Agent-Reach",
		command: "agent-reach",

	},
	{
		id: "cli-skills-sh",
		name: "skills.sh CLI",
		kind: "cli",
		provider: "Skills registry",
		description:
			"Open registry for agent skills. Search, install, update, and audit skills from skills.sh with security vetting. 900K+ weekly installs.",
		source: "vercel-labs/skills",
		command: "npx skills find [query]",

	},
	{
		id: "source-skills-sh-registry",
		name: "skills.sh registry",
		kind: "source",
		provider: "Vercel Labs",
		description:
			"The definitive open skills registry. Browse the leaderboard at skills.sh for battle-tested skills across React, testing, design, deployment, and more.",
		source: "https://skills.sh",
		command: null,

	},
	{
		id: "cli-defuddle",
		name: "defuddle",
		kind: "cli",
		provider: "Page extraction",
		description:
			"Local webpage content extractor that parses URLs to clean markdown or JSON with metadata. No API dependency fallback for Jina Reader.",
		source: "defuddle",
		command: "npx defuddle parse URL --markdown",

	},
	{
		id: "cli-yt-dlp",
		name: "yt-dlp",
		kind: "cli",
		provider: "YouTube",
		description:
			"Video metadata, transcripts, and subtitle extraction from YouTube and other video platforms for research workflows.",
		source: "yt-dlp/yt-dlp",
		command: "yt-dlp --dump-json URL",

	},
	{
		id: "tool-deepsec",
		name: "deepsec CLI",
		kind: "tool",
		provider: "Vercel Labs",
		description:
			"Agent-powered vulnerability scanner that dispatches coding agents at max reasoning to investigate security-sensitive files. Regex pre-scan + revalidation.",
		source: "vercel-labs/deepsec",
		command: "npx deepsec scan --limit 50",

	},
	{
		id: "cli-jina-reader",
		name: "Jina Reader",
		kind: "cli",
		provider: "Jina AI",
		description:
			"Web page reader that converts any URL to clean text via r.jina.ai. Primary extraction method before falling back to defuddle.",
		source: "jina-ai/reader",
		command: "curl -s https://r.jina.ai/URL",

	},
	{
		id: "mcp-slack",
		name: "Slack MCP",
		kind: "mcp",
		provider: "Slack",
		description:
			"Channel messages, search, thread context, and workspace navigation for agent workflows that need Slack integration.",
		source: "plugin-slack-slack",
		command: null,
		brand: "slack",

	},
	{
		id: "mcp-sanity",
		name: "Sanity MCP",
		kind: "mcp",
		provider: "Sanity",
		description:
			"Content modeling, GROQ queries, schema inspection, and Studio configuration for headless CMS workflows.",
		source: "plugin-sanity-Sanity",
		command: null,

	},
	{
		id: "mcp-firebase",
		name: "Firebase MCP",
		kind: "mcp",
		provider: "Firebase",
		description:
			"Project config, deploys, auth, Firestore, App Hosting, and Genkit integration for Firebase-backed applications.",
		source: "plugin-firebase-firebase",
		command: null,
		brand: "firebase",

	},
	{
		id: "mcp-shopify",
		name: "Shopify skill pack",
		kind: "plugin",
		provider: "Shopify",
		description:
			"Admin API, Hydrogen, Liquid, Polaris, checkout, POS, customer accounts, Shopify Functions, and custom data skills.",
		source: "cursor-public/shopify skills",
		command: null,
		brand: "shopify",

	},
	{
		id: "cli-hermes",
		name: "Hermes agent",
		kind: "cli",
		provider: "Nous Research",
		description:
			"Self-improving agent runtime with memory, cron, sessions, MCP host, and OpenAI-compatible gateway. Installed via uv into the VM.",
		source: "NousResearch/hermes-agent",
		command: "hermes",

	},
	{
		id: "cli-openclaw",
		name: "OpenClaw agent",
		kind: "cli",
		provider: "OpenClaw",
		description:
			"Anthropic computer-use agent with browser, screenshot, shell, and vision. Global npm install, same /v1 gateway surface.",
		source: "openclaw/openclaw",
		command: "openclaw",
	},
	{
		id: "cli-stripe",
		name: "Stripe CLI",
		kind: "cli",
		provider: "Stripe",
		description:
			"Webhook listener, event triggering, fixtures, and log tailing for local Stripe integration development.",
		source: "stripe/stripe-cli",
		command: "stripe",
		brand: "stripe",

	},
	{
		id: "cli-supabase",
		name: "Supabase CLI",
		kind: "cli",
		provider: "Supabase",
		description:
			"Database migrations, schema diff, type generation, and local development server for Supabase projects.",
		source: "supabase/cli",
		command: "supabase",
		brand: "supabase",

	},
	{
		id: "mcp-cursor-bridge",
		name: "cursor-bridge",
		kind: "mcp",
		provider: "Agent Machines",
		description:
			"Bundled MCP server exposing cursor_agent, cursor_resume, cursor_list_skills, and cursor_models via @cursor/sdk.",
		source: "mcp/cursor-bridge/src/server.ts",
		command: null,

	},
	{
		id: "mcp-chrome-devtools",
		name: "Chrome DevTools MCP",
		kind: "mcp",
		provider: "Google / community",
		description:
			"Inspect an existing Chrome session for live debugging, console access, and performance profiling.",
		source: "Chrome DevTools Protocol",
		command: null,
		brand: "googlechrome",

	},
	{
		id: "mcp-gitlens",
		name: "GitLens MCP",
		kind: "mcp",
		provider: "GitLens",
		description:
			"Git history, blame, diff, and commit inspection through MCP for code archaeology workflows.",
		source: "GitLens extension",
		command: null,
		brand: "github",

	},
	{
		id: "cli-mcporter",
		name: "mcporter",
		kind: "cli",
		provider: "MCP ecosystem",
		description:
			"Call MCP tools from the shell. Used in agent-reach workflows for Exa semantic search and other MCP tool invocations.",
		source: "mcporter",
		command: "mcporter call 'tool.method(...)'",

	},
	{
		id: "cli-ultracite",
		name: "ultracite",
		kind: "cli",
		provider: "Ultracite",
		description:
			"Opinionated lint and format doctor for TypeScript projects. Diagnoses and fixes config in one pass.",
		source: "ultracite",
		command: "npx ultracite doctor",

	},
	{
		id: "skill-find-skills",
		name: "find-skills",
		kind: "skill",
		provider: "Skills registry",
		description:
			"Points agents at skills.sh for discovery and installation of battle-tested skills across React, testing, design, and deployment.",
		source: "knowledge/skills/find-skills/SKILL.md",
		command: null,

	},
	{
		id: "skill-skill-auditor",
		name: "skill-auditor",
		kind: "skill",
		provider: "Security",
		description:
			"6-step vetting protocol for any skill before installation: typosquatting, permissions, deps, prompt injection, exfiltration, content.",
		source: "knowledge/skills/skill-auditor/SKILL.md",
		command: null,

	},
	{
		id: "tool-json-render",
		name: "@json-render/core",
		kind: "tool",
		provider: "Generative UI",
		description:
			"Catalog-constrained generative UI with shadcn integration and directives for structured AI output rendering.",
		source: "@json-render/core",
		command: "pnpm add @json-render/core",

	},
	{
		id: "mcp-clickhouse",
		name: "ClickHouse MCP",
		kind: "mcp",
		provider: "ClickHouse",
		description:
			"Query runs and schema inspection for ClickHouse databases with best-practices enforcement.",
		source: "plugin-clickhouse",
		command: null,
		brand: "clickhouse",

	},
	{
		id: "provider-ai-gateway",
		name: "Vercel AI Gateway",
		kind: "provider",
		provider: "Vercel",
		description:
			"Unified model paths to 200+ models across OpenAI, Anthropic, Google, Mistral, and more. OIDC auth, provider failover, cost tracking, and rate limit management through one endpoint.",
		source: "@ai-sdk/gateway",
		command: "pnpm add @ai-sdk/gateway",
		brand: "vercel",

	},
	{
		id: "mcp-neon",
		name: "Neon MCP",
		kind: "mcp",
		provider: "Neon",
		description:
			"Serverless Postgres with instant branching, schema inspection, and SQL runs for development workflows.",
		source: "@neondatabase/mcp-server-neon",
		command: null,
		brand: "neon",

	},
	{
		id: "mcp-upstash",
		name: "Upstash MCP",
		kind: "mcp",
		provider: "Upstash",
		description:
			"Serverless Redis key-value operations and QStash message scheduling without connection management.",
		source: "@upstash/mcp-server",
		command: null,
		brand: "upstash",

	},
	{
		id: "mcp-turso",
		name: "Turso MCP",
		kind: "mcp",
		provider: "Turso",
		description:
			"Edge SQLite databases with multi-region replication, SQL queries, and schema inspection.",
		source: "@tursodatabase/mcp-server",
		command: null,
		brand: "turso",

	},
	{
		id: "mcp-resend",
		name: "Resend MCP",
		kind: "mcp",
		provider: "Resend",
		description:
			"Transactional email sending, domain management, delivery tracking, and contact list operations.",
		source: "resend-mcp",
		command: null,
		brand: "resend",

	},
	{
		id: "mcp-notion",
		name: "Notion MCP",
		kind: "mcp",
		provider: "Notion",
		description:
			"Workspace page search, database queries, content creation, and block-level editing for knowledge workflows.",
		source: "notion-mcp",
		command: null,
		brand: "notion",

	},
	{
		id: "mcp-brave-search",
		name: "Brave Search MCP",
		kind: "mcp",
		provider: "Brave",
		description:
			"Independent web search and local business lookup without tracking or ad bias.",
		source: "@anthropic/mcp-server-brave",
		command: null,
		brand: "brave",

	},
	{
		id: "mcp-exa",
		name: "Exa MCP",
		kind: "mcp",
		provider: "Exa",
		description:
			"Neural semantic search that understands meaning, with content extraction and similarity discovery.",
		source: "exa-mcp-server",
		command: null,
		brand: "exa",

	},
	{
		id: "mcp-memory",
		name: "Memory MCP",
		kind: "mcp",
		provider: "Anthropic",
		description:
			"Persistent knowledge graph for creating entities, relations, and observations that survive across sessions.",
		source: "@anthropic/mcp-server-memory",
		command: null,

	},
	{
		id: "mcp-cloudflare-workers",
		name: "Cloudflare Workers MCP",
		kind: "mcp",
		provider: "Cloudflare",
		description:
			"Deploy Workers, read/write KV, query D1, and manage R2 storage through MCP.",
		source: "@cloudflare/mcp-server-cloudflare",
		command: null,
		brand: "cloudflare",

	},
	{
		id: "mcp-grafana",
		name: "Grafana MCP",
		kind: "mcp",
		provider: "Grafana Labs",
		description:
			"Query Prometheus/Loki/Tempo datasources, list dashboards, check alerts, and search logs.",
		source: "grafana-mcp-server",
		command: null,
		brand: "grafana",

	},
	// -- Document conversion & extraction --
	{
		id: "tool-markitdown",
		name: "markitdown",
		kind: "tool",
		provider: "Microsoft",
		description:
			"Convert PDFs, Word, Excel, PowerPoint, audio, and YouTube URLs into clean LLM-ready markdown.",
		source: "microsoft/markitdown",
		command: "pip install markitdown && markitdown",

	},
	{
		id: "tool-langextract",
		name: "LangExtract",
		kind: "tool",
		provider: "Google",
		description:
			"Document extraction engine that outperforms enterprise tools. Handles scanned documents, tables, and complex layouts.",
		source: "google/langextract",
		command: "pip install langextract",

	},
	{
		id: "tool-nia-docs",
		name: "nia-docs",
		kind: "tool",
		provider: "nia-docs",
		description:
			"Mount any docs site as a virtual filesystem with tree, grep, and cat. Query Stripe/Vercel/any docs without leaving the terminal.",
		source: "nia-docs",
		command: "npx nia-docs https://docs.example.com -c \"tree\"",

	},
	// -- Code quality & static analysis --
	{
		id: "tool-code-review-graph",
		name: "code-review-graph",
		kind: "tool",
		provider: "Tree-sitter knowledge graph",
		description:
			"Local AST knowledge graph with 22 MCP tools. Computes blast-radius, review context, and dependency edges. 8.2x fewer tokens on average.",
		source: "tirth8205/code-review-graph",
		command: "pip install code-review-graph && code-review-graph build",

	},
	{
		id: "tool-react-doctor",
		name: "react-doctor",
		kind: "tool",
		provider: "React hygiene",
		description:
			"Automated React codebase health check. Finds stale state, missing deps, component over-renders, and anti-patterns.",
		source: "react-doctor",
		command: "npx react-doctor@latest",

	},
	{
		id: "tool-ruff",
		name: "ruff",
		kind: "tool",
		provider: "Astral",
		description:
			"Blazing-fast Python linter and formatter. 100x faster than flake8. Drop-in replacement for flake8, isort, pyupgrade, and more.",
		source: "astral-sh/ruff",
		command: "uv tool install ruff && ruff check .",

	},
	// -- Generative UI --
	{
		id: "tool-json-render-react",
		name: "@json-render/react",
		kind: "tool",
		provider: "Vercel Labs",
		description:
			"React renderer for JSON UI specs. Maps AI-generated JSON 1:1 to your component library with type safety and streaming.",
		source: "@json-render/react",
		command: "pnpm add @json-render/react",

	},
	{
		id: "tool-json-render-next",
		name: "@json-render/next",
		kind: "tool",
		provider: "Vercel Labs",
		description:
			"Full Next.js apps from JSON specs — pages, layouts, SSR, metadata. The end state of generative-UI-first development.",
		source: "@json-render/next",
		command: "pnpm add @json-render/next",

	},
	{
		id: "tool-json-render-mcp",
		name: "@json-render/mcp",
		kind: "tool",
		provider: "Vercel Labs",
		description:
			"MCP Apps integration for Claude, ChatGPT, Cursor, and VS Code. Generative UI in any AI context.",
		source: "@json-render/mcp",
		command: "pnpm add @json-render/mcp",

	},
	// -- Audio & video --
	{
		id: "tool-vibevoice",
		name: "VibeVoice",
		kind: "tool",
		provider: "Microsoft",
		description:
			"Transcribes 60+ min audio in one pass with speaker diarization. Offline, no API costs.",
		source: "microsoft/VibeVoice",
		command: "pip install vibevoice",

	},
	// -- Frontend components --
	{
		id: "tool-shadcn-apply",
		name: "shadcn apply",
		kind: "tool",
		provider: "shadcn/ui",
		description:
			"Apply full design presets across a project — components, themes, colors, fonts, icons in one command.",
		source: "ui.shadcn.com/docs/cli",
		command: "npx shadcn apply",

	},
	{
		id: "tool-sonner",
		name: "sonner",
		kind: "tool",
		provider: "Emil Kowalski",
		description:
			"Opinionated toast component for React. Beautiful defaults, accessible, composable.",
		source: "emilkowal/sonner",
		command: "pnpm add sonner",

	},
	{
		id: "tool-cmdk",
		name: "cmdk",
		kind: "tool",
		provider: "Paco",
		description:
			"Fast, unstyled command menu React component. Drop-in cmd+K palette for any app.",
		source: "pacocoursey/cmdk",
		command: "pnpm add cmdk",

	},
	// -- Web search & scraping --
	{
		id: "tool-lightpanda",
		name: "Lightpanda",
		kind: "tool",
		provider: "Lightpanda",
		description:
			"Headless browser 10x faster, 10x less memory than Chrome. Default engine for agent-browser.",
		source: "lightpanda.io",
		command: "agent-browser open (auto-uses Lightpanda)",
		brand: "googlechrome",

	},
	{
		id: "tool-qmd",
		name: "qmd",
		kind: "tool",
		provider: "Tobi Lütke",
		description:
			"Local markdown search engine with hybrid BM25/vector search + LLM re-ranking. Also runs as an MCP server.",
		source: "tobi/qmd",
		command: "npx qmd search \"query\"",

	},
	{
		id: "tool-fieldtheory",
		name: "FieldTheory",
		kind: "tool",
		provider: "FieldTheory",
		description:
			"X/Twitter bookmark sync, semantic search, and wiki generation from saved content.",
		source: "fieldtheory.dev",
		command: "npm i -g fieldtheory && ft sync",

	},
	// -- Security & compliance --
	{
		id: "tool-brin",
		name: "brin",
		kind: "tool",
		provider: "Agent security",
		description:
			"Pre-scan every npm/pip/cargo install for malware, typosquatting, and prompt injection before it reaches the machine.",
		source: "brin-agent-security",
		command: "Global hook at ~/.cursor/hooks/brin-check.sh",

	},
	// -- Deployment & hosting --
	{
		id: "tool-coolify",
		name: "Coolify",
		kind: "tool",
		provider: "Self-hosting",
		description:
			"Open-source PaaS — self-hosted Heroku/Vercel/Netlify alternative with 280+ one-click services.",
		source: "coolify.io",
		command: "curl -fsSL https://cdn.coolify.io/install.sh | bash",

	},
	// -- Design & creative --
	{
		id: "tool-oklch",
		name: "oklch-skill",
		kind: "skill",
		provider: "Color science",
		description:
			"OKLCH color space: conversion, palette generation, contrast checking, gamut boundaries, and Tailwind v4 theme tokens.",
		source: "~/.agents/skills/oklch-skill/SKILL.md",
		command: null,

	},
	{
		id: "tool-heerich",
		name: "heerich.js",
		kind: "tool",
		provider: "Creative coding",
		description:
			"Tiny voxel engine that renders 3D scenes to SVG. Isometric pixel art in code.",
		source: "meodai/heerich",
		command: "npm install heerich",

	},
	// -- Agent frameworks --
	{
		id: "tool-t3-code",
		name: "T3 Code",
		kind: "tool",
		provider: "T3 OSS",
		description:
			"Open-source coding agent built on Codex CLI. Alternative terminal-first agent for code tasks.",
		source: "t3-oss/t3-code",
		command: "npm install -g t3-code",

	},
	{
		id: "tool-cursor-orchestrate",
		name: "Cursor Orchestrate",
		kind: "tool",
		provider: "Cursor",
		description:
			"Recursive Cursor SDK agents for fan-out tasks — parallelize across files, services, or approaches.",
		source: "Cursor SDK + /orchestrate skill",
		command: null,

	},
	// -- Browser automation extensions --
	{
		id: "tool-autobrowse",
		name: "Autobrowse",
		kind: "tool",
		provider: "Browserbase",
		description:
			"Learn a site once, save as SKILL.md, amortize discovery cost on all future runs. Persisted browser playbooks.",
		source: "browserbase/skills",
		command: null,

	},
	// -- Animation & 3D libraries --
	{
		id: "tool-gsap",
		name: "GSAP",
		kind: "tool",
		provider: "GreenSock",
		description:
			"Professional-grade animation platform. Timeline-based sequencing, ScrollTrigger, physics, and morph plugins.",
		source: "gsap",
		command: "pnpm add gsap",
		brand: "gsap",

	},
	{
		id: "tool-framer-motion",
		name: "Motion (Framer)",
		kind: "tool",
		provider: "Framer",
		description:
			"Production animation library for React. Spring physics, layout animations, gestures, exit animations.",
		source: "motion",
		command: "pnpm add motion",
		brand: "framer",

	},
	{
		id: "tool-react-spring",
		name: "React Spring",
		kind: "tool",
		provider: "React Spring",
		description:
			"Physics-based animation with spring dynamics. Feels natural — no durations, just physical forces.",
		source: "@react-spring/web",
		command: "pnpm add @react-spring/web",
		brand: "react",

	},
	{
		id: "tool-lottie-react",
		name: "lottie-react",
		kind: "tool",
		provider: "LottieFiles",
		description:
			"Render After Effects animations as JSON vectors in React. Zero runtime cost, designer-friendly workflow.",
		source: "lottie-react",
		command: "pnpm add lottie-react",

	},
	{
		id: "tool-react-three-fiber",
		name: "React Three Fiber",
		kind: "tool",
		provider: "Poimandres",
		description:
			"Declarative 3D scenes in React with Three.js. Component-based, hooks-first, state-managed 3D.",
		source: "@react-three/fiber",
		command: "pnpm add @react-three/fiber @react-three/drei three",
		brand: "react",

	},
	// -- Context efficiency --
	{
		id: "tool-lean-ctx",
		name: "lean-ctx",
		kind: "tool",
		provider: "Context optimization",
		description:
			"Trim Cursor / Claude Code context to reduce token cost. Evaluate at repo bootstrap for instant savings.",
		source: "yvgude/lean-ctx",
		command: "npx lean-ctx",

	},
	// -- Skills registry --
	{
		id: "plugin-shopify",
		name: "Shopify skill pack",
		kind: "plugin",
		provider: "Shopify",
		description:
			"20+ skills: Admin API, Hydrogen, Liquid, Polaris, checkout, POS, Shopify Functions, customer accounts, and custom data.",
		source: "cursor-public/shopify",
		command: null,
		brand: "shopify",

	},
	{
		id: "plugin-firebase",
		name: "Firebase skill pack",
		kind: "plugin",
		provider: "Google",
		description:
			"11 skills: auth, Firestore, hosting, App Hosting, Genkit JS/Dart, Data Connect, AI Logic, local env setup.",
		source: "cursor-public/firebase",
		command: null,
		brand: "firebase",

	},
	{
		id: "plugin-sanity",
		name: "Sanity skill pack",
		kind: "plugin",
		provider: "Sanity",
		description:
			"4 skills: Sanity best practices, content modeling, SEO/AEO, and content experimentation.",
		source: "cursor-public/sanity",
		command: null,

	},
	{
		id: "plugin-figma",
		name: "Figma skill pack",
		kind: "plugin",
		provider: "Figma",
		description:
			"9 skills: figma-use (mandatory), code-connect, generate-design, generate-diagram, generate-library, FigJam, Slides.",
		source: "cursor-public/figma",
		command: null,
		brand: "figma",

	},
	{
		id: "plugin-stripe",
		name: "Stripe skill pack",
		kind: "plugin",
		provider: "Stripe",
		description:
			"3 skills: stripe-best-practices (API selection, Connect, billing, security), stripe-projects, upgrade-stripe.",
		source: "cursor-public/stripe",
		command: null,
		brand: "stripe",

	},
	{
		id: "plugin-clickhouse",
		name: "ClickHouse skill pack",
		kind: "plugin",
		provider: "ClickHouse",
		description:
			"1 skill: clickhouse-best-practices — 28 rules that MUST be checked before any schema/query recommendation.",
		source: "cursor-public/clickhouse",
		command: null,
		brand: "clickhouse",

	},
	{
		id: "plugin-datadog",
		name: "Datadog skill pack",
		kind: "plugin",
		provider: "Datadog",
		description:
			"3 skills: ddsetup (first-time init), ddconfig (domain/org switching), ddtoolsets (enable/disable tool groups).",
		source: "cursor-public/datadog",
		command: null,
		brand: "datadog",

	},
	{
		id: "plugin-supabase",
		name: "Supabase skill pack",
		kind: "plugin",
		provider: "Supabase",
		description:
			"2 skills: full Supabase development (Auth, RLS, Edge Functions, Realtime, SSR) + Postgres performance best practices.",
		source: "cursor-public/supabase",
		command: null,
		brand: "supabase",

	},
	{
		id: "plugin-clerk",
		name: "Clerk skill pack",
		kind: "plugin",
		provider: "Clerk",
		description:
			"20 skills: setup, orgs, billing, webhooks, testing, and framework patterns (Next.js, React, Vue, Expo, Swift, Android).",
		source: "cursor-public/clerk",
		command: null,
		brand: "clerk",

	},
	{
		id: "plugin-posthog",
		name: "PostHog skill pack",
		kind: "plugin",
		provider: "PostHog",
		description:
			"54 skills: HogQL, experiments, feature flags, LLM traces, warehouse, signals, instrumentation, and error triage.",
		source: "cursor-public/posthog",
		command: null,
		brand: "posthog",

	},
	{
		id: "plugin-sentry",
		name: "Sentry skill pack",
		kind: "plugin",
		provider: "Sentry",
		description:
			"30 skills: SDK setup and review across 15+ platforms, alerts, AI monitoring, and workflow automation.",
		source: "cursor-public/sentry",
		command: null,
		brand: "sentry",

	},
	{
		id: "plugin-linear",
		name: "Linear skill pack",
		kind: "plugin",
		provider: "Linear",
		description:
			"Cursor plugin for Linear — issues, projects, documents, and team workflows via MCP.",
		source: "cursor-public/linear",
		command: null,
		brand: "linear",

	},
	{
		id: "plugin-granola",
		name: "Granola skill pack",
		kind: "plugin",
		provider: "Granola",
		description:
			"Meeting context skills (context, prep, review), commands for specs/plans/PRs, and Granola MCP for notes and transcripts.",
		source: "cursor-public/granola",
		command: null,
		brand: "granola",

	},
	{
		id: "plugin-firecrawl",
		name: "Firecrawl skill pack",
		kind: "plugin",
		provider: "Firecrawl",
		description:
			"Web scrape, crawl, map, and search via the Firecrawl CLI — optimized markdown for agent context.",
		source: "cursor-public/firecrawl",
		command: null,
		brand: "firecrawl",

	},
	{
		id: "plugin-render",
		name: "Render skill pack",
		kind: "plugin",
		provider: "Render",
		description:
			"21 skills: deploy, blueprints, Postgres, cron jobs, Docker, domains, scaling, and Render MCP operations.",
		source: "cursor-public/render",
		command: null,
		brand: "render",

	},
	{
		id: "plugin-huggingface",
		name: "Hugging Face skill pack",
		kind: "plugin",
		provider: "Hugging Face",
		description:
			"Dataset viewer, model training, evaluation, Hub CLI, Gradio, and Jobs for ML workflows on Hugging Face.",
		source: "cursor-public/huggingface-skills",
		command: null,
		brand: "huggingface",

	},
	{
		id: "plugin-context7",
		name: "Context7 skill pack",
		kind: "plugin",
		provider: "Upstash",
		description:
			"Up-to-date library documentation lookup via Context7 MCP — version-specific docs from source repos.",
		source: "cursor-public/context7-plugin",
		command: null,
		brand: "context7",

	},
	{
		id: "plugin-superpowers",
		name: "Superpowers skill pack",
		kind: "plugin",
		provider: "obra",
		description:
			"14 skills: TDD, systematic debugging, planning, code review, git worktrees, and verification-before-completion.",
		source: "cursor-public/superpowers",
		command: null,

	},
	{
		id: "plugin-slack",
		name: "Slack skill pack",
		kind: "plugin",
		provider: "Slack",
		description:
			"Slack MCP — search channels, send messages, and automate workspace actions from the agent.",
		source: "cursor-public/slack",
		command: null,
		brand: "slack",

	},
	{
		id: "mcp-granola",
		name: "Granola MCP",
		kind: "mcp",
		provider: "Granola",
		description:
			"Query meetings, list folders, fetch transcripts, and search notes from Granola via MCP.",
		source: "plugin-granola-granola",
		command: null,
		brand: "granola",

	},
	{
		id: "mcp-render",
		name: "Render MCP",
		kind: "mcp",
		provider: "Render",
		description:
			"Deploy, inspect logs, manage services, Postgres, and blueprints on Render through MCP.",
		source: "plugin-render-render",
		command: null,
		brand: "render",

	},
	{
		id: "mcp-context7",
		name: "Context7 MCP",
		kind: "mcp",
		provider: "Upstash",
		description:
			"Resolve library IDs and query up-to-date documentation for any framework or package.",
		source: "plugin-context7-plugin-context7",
		command: null,
		brand: "context7",

	},
	{
		id: "mcp-huggingface",
		name: "Hugging Face MCP",
		kind: "mcp",
		provider: "Hugging Face",
		description:
			"Hugging Face Hub operations — models, datasets, spaces, and inference via MCP.",
		source: "plugin-huggingface-skills",
		command: null,
		brand: "huggingface",

	},
	{
		id: "cli-firecrawl",
		name: "Firecrawl CLI",
		kind: "cli",
		provider: "Firecrawl",
		description:
			"Scrape, crawl, map, and search the web with agent-optimized markdown output.",
		source: "https://docs.firecrawl.dev",
		command: "npm install -g firecrawl-cli",
		brand: "firecrawl",

	},
	// -- Misc agent utilities --
	{
		id: "tool-floci",
		name: "Floci",
		kind: "tool",
		provider: "AWS emulation",
		description:
			"Single-binary local AWS emulator (Go). S3, SQS, SNS, DynamoDB on localhost — no Docker needed.",
		source: "wiki/tools/floci.md",
		command: "floci",
		brand: "amazonwebservices",

	},
	{
		id: "tool-graphite",
		name: "Graphite",
		kind: "tool",
		provider: "Graphite",
		description:
			"AI code review, stacked PRs, and merge queue. Integrates with GitHub as a review bot.",
		source: "graphite.dev",
		command: "gt (Graphite CLI)",
		brand: "github",

	},
	{
		id: "tool-zero-native",
		name: "Zero Native",
		kind: "tool",
		provider: "Vercel Labs",
		description:
			"Zig native desktop/mobile shell around web UIs. Ship as native app while writing web code.",
		source: "zero-native.dev",
		command: null,
		brand: "vercel",

	},
];

export function buildTrustedAddOnCatalog({
	skills,
	mcps,
	builtins,
	services,
	tasks,
}: {
	skills: ReadonlyArray<SkillSummary>;
	mcps: ReadonlyArray<McpServerWithBrand>;
	builtins: ReadonlyArray<BuiltinTool>;
	services: ReadonlyArray<ServiceEntry>;
	tasks: ReadonlyArray<TaskEntry>;
}): TrustedAddOn[] {
	const items: TrustedAddOn[] = [...TRUSTED_ADDONS];
	for (const skill of skills) {
		items.push({
			id: `skill-${skill.slug}`,
			name: skill.name,
			kind: "skill",
			provider: `Skill library / ${skill.category}`,
			description: skill.description,
			source: `knowledge/skills/${skill.slug}/SKILL.md`,
			command: null,
	
		});
	}
	for (const tool of builtins) {
		items.push({
			id: `builtin-${tool.name}`,
			name: tool.title,
			kind: "tool",
			provider: tool.provider === "rig" ? "Agent Machines" : tool.provider,
			description: tool.description,
			source: `builtin:${tool.name}`,
			command: tool.name,
		});
	}
	for (const server of mcps) {
		items.push({
			id: `mcp-server-${slug(server.name)}`,
			name: server.name,
			kind: "mcp",
			provider: server.source,
			description: `${server.transport} MCP server exposing ${server.tools.length} callable tools.`,
			source: server.link ?? server.source,
			command: null,
	
		});
		for (const tool of server.tools) {
			items.push({
				id: `mcp-tool-${slug(server.name)}-${slug(tool.name)}`,
				name: tool.title,
				kind: "tool",
				provider: server.name,
				description: tool.description,
				source: `${server.name}:${tool.name}`,
				command: tool.name,
		
			});
		}
	}
	for (const service of services) {
		for (const iface of service.interfaces) {
			items.push({
				id: `service-${service.id}-${iface.rank}-${slug(iface.label)}`,
				name: `${service.name} / ${iface.label}`,
				kind: interfaceKindToAddOn(iface.kind),
				provider: service.name,
				description: iface.use,
				source: iface.label,
				command: iface.kind === "cli" ? iface.label : null,
				brand: service.brand,
		
			});
		}
	}
	for (const task of tasks) {
		for (const tool of task.tools) {
			items.push({
				id: `task-${task.id}-${tool.rank}-${slug(tool.label)}`,
				name: `${task.name} / ${tool.label}`,
				kind: tool.skill ? "skill" : "tool",
				provider: "Task hierarchy",
				description: tool.use,
				source: tool.skill ?? tool.label,
				command: tool.skill ? null : tool.label,
				brand: tool.brand,
		
			});
		}
	}
	return dedupeAddOns(items);
}

function interfaceKindToAddOn(kind: InterfaceKind): TrustedAddOnKind {
	if (kind === "mcp") return "mcp";
	if (kind === "cli") return "cli";
	if (kind === "plugin-skill") return "plugin";
	return "skill";
}

function dedupeAddOns(items: TrustedAddOn[]): TrustedAddOn[] {
	const seen = new Set<string>();
	const deduped: TrustedAddOn[] = [];
	for (const item of items) {
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		deduped.push(item);
	}
	return deduped;
}

export function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ */
/* Aggregate counts                                                    */
/* ------------------------------------------------------------------ */

export type LoadoutCounts = {
	skills: number;
	mcpServers: number;
	mcpTools: number;
	builtinTools: number;
	services: number;
	tasks: number;
	trustedAddOns: number;
	total: number;
};

export function computeCounts(args: {
	skills: number;
	mcpServers: number;
	mcpTools: number;
	trustedAddOns?: number;
}): LoadoutCounts {
	const builtinTools = BUILTIN_TOOLS.length;
	const services = SERVICES.length;
	const tasks = TASKS.length;
	const trustedAddOns = args.trustedAddOns ?? TRUSTED_ADDONS.length;
	return {
		skills: args.skills,
		mcpServers: args.mcpServers,
		mcpTools: args.mcpTools,
		builtinTools,
		services,
		tasks,
		trustedAddOns,
		total: args.skills + args.mcpTools + builtinTools,
	};
}

export const CATEGORY_LABEL: Record<ToolCategory, string> = {
	shell: "Shell",
	filesystem: "Filesystem",
	browser: "Browser",
	vision: "Vision",
	code: "Code",
	memory: "Memory",
	schedule: "Schedule",
	search: "Search",
	audio: "Audio",
	image: "Image",
	delegate: "Delegate",
};

export const INTERFACE_LABEL: Record<InterfaceKind, string> = {
	mcp: "MCP",
	cli: "CLI",
	"plugin-skill": "Plugin skill",
	"personal-skill": "Personal skill",
};

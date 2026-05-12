/**
 * Loadout registry for the rig.
 *
 * Mirrors the wiki's `config/cursor/rules/tool-hierarchy.mdc` -- the
 * always-applied tool registry that ranks interfaces per service and
 * tools per task. Surfaced on `/dashboard/loadout` so the user can see
 * exactly what's available to their agent at a glance, with each entry
 * tagged for which agent (Hermes / OpenClaw / both) can call it.
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
 * Plus skills (in `skills.ts`) -- 96 SKILL.md files that load on
 * demand to nudge the agent's behavior on a specific task type.
 */

import type { Mark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { SkillSummary } from "@/lib/dashboard/types";

export type AgentSupport = "hermes" | "openclaw" | "both";

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
	agent: AgentSupport;
};

export type BuiltinTool = {
	name: string;
	title: string;
	description: string;
	category: ToolCategory;
	agent: AgentSupport;
	provider: Mark | "rig";
};

/**
 * Native tools the running agent can invoke without going through an
 * MCP server. Hermes ships its catalog as part of the
 * `hermes-agent` install; OpenClaw ships its catalog as part of
 * `openclaw@latest`. Tools tagged `agent: "both"` are available
 * regardless of which agent is currently active on the user's machine.
 */
export const BUILTIN_TOOLS: ReadonlyArray<BuiltinTool> = [
	{
		name: "terminal",
		title: "Shell terminal",
		description:
			"Run any shell command in the VM. Streams stdout/stderr back to the chat. Used for git, tests, build pipelines, package installs, system inspection.",
		category: "shell",
		agent: "both",
		provider: "rig",
	},
	{
		name: "read_file",
		title: "Read file",
		description:
			"Read a file from the VM filesystem with optional offset/limit. Bounded output to keep the agent's context window healthy.",
		category: "filesystem",
		agent: "both",
		provider: "rig",
	},
	{
		name: "write_file",
		title: "Write file",
		description:
			"Write or overwrite a file on the VM. Strict path checks keep writes inside ~/work and ~/.agent-machines by default.",
		category: "filesystem",
		agent: "both",
		provider: "rig",
	},
	{
		name: "patch",
		title: "Patch file",
		description:
			"Apply a unified diff to an existing file. Cheaper than full rewrites for surgical edits.",
		category: "filesystem",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "search",
		title: "Repo search",
		description:
			"ripgrep over the working directory. Supports regex, glob filters, multiline matches.",
		category: "filesystem",
		agent: "both",
		provider: "rig",
	},
	{
		name: "browser_navigate",
		title: "Navigate browser",
		description:
			"Drive a Playwright browser inside the VM. Navigate to a URL, wait for load, return the rendered DOM.",
		category: "browser",
		agent: "both",
		provider: "rig",
	},
	{
		name: "browser_click",
		title: "Click element",
		description:
			"Click an element by accessible selector. Pairs with browser_snapshot to find the right ref.",
		category: "browser",
		agent: "both",
		provider: "rig",
	},
	{
		name: "browser_type",
		title: "Type text",
		description:
			"Type into a focused input. Handles complex IME and shift-modifier sequences.",
		category: "browser",
		agent: "both",
		provider: "rig",
	},
	{
		name: "browser_snapshot",
		title: "Page snapshot",
		description:
			"Returns a YAML-shaped accessibility snapshot of the current page. Refs from this snapshot drive subsequent click/type calls.",
		category: "browser",
		agent: "both",
		provider: "rig",
	},
	{
		name: "browser_screenshot",
		title: "Screenshot page",
		description:
			"PNG screenshot of the viewport or a specific element. Stored as an artifact under ~/.agent-machines/artifacts/.",
		category: "browser",
		agent: "both",
		provider: "rig",
	},
	{
		name: "computer_use",
		title: "Computer-use macro",
		description:
			"Mouse + keyboard automation against a virtual display. The Anthropic computer-use loop, drives a real X server inside the VM.",
		category: "browser",
		agent: "openclaw",
		provider: "openclaw",
	},
	{
		name: "vision_analyze",
		title: "Vision analysis",
		description:
			"Send a screenshot or image file to the LLM with a vision-capable model. Returns a structured description.",
		category: "vision",
		agent: "both",
		provider: "rig",
	},
	{
		name: "image_generate",
		title: "Generate image",
		description:
			"Generate images with FLUX via FAL. Optional. Requires FAL_KEY in ~/.agent-machines/.env when used.",
		category: "image",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "tts",
		title: "Text-to-speech",
		description:
			"Synthesize speech from text. Edge TTS by default; ElevenLabs if ELEVENLABS_API_KEY is set.",
		category: "audio",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "execute_code",
		title: "Execute Python",
		description:
			"Sandboxed Python that can call other tools via internal RPC. Best for analysis, math, data wrangling, multi-step scripts.",
		category: "code",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "delegate_task",
		title: "Delegate to subagent",
		description:
			"Spawn a subagent for parallel work. Subagent inherits parent's tools + skills; returns a final message back to the parent.",
		category: "delegate",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "cronjob",
		title: "Schedule cron",
		description:
			"Create / list / edit / remove scheduled tasks. Persisted across machine sleep/wake; the cron runner wakes the machine when due.",
		category: "schedule",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "skills_list",
		title: "List skills",
		description:
			"Enumerate the SKILL.md files in ~/.agent-machines/skills. The agent inspects this when picking which skill conventions to load.",
		category: "memory",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "skill_view",
		title: "View skill",
		description:
			"Read a single SKILL.md body to load its conventions into the active turn.",
		category: "memory",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "memory",
		title: "Persistent memory",
		description:
			"Read / update USER.md and MEMORY.md so future conversations have context without re-explaining.",
		category: "memory",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "session_search",
		title: "FTS5 session search",
		description:
			"Full-text search over every prior conversation stored in ~/.agent-machines/sessions/*.db. Surfaces past tool outputs as context.",
		category: "search",
		agent: "hermes",
		provider: "nous",
	},
	{
		name: "web_search",
		title: "Web search",
		description:
			"Live web search. Returns ranked results with snippets. Used as the first move for any 'what's the latest on X' question.",
		category: "search",
		agent: "both",
		provider: "rig",
	},
	{
		name: "web_extract",
		title: "Extract page",
		description:
			"Pull the readable content from a URL with images + metadata. Defuddle-style cleanup before the LLM sees the bytes.",
		category: "search",
		agent: "both",
		provider: "rig",
	},
];

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
		tagline: "Query execution, schema inspection",
		icon: "search",
		color: "#fc0",
		brand: "clickhouse",
		interfaces: [
			{ rank: 1, kind: "mcp", label: "plugin-clickhouse", use: "query execution, schema inspection" },
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
		tagline: "Tunnels (cloudflared)",
		icon: "browser",
		color: "#f38020",
		brand: "cloudflare",
		interfaces: [
			{ rank: 1, kind: "cli", label: "cloudflared", use: "Quick tunnels expose the agent's gateway publicly without a stable hostname. We fall back to *.trycloudflare.com when Dedalus previews aren't configured for the org." },
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
	},
	{
		id: "cli-fly",
		name: "Fly CLI",
		kind: "cli",
		provider: "Fly.io",
		description:
			"Manage Fly apps, volumes, machines, secrets, deploys, and logs when Fly is selected as a provider.",
		source: "superfly/flyctl",
		command: "flyctl",
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "hermes",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
	},
	{
		id: "provider-vercel-sandbox",
		name: "Vercel Sandbox",
		kind: "provider",
		provider: "Vercel",
		description:
			"Ephemeral microVM sessions for safe code execution, browser automation, and temporary agent runs.",
		source: "@vercel/sandbox",
		command: null,
		brand: "vercel",
		agent: "both",
	},
	{
		id: "provider-fly-machines",
		name: "Fly Machines",
		kind: "provider",
		provider: "Fly.io",
		description:
			"Persistent app-scoped machines with volumes, useful when users want an alternative long-lived runtime.",
		source: "Fly Machines API",
		command: "flyctl",
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "hermes",
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
		agent: "openclaw",
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
		agent: "both",
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
		agent: "both",
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
		agent: "hermes",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
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
		agent: "both",
	},
	{
		id: "skill-find-skills",
		name: "find-skills",
		kind: "skill",
		provider: "Skills registry",
		description:
			"Routes agents to skills.sh for discovery and installation of battle-tested skills across React, testing, design, and deployment.",
		source: "knowledge/skills/find-skills/SKILL.md",
		command: null,
		agent: "both",
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
		agent: "both",
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
		agent: "both",
	},
	{
		id: "mcp-clickhouse",
		name: "ClickHouse MCP",
		kind: "mcp",
		provider: "ClickHouse",
		description:
			"Query execution and schema inspection for ClickHouse databases with best-practices enforcement.",
		source: "plugin-clickhouse",
		command: null,
		brand: "clickhouse",
		agent: "both",
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
			agent: "both",
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
			agent: tool.agent,
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
			agent: "both",
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
				agent: "both",
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
				agent: "both",
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
				agent: "both",
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

function slug(value: string): string {
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

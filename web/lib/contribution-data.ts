import type { Mark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";

export type ContributionEvent = {
	kind:
		| "skill"
		| "mcp"
		| "cron"
		| "cursor"
		| "wake"
		| "sleep"
		| "deploy"
		| "milestone"
		| "compute"
		| "browser"
		| "codegen";
	label: string;
	detail?: string;
	brand?: ServiceSlug | "dedalus" | "nous" | "cursor" | "openclaw";
	category?: ToolCategory;
};

export type PartnerKey = Mark | "claude-code" | "codex";

export type ContributionDay = {
	date: string;
	partner: PartnerKey;
	intensity: 0 | 1 | 2 | 3 | 4;
	events: ContributionEvent[];
};

const SEED = 0x4d4f4f4e;

function makePrng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function pickPartner(rng: () => number): ContributionDay["partner"] {
	const roll = rng();
	if (roll < 0.32) return "dedalus";
	if (roll < 0.52) return "nous";
	if (roll < 0.67) return "openclaw";
	if (roll < 0.82) return "cursor";
	if (roll < 0.92) return "claude-code";
	return "codex";
}

type SkillEntry = {
	name: string;
	brand?: ContributionEvent["brand"];
	category?: ContributionEvent["category"];
};

const SKILLS: ReadonlyArray<SkillEntry> = [
	{ name: "agent-ethos", category: "memory" },
	{ name: "empirical-verification", category: "search" },
	{ name: "taste-output", category: "code" },
	{ name: "deepsec", category: "shell" },
	{ name: "torvalds", category: "code" },
	{ name: "counterfactual", category: "search" },
	{ name: "code-review", category: "code" },
	{ name: "reticle-design-system", category: "vision" },
	{ name: "automation-cron", category: "schedule" },
	{ name: "production-safety", category: "shell" },
	{ name: "design-review", category: "vision" },
	{ name: "design-engineering", category: "vision" },
	{ name: "frontend-design-taste", category: "vision" },
	{ name: "qa", category: "browser" },
	{ name: "dogfood", category: "browser" },
	{ name: "invariant-first-testing", category: "code" },
	{ name: "test-writing", category: "code" },
	{ name: "voice", category: "memory" },
	{ name: "social-draft", category: "memory" },
	{ name: "content-strategy", category: "memory" },
	{ name: "copywriting", category: "memory" },
	{ name: "seo-geo-optimization", category: "search" },
	{ name: "og-metadata-audit", category: "search" },
	{ name: "bugs", category: "shell" },
	{ name: "security-best-practices", category: "shell" },
	{ name: "cross-modal-review", category: "code" },
	{ name: "loading-screens", category: "vision" },
	{ name: "agent-browser", brand: "googlechrome" },
	{ name: "playwright", brand: "playwright" },
	{ name: "cursor-coding", brand: "cursor" },
	{ name: "vercel-react-best-practices", brand: "vercel" },
	{ name: "supabase", brand: "supabase" },
	{ name: "supabase-postgres-best-practices", brand: "supabase" },
	{ name: "stripe-best-practices", brand: "stripe" },
	{ name: "upgrade-stripe", brand: "stripe" },
	{ name: "clerk-orgs", brand: "clerk" },
	{ name: "clerk-webhooks", brand: "clerk" },
	{ name: "posthog-llm-traces", brand: "posthog" },
	{ name: "posthog-instrumentation", brand: "posthog" },
	{ name: "posthog-experiments", brand: "posthog" },
	{ name: "sentry-workflow", brand: "sentry" },
	{ name: "sentry-sdk-setup", brand: "sentry" },
	{ name: "sentry-feature-setup", brand: "sentry" },
	{ name: "datadog-setup", brand: "datadog" },
	{ name: "linear-workflow", brand: "linear" },
	{ name: "shopify-admin", brand: "shopify" },
	{ name: "shopify-hydrogen", brand: "shopify" },
	{ name: "shopify-functions", brand: "shopify" },
	{ name: "clickhouse-best-practices", brand: "clickhouse" },
	{ name: "firebase-basics", brand: "firebase" },
	{ name: "firebase-auth", brand: "firebase" },
	{ name: "figma-implement-design", brand: "figma" },
	{ name: "figma-design-system", brand: "figma" },
	{ name: "ai-sdk", brand: "vercel" },
	{ name: "ai-gateway", brand: "vercel" },
	{ name: "vercel-functions", brand: "vercel" },
	{ name: "vercel-sandbox", brand: "vercel" },
	{ name: "next-cache-components", brand: "nextdotjs" },
	{ name: "next-upgrade", brand: "nextdotjs" },
	{ name: "react-best-practices", brand: "react" },
	{ name: "anthropic-prompting", brand: "anthropic" },
	{ name: "openai-docs", brand: "openai" },
	{ name: "github-pr-review", brand: "github" },
	{ name: "slack-automation", brand: "slack" },
	{ name: "tailwindcss", brand: "tailwindcss" },
	{ name: "gsap-scrolltrigger", brand: "gsap" },
	{ name: "framer-motion", brand: "framer" },
	{ name: "typescript-strict", brand: "typescript" },
	{ name: "playwright-e2e", brand: "playwright" },
	{ name: "playcanvas-scene", brand: "playcanvas" },
	{ name: "threejs-webgl", brand: "threedotjs" },
];

type McpEntry = {
	name: string;
	brand?: ContributionEvent["brand"];
	category?: ContributionEvent["category"];
};

const MCPS: ReadonlyArray<McpEntry> = [
	{ name: "cursor_agent", brand: "cursor" },
	{ name: "cursor_resume", brand: "cursor" },
	{ name: "shell_exec", category: "shell" },
	{ name: "fs_read", category: "filesystem" },
	{ name: "fs_write", category: "filesystem" },
	{ name: "fs_glob", category: "filesystem" },
	{ name: "ripgrep_search", category: "search" },
	{ name: "browser_use", category: "browser" },
	{ name: "browser_screenshot", category: "vision" },
	{ name: "vision_analyze", category: "vision" },
	{ name: "image_generate", category: "image" },
	{ name: "cron_create", category: "schedule" },
	{ name: "memory_read", category: "memory" },
	{ name: "session_search", category: "search" },
	{ name: "delegate_task", category: "delegate" },
	{ name: "vercel_deploy", brand: "vercel" },
	{ name: "vercel_logs", brand: "vercel" },
	{ name: "vercel_env", brand: "vercel" },
	{ name: "vercel_alias", brand: "vercel" },
	{ name: "supabase_query", brand: "supabase" },
	{ name: "supabase_migrate", brand: "supabase" },
	{ name: "supabase_rls", brand: "supabase" },
	{ name: "stripe_get_customer", brand: "stripe" },
	{ name: "stripe_create_subscription", brand: "stripe" },
	{ name: "stripe_refund", brand: "stripe" },
	{ name: "stripe_listen", brand: "stripe" },
	{ name: "linear_create_issue", brand: "linear" },
	{ name: "linear_update", brand: "linear" },
	{ name: "linear_close", brand: "linear" },
	{ name: "github_open_pr", brand: "github" },
	{ name: "github_review", brand: "github" },
	{ name: "github_merge", brand: "github" },
	{ name: "github_search", brand: "github" },
	{ name: "slack_post", brand: "slack" },
	{ name: "slack_dm", brand: "slack" },
	{ name: "slack_search", brand: "slack" },
	{ name: "posthog_query", brand: "posthog" },
	{ name: "posthog_flag", brand: "posthog" },
	{ name: "posthog_replay", brand: "posthog" },
	{ name: "sentry_assign", brand: "sentry" },
	{ name: "sentry_resolve", brand: "sentry" },
	{ name: "sentry_alert", brand: "sentry" },
	{ name: "clerk_invite", brand: "clerk" },
	{ name: "clerk_user_lookup", brand: "clerk" },
	{ name: "firebase_set", brand: "firebase" },
	{ name: "firestore_query", brand: "firebase" },
	{ name: "figma_inspect", brand: "figma" },
	{ name: "figma_export", brand: "figma" },
	{ name: "shopify_order", brand: "shopify" },
	{ name: "shopify_admin_query", brand: "shopify" },
	{ name: "clickhouse_query", brand: "clickhouse" },
	{ name: "datadog_query", brand: "datadog" },
	{ name: "aws_s3_put", brand: "amazonwebservices" },
	{ name: "aws_ecs_describe", brand: "amazonwebservices" },
	{ name: "cloudflare_tunnel", brand: "cloudflare" },
	{ name: "cloudflare_purge", brand: "cloudflare" },
	{ name: "anthropic_messages", brand: "anthropic" },
	{ name: "openai_chat", brand: "openai" },
	{ name: "gsap_animate", brand: "gsap" },
	{ name: "framer_layout", brand: "framer" },
	{ name: "typescript_check", brand: "typescript" },
	{ name: "playwright_test", brand: "playwright" },
	{ name: "threejs_render", brand: "threedotjs" },
];

type OpenclawTool = {
	label: string;
	category?: ContributionEvent["category"];
};

const OPENCLAW_TOOLS: ReadonlyArray<OpenclawTool> = [
	{ label: "browser.navigate", category: "browser" },
	{ label: "browser.click_xy", category: "browser" },
	{ label: "browser.screenshot", category: "vision" },
	{ label: "browser.snapshot", category: "browser" },
	{ label: "browser.fill_form", category: "browser" },
	{ label: "browser.scroll", category: "browser" },
	{ label: "shell.exec", category: "shell" },
	{ label: "computer.move_mouse", category: "browser" },
	{ label: "computer.type_text", category: "browser" },
	{ label: "computer.press_key", category: "browser" },
	{ label: "computer.drag", category: "browser" },
	{ label: "vision.analyze", category: "vision" },
	{ label: "vision.diff_screenshots", category: "vision" },
];

const CRON_NAMES = [
	"hourly-health-check",
	"daily-wiki-digest",
	"nightly-memory-consolidation",
	"weekly-skill-audit",
];

function buildDayEvents(
	rng: () => number,
	partner: ContributionDay["partner"],
	intensity: number,
): ContributionEvent[] {
	if (intensity === 0) return [];
	const events: ContributionEvent[] = [];
	const count = 1 + Math.min(3, Math.floor(intensity * rng() * 1.4));

	for (let i = 0; i < count; i++) {
		const r = rng();
		if (partner === "cursor") {
			if (r < 0.45) {
				const mcp = MCPS[Math.floor(rng() * MCPS.length)];
				events.push({
					kind: "cursor",
					label: "cursor_agent run",
					detail: `tool: ${mcp.name} . dur: ${(rng() * 30 + 4).toFixed(1)}s`,
					brand: mcp.brand ?? "cursor",
					category: mcp.category,
				});
			} else if (r < 0.75) {
				const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
				events.push({
					kind: "mcp",
					label: "cursor_resume",
					detail: `loaded skill: ${skill.name}`,
					brand: skill.brand ?? "cursor",
					category: skill.category,
				});
			} else {
				const mcp = MCPS[Math.floor(rng() * MCPS.length)];
				events.push({
					kind: "mcp",
					label: mcp.name,
					detail: "cursor subagent . exit 0",
					brand: mcp.brand ?? "cursor",
					category: mcp.category,
				});
			}
		} else if (partner === "claude-code") {
			if (r < 0.5) {
				const mcp = MCPS[Math.floor(rng() * MCPS.length)];
				events.push({
					kind: "codegen",
					label: "claude-code run",
					detail: `tool: ${mcp.name} . tokens: ${Math.floor(rng() * 6000 + 500)}`,
					brand: mcp.brand ?? "anthropic",
					category: mcp.category,
				});
			} else if (r < 0.8) {
				const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
				events.push({
					kind: "skill",
					label: `loaded ${skill.name}`,
					detail: "claude-code . AGENTS.md",
					brand: skill.brand ?? "anthropic",
					category: skill.category,
				});
			} else {
				events.push({
					kind: "codegen",
					label: "multi-file edit",
					detail: `${Math.floor(rng() * 12 + 2)} files . ${Math.floor(rng() * 400 + 30)} lines`,
					brand: "anthropic",
					category: "code",
				});
			}
		} else if (partner === "codex") {
			if (r < 0.5) {
				const mcp = MCPS[Math.floor(rng() * MCPS.length)];
				events.push({
					kind: "codegen",
					label: "codex run",
					detail: `tool: ${mcp.name} . sandbox exec`,
					brand: mcp.brand ?? "openai",
					category: mcp.category,
				});
			} else if (r < 0.78) {
				const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
				events.push({
					kind: "skill",
					label: `loaded ${skill.name}`,
					detail: "codex-cli . AGENTS.md",
					brand: skill.brand ?? "openai",
					category: skill.category,
				});
			} else {
				events.push({
					kind: "codegen",
					label: "codex patch",
					detail: `${Math.floor(rng() * 8 + 1)} hunks . applied`,
					brand: "openai",
					category: "code",
				});
			}
		} else if (partner === "nous") {
			if (r < 0.55) {
				const mcp = MCPS[Math.floor(rng() * MCPS.length)];
				events.push({
					kind: "mcp",
					label: mcp.name,
					detail: `tokens: ${Math.floor(rng() * 4000 + 200)}`,
					brand: mcp.brand,
					category: mcp.category,
				});
			} else if (r < 0.78) {
				const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
				events.push({
					kind: "skill",
					label: `loaded ${skill.name}`,
					detail: "intent match . in-context",
					brand: skill.brand ?? "nous",
					category: skill.category,
				});
			} else {
				const name = CRON_NAMES[Math.floor(rng() * CRON_NAMES.length)];
				events.push({
					kind: "cron",
					label: `${name} fired`,
					detail: r < 0.85 ? "exit 0" : "exit 1 . retried",
					brand: "nous",
					category: "schedule",
				});
			}
		} else if (partner === "openclaw") {
			if (r < 0.55) {
				const tool = OPENCLAW_TOOLS[Math.floor(rng() * OPENCLAW_TOOLS.length)];
				events.push({
					kind: "browser",
					label: tool.label,
					detail: `dur: ${(rng() * 6 + 0.4).toFixed(1)}s`,
					brand: "openclaw",
					category: tool.category,
				});
			} else if (r < 0.85) {
				events.push({
					kind: "compute",
					label: "computer-use loop",
					detail: `${Math.floor(rng() * 8 + 2)} steps . X server`,
					brand: "openclaw",
					category: "browser",
				});
			} else {
				events.push({
					kind: "mcp",
					label: "screenshot artifact",
					detail: "saved to /home/machine/.agent-machines/artifacts",
					brand: "openclaw",
					category: "vision",
				});
			}
		} else if (partner === "dedalus") {
			if (r < 0.35) {
				events.push({
					kind: "wake",
					label: "machine woke",
					detail: `${(rng() * 4 + 1.5).toFixed(1)}s . tunnel reused`,
					brand: "dedalus",
				});
			} else if (r < 0.7) {
				events.push({
					kind: "sleep",
					label: "machine slept",
					detail: `${Math.floor(rng() * 60 + 4)} min idle`,
					brand: "dedalus",
				});
			} else {
				events.push({
					kind: "deploy",
					label: "tunnel re-established",
					detail: "cloudflared quick-tunnel",
					brand: "cloudflare",
				});
			}
		}
	}
	return events;
}

function intensityFor(rng: () => number, isWeekend: boolean, isToday: boolean) {
	if (isToday) return 4 as const;
	const base = rng();
	const adjusted = isWeekend ? base * 0.55 : base;
	if (adjusted < 0.18) return 0 as const;
	if (adjusted < 0.42) return 1 as const;
	if (adjusted < 0.68) return 2 as const;
	if (adjusted < 0.88) return 3 as const;
	return 4 as const;
}

function pickMilestoneEvent(
	dayIndex: number,
	totalDays: number,
): ContributionEvent | null {
	const milestones: ReadonlyArray<[number, ContributionEvent]> = [
		[0, { kind: "milestone", label: "rig provisioned", detail: "npm run deploy . first machine boot" }],
		[14, { kind: "milestone", label: "13 skills seeded", detail: "philosophy . engineering . design" }],
		[42, { kind: "milestone", label: "cursor-bridge wired", detail: "@cursor/sdk MCP server registered" }],
		[68, { kind: "milestone", label: "dashboard auto-wake live", detail: "vercel deploy . clerk gate . dedalus exec" }],
		[82, { kind: "milestone", label: "claude-code connected", detail: "AGENTS.md loaded . multi-file edits", brand: "anthropic" }],
		[96, { kind: "milestone", label: "wiki sync . 96 skills", detail: "knowledge/skills filled from my-wiki" }],
		[110, { kind: "milestone", label: "codex-cli integrated", detail: "sandbox exec . patch workflow", brand: "openai" }],
		[128, { kind: "milestone", label: "reticle pass shipped", detail: "edge hairlines . hatching . cross marks" }],
		[totalDays - 1, { kind: "milestone", label: "today", detail: "you are here" }],
	];
	for (const [d, evt] of milestones) {
		if (d === dayIndex) return evt;
	}
	return null;
}

export function generateContributionGrid(
	totalDays = 182,
	endsAt: Date = new Date(),
): ContributionDay[][] {
	const rng = makePrng(SEED);
	const today = new Date(endsAt);
	today.setHours(0, 0, 0, 0);

	const rawStart = new Date(today);
	rawStart.setDate(rawStart.getDate() - totalDays + 1);
	rawStart.setDate(rawStart.getDate() - rawStart.getDay());

	const calendarDays =
		Math.floor((today.getTime() - rawStart.getTime()) / 86_400_000) + 1;

	const days: ContributionDay[] = [];
	for (let i = 0; i < calendarDays; i++) {
		const date = new Date(rawStart);
		date.setDate(rawStart.getDate() + i);
		const day = date.getDay();
		const isWeekend = day === 0 || day === 6;
		const isToday = date.toDateString() === today.toDateString();

		const partner = pickPartner(rng);
		const intensity = intensityFor(rng, isWeekend, isToday);
		const events = buildDayEvents(rng, partner, intensity);
		const milestone = pickMilestoneEvent(i, calendarDays);
		if (milestone) events.unshift(milestone);

		days.push({ date: date.toISOString().slice(0, 10), partner, intensity, events });
	}

	const weeks: ContributionDay[][] = [];
	for (let i = 0; i < days.length; i += 7) {
		weeks.push(days.slice(i, i + 7));
	}
	return weeks;
}

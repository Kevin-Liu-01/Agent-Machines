import type { Mark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";

/**
 * One day in the contribution grid.
 *
 * `partner` attributes the day's dominant activity to a specific
 * system in the rig; `intensity` (0-4) maps to the green-scale color
 * ramp; `events` lists the actual happenings on that day with a
 * `kind`, a one-line label, and an optional secondary detail.
 *
 * Each event also carries an optional `brand` (third-party logo via
 * `<ServiceIcon>`) or `category` (Lucide-style `<ToolIcon>`) tag so the
 * day-detail panel can render the right glyph next to the event row
 * instead of pure text.
 */
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
		| "browser";
	label: string;
	detail?: string;
	brand?: ServiceSlug | "dedalus" | "nous" | "cursor" | "openclaw";
	category?: ToolCategory;
};

export type ContributionDay = {
	date: string;
	partner: Mark | "rig";
	intensity: 0 | 1 | 2 | 3 | 4;
	events: ContributionEvent[];
};

/**
 * Plausible 26-week (182-day) lifecycle for one Agent Machines
 * instance. Includes the actual milestones (commits + deploys + skill
 * loads) you'd expect to see on a real rig over six months. Seeded with
 * a deterministic PRNG so every render produces the same grid -- the
 * dashboard variant can swap in real data later but the marketing page
 * stays stable for screenshots and OG previews.
 */

const SEED = 0x4d4f4f4e; // "MOON"

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
	if (roll < 0.55) return "nous";
	if (roll < 0.7) return "openclaw";
	if (roll < 0.9) return "cursor";
	return "rig";
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
	{ name: "vercel-react-best-practices", brand: "vercel" },
	{ name: "code-review", category: "code" },
	{ name: "reticle-design-system", category: "vision" },
	{ name: "automation-cron", category: "schedule" },
	{ name: "cursor-coding", brand: "cursor" },
	{ name: "production-safety", category: "shell" },
	{ name: "supabase", brand: "supabase" },
	{ name: "stripe-best-practices", brand: "stripe" },
	{ name: "clerk-orgs", brand: "clerk" },
	{ name: "posthog-llm-traces", brand: "posthog" },
	{ name: "sentry-workflow", brand: "sentry" },
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
	{ name: "browser_use", category: "browser" },
	{ name: "cron_create", category: "schedule" },
	{ name: "vercel_deploy", brand: "vercel" },
	{ name: "supabase_query", brand: "supabase" },
	{ name: "linear_create_issue", brand: "linear" },
	{ name: "stripe_get_customer", brand: "stripe" },
	{ name: "github_open_pr", brand: "github" },
	{ name: "slack_post", brand: "slack" },
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
	{ label: "shell.exec", category: "shell" },
	{ label: "computer.move_mouse", category: "browser" },
	{ label: "computer.type_text", category: "browser" },
	{ label: "vision.analyze", category: "vision" },
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
			if (r < 0.6) {
				const mcp = MCPS[Math.floor(rng() * 4)];
				events.push({
					kind: "cursor",
					label: "cursor_agent run",
					detail: `tool: ${mcp.name} . dur: ${(rng() * 30 + 4).toFixed(1)}s`,
					brand: "cursor",
				});
			} else {
				const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
				events.push({
					kind: "mcp",
					label: "cursor_resume",
					detail: `loaded skills: ${skill.name}`,
					brand: "cursor",
				});
			}
		} else if (partner === "nous") {
			if (r < 0.45) {
				const mcp = MCPS[Math.floor(rng() * MCPS.length)];
				events.push({
					kind: "mcp",
					label: mcp.name,
					detail: `tokens: ${Math.floor(rng() * 4000 + 200)}`,
					brand: mcp.brand,
					category: mcp.category,
				});
			} else if (r < 0.85) {
				const name = CRON_NAMES[Math.floor(rng() * CRON_NAMES.length)];
				events.push({
					kind: "cron",
					label: `${name} fired`,
					detail: r < 0.85 ? "exit 0" : "exit 1 . retried",
					brand: "nous",
					category: "schedule",
				});
			} else {
				const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
				events.push({
					kind: "skill",
					label: `loaded ${skill.name}`,
					detail: `intent match . in-context`,
					brand: skill.brand ?? "nous",
					category: skill.category,
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
		} else {
			const skill = SKILLS[Math.floor(rng() * SKILLS.length)];
			events.push({
				kind: "skill",
				label: `${skill.name} reloaded`,
				detail: r < 0.5 ? "git fetch . rsync" : "edited via dashboard",
				brand: skill.brand,
				category: skill.category,
			});
		}
	}
	return events;
}

function intensityFor(rng: () => number, isWeekend: boolean, isToday: boolean) {
	if (isToday) return 4 as const;
	const base = rng();
	const adjusted = isWeekend ? base * 0.55 : base;
	if (adjusted < 0.32) return 0 as const;
	if (adjusted < 0.55) return 1 as const;
	if (adjusted < 0.78) return 2 as const;
	if (adjusted < 0.93) return 3 as const;
	return 4 as const;
}

function pickMilestoneEvent(
	dayIndex: number,
	totalDays: number,
): ContributionEvent | null {
	// A handful of fixed milestones placed at recognizable points in
	// the lifecycle so the grid tells a coherent story.
	const milestones: ReadonlyArray<[number, ContributionEvent]> = [
		[
			0,
			{
				kind: "milestone",
				label: "rig provisioned",
				detail: "npm run deploy . first machine boot",
			},
		],
		[
			14,
			{
				kind: "milestone",
				label: "13 skills seeded",
				detail: "philosophy . engineering . design",
			},
		],
		[
			42,
			{
				kind: "milestone",
				label: "cursor-bridge wired",
				detail: "@cursor/sdk MCP server registered",
			},
		],
		[
			68,
			{
				kind: "milestone",
				label: "dashboard auto-wake live",
				detail: "vercel deploy . clerk gate . dedalus exec",
			},
		],
		[
			95,
			{
				kind: "milestone",
				label: "wiki sync . 95 skills",
				detail: "knowledge/skills filled from my-wiki",
			},
		],
		[
			128,
			{
				kind: "milestone",
				label: "reticle pass shipped",
				detail: "edge hairlines . hatching . cross marks",
			},
		],
		[
			totalDays - 1,
			{
				kind: "milestone",
				label: "today",
				detail: "you are here",
			},
		],
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
	// Snap end-date to the most recent Saturday so the grid always
	// renders as full columns of 7 days (Sun..Sat).
	const end = new Date(endsAt);
	end.setHours(0, 0, 0, 0);
	end.setDate(end.getDate() + (6 - end.getDay()));

	const start = new Date(end);
	start.setDate(start.getDate() - (totalDays - 1));

	const days: ContributionDay[] = [];
	for (let i = 0; i < totalDays; i++) {
		const date = new Date(start);
		date.setDate(start.getDate() + i);
		const day = date.getDay();
		const isWeekend = day === 0 || day === 6;
		const isToday = date.toDateString() === endsAt.toDateString();

		const partner = pickPartner(rng);
		const intensity = intensityFor(rng, isWeekend, isToday);
		const events = buildDayEvents(rng, partner, intensity);
		const milestone = pickMilestoneEvent(i, totalDays);
		if (milestone) events.unshift(milestone);

		days.push({
			date: date.toISOString().slice(0, 10),
			partner,
			intensity,
			events,
		});
	}

	// Group into weeks (columns of 7). Pad leading/trailing nulls aren't
	// needed because we snapped to a Saturday; the count is always %7.
	const weeks: ContributionDay[][] = [];
	for (let i = 0; i < days.length; i += 7) {
		weeks.push(days.slice(i, i + 7));
	}
	return weeks;
}

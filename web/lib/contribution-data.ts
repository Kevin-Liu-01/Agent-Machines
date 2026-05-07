import type { Mark } from "@/components/Logo";

/**
 * One day in the contribution grid.
 *
 * `partner` attributes the day's dominant activity to a specific
 * system in the rig; `intensity` (0-4) maps to the green-scale color
 * ramp; `events` lists the actual happenings on that day with a
 * `kind`, a one-line label, and an optional secondary detail.
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
		| "milestone";
	label: string;
	detail?: string;
};

export type ContributionDay = {
	date: string;
	partner: Mark | "rig";
	intensity: 0 | 1 | 2 | 3 | 4;
	events: ContributionEvent[];
};

/**
 * Plausible 26-week (182-day) lifecycle for one Hermes Machines
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
	if (roll < 0.36) return "dedalus";
	if (roll < 0.66) return "nous";
	if (roll < 0.9) return "cursor";
	return "rig";
}

const SKILL_NAMES = [
	"agent-ethos",
	"empirical-verification",
	"taste-output",
	"deepsec",
	"torvalds",
	"counterfactual",
	"vercel-react-best-practices",
	"gstack-review",
	"reticle-design-system",
	"automation-cron",
	"cursor-coding",
	"production-safety",
];

const MCP_NAMES = [
	"cursor_agent",
	"cursor_resume",
	"shell_exec",
	"fs_read",
	"fs_write",
	"browser_use",
	"cron_create",
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
				const name = MCP_NAMES[Math.floor(rng() * 4)];
				events.push({
					kind: "cursor",
					label: `cursor_agent run`,
					detail: `tool: ${name} . dur: ${(rng() * 30 + 4).toFixed(1)}s`,
				});
			} else {
				const name = SKILL_NAMES[Math.floor(rng() * SKILL_NAMES.length)];
				events.push({
					kind: "mcp",
					label: `cursor_resume`,
					detail: `loaded skills: ${name}`,
				});
			}
		} else if (partner === "nous") {
			if (r < 0.5) {
				events.push({
					kind: "mcp",
					label: MCP_NAMES[Math.floor(rng() * MCP_NAMES.length)],
					detail: `tokens: ${Math.floor(rng() * 4000 + 200)}`,
				});
			} else {
				const name = CRON_NAMES[Math.floor(rng() * CRON_NAMES.length)];
				events.push({
					kind: "cron",
					label: `${name} fired`,
					detail: r < 0.85 ? "exit 0" : "exit 1 . retried",
				});
			}
		} else if (partner === "dedalus") {
			if (r < 0.35) {
				events.push({
					kind: "wake",
					label: "machine woke",
					detail: `${(rng() * 4 + 1.5).toFixed(1)}s . tunnel reused`,
				});
			} else if (r < 0.7) {
				events.push({
					kind: "sleep",
					label: "machine slept",
					detail: `${Math.floor(rng() * 60 + 4)} min idle`,
				});
			} else {
				events.push({
					kind: "deploy",
					label: "tunnel re-established",
					detail: "cloudflared quick-tunnel",
				});
			}
		} else {
			const skill = SKILL_NAMES[Math.floor(rng() * SKILL_NAMES.length)];
			events.push({
				kind: "skill",
				label: `${skill} reloaded`,
				detail: r < 0.5 ? "git fetch . rsync" : "edited via dashboard",
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

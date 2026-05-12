/**
 * Static cron registry. Mirrors `knowledge/crons/seed.json`.
 * The live machine's view of cron state is in `~/.agent-machines/cron/registry.json`;
 * the dashboard surfaces this seed list as documentation. PR2 adds a route
 * that talks to the gateway to expose live last-run state.
 */

import type { CronSummary } from "./types";

const CRONS: ReadonlyArray<CronSummary> = [
	{
		name: "hourly-health-check",
		schedule: "every 1h",
		prompt:
			"Run a runtime health check; summarize unhealthy items in 3 lines or fewer; reply OK if clean.",
		skills: ["dedalus-machines"],
	},
	{
		name: "daily-wiki-digest",
		schedule: "0 9 * * *",
		prompt:
			"Summarize the most important context to keep in active memory today in <=5 bullets.",
		skills: ["agent-ethos"],
	},
	{
		name: "weekly-skill-audit",
		schedule: "0 4 * * mon",
		prompt:
			"Audit ~/.agent-machines/skills for stale, drifted, or duplicated entries. Output JSON.",
		skills: ["plan-mode-review"],
	},
	{
		name: "nightly-memory-consolidation",
		schedule: "0 3 * * *",
		prompt:
			"Consolidate MEMORY.md and USER.md within size limits. Reorganize, do not invent.",
		skills: ["agent-ethos"],
	},
];

export function listCrons(): CronSummary[] {
	return [...CRONS];
}

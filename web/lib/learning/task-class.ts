/**
 * Coarse, deterministic task classification for a cron run.
 *
 * Decision: derive now from the cron's skill signature + name, store on every
 * trace, but treat as *advisory* -- the bandit only uses per-class posteriors
 * once a cell clears the sample threshold (see bandit.ts). No declared field in
 * v1; this is the "declare later" placeholder.
 */

import type { CronEntry } from "@/lib/user-config/schema";

export const TASK_CLASSES = ["code", "deploy", "research", "data", "unknown"] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];

/** Keyword -> bucket. First matching rule (in order) wins. */
const RULES: ReadonlyArray<{ cls: TaskClass; keywords: string[] }> = [
	{ cls: "deploy", keywords: ["deploy", "vercel", "release", "ship", "rollout", "publish", "cicd"] },
	{ cls: "data", keywords: ["data", "sql", "warehouse", "etl", "analytics", "supabase", "query", "scrape", "csv"] },
	{ cls: "research", keywords: ["research", "search", "summar", "docs", "brief", "monitor", "report", "digest"] },
	{ cls: "code", keywords: ["code", "commit", "review", "test", "refactor", "bug", "build", "lint", "implement", "patch"] },
];

/**
 * Derive a coarse task class from a cron's skill slugs + name. Deterministic and
 * cheap (no model call). Returns "unknown" when nothing matches.
 */
export function deriveTaskClass(cron: Pick<CronEntry, "skills" | "name">): TaskClass {
	const haystack = [...(cron.skills ?? []), cron.name ?? ""].join(" ").toLowerCase();
	for (const rule of RULES) {
		if (rule.keywords.some((k) => haystack.includes(k))) return rule.cls;
	}
	return "unknown";
}

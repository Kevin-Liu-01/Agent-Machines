import { ReticleLabel } from "@/components/reticle/ReticleLabel";

const CRONS: ReadonlyArray<{
	name: string;
	schedule: string;
	prompt: string;
}> = [
	{
		name: "hourly-health-check",
		schedule: "every 1h",
		prompt: "hermes doctor; if unhealthy, summarize in 3 lines or fewer.",
	},
	{
		name: "daily-wiki-digest",
		schedule: "every 1d at 09:00",
		prompt: "summarize the most important context to keep in active memory today.",
	},
	{
		name: "weekly-skill-audit",
		schedule: "every 1d at 04:00",
		prompt: "audit ~/.agent-machines/skills for stale, drifted, or duplicated entries.",
	},
	{
		name: "nightly-memory-consolidation",
		schedule: "every 1d at 03:00",
		prompt: "fold redundant entries in MEMORY.md and USER.md; prune to fit limits.",
	},
];

export function CronSection() {
	return (
		<>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<ReticleLabel>CRON -- PRE-SEEDED AUTOMATIONS</ReticleLabel>
					<h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
						Always-on, even when you're not
					</h2>
				</div>
				<p className="font-mono text-xs text-[var(--ret-text-muted)]">
					hermes cron list
				</p>
			</div>

			<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
				{CRONS.map((c) => (
					<div
						key={c.name}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5 transition-colors duration-200 hover:border-[var(--ret-border-hover)]"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="font-mono text-sm text-[var(--ret-purple)]">
								{c.name}
							</p>
							<p className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-0.5 font-mono text-[11px] text-[var(--ret-text-dim)]">
								{c.schedule}
							</p>
						</div>
						<p className="mt-3 text-sm leading-relaxed text-[var(--ret-text-dim)]">
							{c.prompt}
						</p>
					</div>
				))}
			</div>
		</>
	);
}

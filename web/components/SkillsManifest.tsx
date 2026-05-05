import { ReticleLabel } from "@/components/reticle/ReticleLabel";

type SkillCategory = "philosophy" | "engineering" | "design" | "ops" | "delegation";

const SKILLS: ReadonlyArray<{
	name: string;
	category: SkillCategory;
	purpose: string;
}> = [
	{ name: "agent-ethos", category: "philosophy", purpose: "minimal-fix coding, hard line/file/PR limits" },
	{ name: "empirical-verification", category: "philosophy", purpose: "scientific method -- verify before claiming" },
	{ name: "taste-output", category: "philosophy", purpose: "no skeleton stubs, no // TODO, no truncation" },
	{ name: "git-workflow", category: "engineering", purpose: "git switch, worktrees, conventional commits, force-with-lease" },
	{ name: "production-safety", category: "engineering", purpose: "production is sacred -- refuse direct DDL or SSM edits" },
	{ name: "plan-mode-review", category: "engineering", purpose: "structured architecture/quality/test/perf checklist" },
	{ name: "security-audit", category: "engineering", purpose: "CTF-style adversarial review with reproducible findings" },
	{ name: "frontend-design-taste", category: "design", purpose: "anti-slop UI rules -- bans the AI default aesthetics" },
	{ name: "reticle-design-system", category: "design", purpose: "Reticle/Sigil tokens, layout primitives, components" },
	{ name: "automation-cron", category: "ops", purpose: "schedule recurring agent tasks via the cronjob tool" },
	{ name: "computer-use", category: "ops", purpose: "Playwright browser_* patterns and stop-conditions" },
	{ name: "dedalus-machines", category: "ops", purpose: "this VM's runtime model: lifecycle, ports, persistence" },
	{ name: "cursor-coding", category: "delegation", purpose: "when and how to hand off to cursor_agent MCP" },
];

export function SkillsManifest() {
	return (
		<>
			<div className="flex items-end justify-between gap-4">
				<div>
					<ReticleLabel>SKILLS -- BUNDLED LIBRARY</ReticleLabel>
					<h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
						Loaded into{" "}
						<span className="font-mono text-[var(--ret-purple)]">~/.hermes/skills/</span>
					</h2>
				</div>
				<p className="hidden font-mono text-xs text-[var(--ret-text-muted)] md:block">
					{SKILLS.length} skills · all on disk · zero RAG roundtrips
				</p>
			</div>

			<div className="mt-6 overflow-hidden rounded-md border border-[var(--ret-border)]">
				<div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2.4fr)_minmax(0,0.9fr)] gap-px bg-[var(--ret-border)]">
					<HeaderCell>name</HeaderCell>
					<HeaderCell>purpose</HeaderCell>
					<HeaderCell>category</HeaderCell>
					{SKILLS.map((s) => (
						<Row key={s.name} {...s} />
					))}
				</div>
			</div>

			<p className="mt-4 max-w-prose text-sm text-[var(--ret-text-dim)]">
				Replace any of these with your own opinions --{" "}
				<code className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
					knowledge/skills/&lt;name&gt;/SKILL.md
				</code>{" "}
				is just markdown. Run{" "}
				<code className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
					npm run reload
				</code>{" "}
				to push edits onto the live machine without re-bootstrapping.
			</p>
		</>
	);
}

function HeaderCell({ children }: { children: React.ReactNode }) {
	return (
		<div className="bg-[var(--ret-bg-soft)] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
			{children}
		</div>
	);
}

function Row({
	name,
	purpose,
	category,
}: {
	name: string;
	purpose: string;
	category: SkillCategory;
}) {
	return (
		<>
			<div className="bg-[var(--ret-bg)] px-4 py-3 font-mono text-sm text-[var(--ret-purple)]">
				{name}
			</div>
			<div className="bg-[var(--ret-bg)] px-4 py-3 text-sm text-[var(--ret-text)]">
				{purpose}
			</div>
			<div className="bg-[var(--ret-bg)] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{category}
			</div>
		</>
	);
}

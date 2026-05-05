import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";

const CAPABILITIES: ReadonlyArray<{
	kicker: string;
	title: string;
	body: string;
	notes: string[];
}> = [
	{
		kicker: "DELEGATION",
		title: "Spawns Cursor coding agents",
		body: "When you ask for real code changes -- refactor, bug fix, new feature -- Hermes hands off to a Cursor agent via the cursor_agent MCP tool. Same model that runs in the Cursor IDE, full file access, with my skills injected as .cursor/rules.",
		notes: ["cursor_agent", "@cursor/sdk", "load_skills", ".cursor/rules/from-hermes.mdc"],
	},
	{
		kicker: "TOOLS",
		title: "40+ tools, one prompt away",
		body: "Terminal, file ops, web search, browser automation (Playwright), vision, image generation, TTS, MCP servers, code execution, subagent delegation.",
		notes: ["terminal", "browser_*", "web_search", "vision_analyze", "execute_code"],
	},
	{
		kicker: "KNOWLEDGE",
		title: "Bundled skill library",
		body: "Curated SKILL.md docs that load on-demand. Ethos, empirical verification, production safety, design taste, security audit, and more. Drop your own folders into knowledge/skills/ to extend.",
		notes: ["agent-ethos", "production-safety", "security-audit", "reticle-design-system"],
	},
	{
		kicker: "MEMORY",
		title: "Persistent across sessions",
		body: "USER.md models you. MEMORY.md models the environment. FTS5 sessions DB lets the agent search every prior conversation it had with you.",
		notes: ["USER.md", "MEMORY.md", "FTS5 search", "auto-summarize"],
	},
	{
		kicker: "SCHEDULE",
		title: "Cron, in plain English",
		body: 'Ask: "every weekday at 8am, brief me." It schedules itself. Pre-seeded with health checks, wiki digests, skill audits, and memory consolidation.',
		notes: ["every 1h", "0 9 * * *", "0 4 * * mon"],
	},
	{
		kicker: "RUNTIME",
		title: "Sleep / wake, by the second",
		body: "Dedalus microVMs hibernate while idle and wake in seconds. Persistent volume keeps your skills, memory, and venv intact across sleeps.",
		notes: ["microVM", "/home/machine persists", "second-billing"],
	},
	{
		kicker: "API",
		title: "OpenAI-compatible endpoint",
		body: "Hermes exposes /v1/chat/completions, /v1/responses, /v1/models. Open WebUI, LobeChat, ChatBox -- anything that speaks OpenAI works as a frontend.",
		notes: ["/v1/chat/completions", "Bearer auth", "SSE streaming"],
	},
];

export function CapabilityGrid() {
	return (
		<>
			<ReticleLabel>CAPABILITIES</ReticleLabel>
			<div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-2 lg:grid-cols-3">
				{CAPABILITIES.map((c) => (
					<div
						key={c.title}
						className={cn(
							"flex flex-col gap-3 bg-[var(--ret-bg)] p-6",
							"transition-colors duration-200 hover:bg-[var(--ret-surface)]",
						)}
					>
						<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							{c.kicker}
						</p>
						<h3 className="text-lg font-semibold leading-snug tracking-tight">
							{c.title}
						</h3>
						<p className="text-sm leading-relaxed text-[var(--ret-text-dim)]">
							{c.body}
						</p>
						<div className="mt-auto flex flex-wrap gap-1.5">
							{c.notes.map((n) => (
								<span
									key={n}
									className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ret-text-dim)]"
								>
									{n}
								</span>
							))}
						</div>
					</div>
				))}
			</div>
		</>
	);
}

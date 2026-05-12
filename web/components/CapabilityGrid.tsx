import { Logo, type CompositeMark } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { WingBackground } from "@/components/WingBackground";
import { cn } from "@/lib/cn";

type Capability = {
	kicker: string;
	title: string;
	body: string;
	notes: string[];
	mark?: CompositeMark;
};

const CAPABILITIES: ReadonlyArray<Capability> = [
	{
		kicker: "STATE",
		title: "Disk persists across sleeps",
		body: "Chat history, uploaded files, USER.md, MEMORY.md, the FTS5 sessions DB, cron schedules, Python venv, learned skills -- all written to /home/machine. The microVM hibernates between requests; nothing in RAM matters because the disk is the source of truth.",
		notes: ["/home/machine", "MEMORY.md", "FTS5"],
		mark: "agent",
	},
	{
		kicker: "ACCOUNT",
		title: "One fleet per Clerk identity",
		body: "Sign in once; your machines follow you across devices and browsers. UserConfig lives in Clerk private metadata -- which provider keys you've attached, which machine is active, which agent is selected. Per-user multi-tenancy from line one.",
		notes: ["Clerk private metadata", "MachineRef[]", "activeMachineId"],
	},
	{
		kicker: "RUNTIME",
		title: "Sleep / wake by the second",
		body: "Dedalus microVMs hibernate when idle and wake on the first prompt -- typically <30s cold-start, <5s after recent activity. Billed by the second. Wake-on-read is wired into chat, artifacts, and the live dashboard.",
		notes: ["microVM", "wake-on-read", "second-billing"],
		mark: "dedalus",
	},
	{
		kicker: "PROVIDERS",
		title: "Dedalus live; more hosts shaped",
		body: "Dedalus Machines is wired end-to-end today. Vercel Sandbox and Fly Machines already exist in the MachineProvider schema and setup UI, with explicit not-supported responses until their provisioners land.",
		notes: ["dedalus live", "vercel-sandbox", "fly"],
	},
	{
		kicker: "AGENTS",
		title: "Hermes or OpenClaw",
		body: "Two agents, same OpenAI-compatible /v1/chat/completions endpoint. Hermes ships memory + cron + MCP-native; OpenClaw ships Anthropic computer-use loop with browser + screenshot. Swap from the dashboard navbar.",
		notes: ["/v1/chat/completions", "swap any time", "same machine"],
		mark: "agent",
	},
	{
		kicker: "TOOLS",
		title: "23 built-ins + 17 service routes",
		body: "Terminal, filesystem, web search, browser automation, vision, image generation, code execution, subagent delegation. Cursor is one path; Vercel, Stripe, Supabase, Linear, GitHub, Slack, PostHog, Sentry, Figma, and more sit in the MCP/CLI/skill hierarchy.",
		notes: ["terminal", "browser_*", "MCP/CLI", "skills"],
		mark: "agent",
	},
	{
		kicker: "KNOWLEDGE",
		title: "95-skill bundled library",
		body: "SKILL.md docs auto-loaded by intent: agent-ethos, empirical-verification, production-safety, design-taste, deepsec, torvalds. Drop a folder into knowledge/skills/, click Reload on the dashboard, the VM git-pulls and rsyncs -- no CLI ever.",
		notes: ["agent-ethos", "deepsec", "git pull", "Reload button"],
	},
	{
		kicker: "DELEGATION",
		title: "Cursor is optional delegation",
		body: "When configured, Hermes can hand code work to a Cursor SDK subagent through cursor_agent. Without CURSOR_API_KEY, the machine still keeps chat, tools, skills, cron, browser automation, files, and provider control working.",
		notes: ["cursor_agent", "optional", ".cursor/rules"],
		mark: "cursor",
	},
];

export function CapabilityGrid() {
	return (
		<>
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<ReticleLabel>CAPABILITIES</ReticleLabel>
					<h2 className="ret-display mt-2 text-xl md:text-2xl">
						Machine first. Loadout second.
					</h2>
				</div>
				<p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] md:block">
					{CAPABILITIES.length} entries
				</p>
			</div>
			<div className="mt-4 grid grid-cols-1 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-2 lg:grid-cols-4">
				{CAPABILITIES.map((c, index) => (
					<div
						key={c.title}
						className={cn(
							"relative flex min-h-[230px] flex-col gap-2 overflow-hidden bg-[var(--ret-bg)] p-4",
							"transition-colors duration-150 hover:bg-[var(--ret-surface)]",
						)}
					>
						{index % 2 === 0 ? (
							<WingBackground
								variant={index % 4 === 0 ? "nyx-lines" : "nyx-waves"}
								opacity={{ light: 0.13, dark: 0.26 }}
								fadeEdges
							/>
						) : null}
						<div className="ret-material-field absolute inset-x-0 bottom-0 h-20 opacity-45" aria-hidden="true" />
						<div className="relative z-10 flex items-center justify-between gap-2">
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{c.kicker}
							</p>
							{c.mark ? <Logo mark={c.mark} size={14} /> : null}
						</div>
						<MiniGlyph index={index} />
						<h3 className="relative z-10 text-sm font-semibold leading-snug tracking-tight">
							{c.title}
						</h3>
						<p className="relative z-10 text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
							{c.body}
						</p>
						<div className="relative z-10 mt-auto flex flex-wrap gap-1 pt-1">
							{c.notes.map((n) => (
								<span
									key={n}
									className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ret-text-dim)]"
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

function MiniGlyph({ index }: { index: number }) {
	const labels = [
		["disk", "memory", "cron"],
		["clerk", "fleet", "active"],
		["sleep", "wake", "bill"],
		["host", "exec", "disk"],
		["agent", "gateway", "chat"],
		["tool", "mcp", "skill"],
		["intent", "skill", "reload"],
		["cursor", "agent", "diff"],
	][index] ?? ["node", "edge", "state"];
	return (
		<div className="relative z-10 grid grid-cols-3 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
			{labels.map((label, i) => (
				<div
					key={label}
					className="min-h-12 bg-[var(--ret-bg)]/88 p-2 backdrop-blur-sm"
				>
					<p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						0{i + 1}
					</p>
					<p className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ret-text)]">
						{label}
					</p>
				</div>
			))}
		</div>
	);
}

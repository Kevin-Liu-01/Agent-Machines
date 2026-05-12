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
	nyx?: "nyx-lines" | "nyx-waves";
};

const CAPABILITIES: ReadonlyArray<Capability> = [
	{
		kicker: "STATE",
		title: "Disk persists across sleeps",
		body: "Chat history, files, MEMORY.md, the FTS5 sessions DB, cron schedules, Python venv, skills -- all on /home/machine. The microVM hibernates; the disk is the source of truth.",
		notes: ["/home/machine", "MEMORY.md", "FTS5"],
		mark: "agent",
		nyx: "nyx-waves",
	},
	{
		kicker: "ACCOUNT",
		title: "One fleet per identity",
		body: "Sign in once; machines follow across devices. UserConfig in Clerk metadata -- provider keys, active machine, agent choice. Per-user multi-tenancy.",
		notes: ["Clerk metadata", "MachineRef[]", "activeMachineId"],
	},
	{
		kicker: "RUNTIME",
		title: "Sleep / wake by second",
		body: "Dedalus microVMs hibernate idle, wake on first prompt -- <30s cold, <5s warm. Billed by the second. Wake-on-read wired into chat and dashboard.",
		notes: ["microVM", "wake-on-read", "second-billed"],
		mark: "dedalus",
		nyx: "nyx-lines",
	},
	{
		kicker: "PROVIDERS",
		title: "Dedalus + 2 stubs",
		body: "Dedalus live end-to-end. Vercel Sandbox and Fly Machines exist in the schema and setup UI, responding explicitly until their provisioners land.",
		notes: ["dedalus", "vercel-sandbox", "fly"],
	},
	{
		kicker: "AGENTS",
		title: "Hermes or OpenClaw",
		body: "Two agents, same /v1 endpoint. Hermes: memory + cron + MCP. OpenClaw: Anthropic computer-use + browser + screenshot. Swap from the navbar.",
		notes: ["/v1/chat", "swap any time"],
		mark: "agent",
	},
	{
		kicker: "TOOLS",
		title: "23 built-ins + 17 services",
		body: "Terminal, fs, web search, browser, vision, codegen, subagent. Plus closed-loop CLIs for browser, API, DB, logs, and network verification.",
		notes: ["terminal", "browser_*", "curl/httpx", "sqlite3"],
		mark: "agent",
		nyx: "nyx-waves",
	},
	{
		kicker: "KNOWLEDGE",
		title: "96-skill library",
		body: "SKILL.md docs auto-loaded by intent. Drop a folder into knowledge/skills/, click Reload on the dashboard, the VM git-pulls -- no CLI.",
		notes: ["agent-ethos", "deepsec", "Reload"],
	},
	{
		kicker: "DELEGATION",
		title: "Cursor is optional",
		body: "Hermes can hand code work to Cursor SDK through cursor_agent. Without CURSOR_API_KEY, the machine still works: chat, tools, skills, cron, browser, files.",
		notes: ["cursor_agent", "optional"],
		mark: "cursor",
		nyx: "nyx-lines",
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
						{c.nyx ? (
							<WingBackground
								variant={c.nyx}
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

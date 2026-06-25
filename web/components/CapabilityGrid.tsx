import { Logo, type CompositeMark } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { WingBackground } from "@/components/WingBackground";
import { cn } from "@/lib/cn";
import { HARNESS, PRODUCT } from "@/lib/platform/harness";

type Capability = {
	kicker: string;
	title: string;
	body: string;
	notes: string[];
	mark?: CompositeMark;
	nyx?: "nyx-lines" | "nyx-waves";
};

const PUBLIC_NATIVE_MARKS = new Set<CompositeMark>([
	"agent",
	"nous",
	"openclaw",
	"claudecode",
	"codex",
]);

function publicLogoTone(mark: CompositeMark): "native" | undefined {
	return PUBLIC_NATIVE_MARKS.has(mark) ? "native" : undefined;
}

const CAPABILITIES: ReadonlyArray<Capability> = [
	{
		kicker: "SWITCHBOARD",
		title: "Agents and machine lanes",
		body: `${PRODUCT.analogies.primary}. Pick Hermes, OpenClaw, Claude Code, or Codex, then pick E2B, Sprites.dev, Dedalus Machines, or Vercel Sandbox. One account stores the worker recipe and supervises the run.`,
		notes: ["OpenRouter-style", "runtime + host", "one account"],
		mark: "agent",
		nyx: "nyx-waves",
	},
	{
		kicker: "FLEET",
		title: "Specialist workers",
		body: "Provision opinionated presets for research, browser work, coding, and ops. Each preset carries runtime, model path, memory, and loadout, then reports back to the same fleet dashboard.",
		notes: ["presets", "multi-machine", "one pane"],
		mark: "agent",
	},
	{
		kicker: "RUNTIME",
		title: "Lifecycle by provider",
		body: "Wake, sleep, stream, and public URL behavior depends on the selected substrate. The dashboard shows supported actions instead of pretending every lane behaves the same.",
		notes: ["wake", "sleep", "streaming"],
		mark: "am",
		nyx: "nyx-lines",
	},
	{
		kicker: "PROVIDERS",
		title: "Four live hosts",
		body: "Dedalus Machines, E2B Sandbox, Sprites.dev, and Vercel Sandbox each implement spin-up, command streaming, wake/sleep where supported, and public URLs through the same MachineProvider interface.",
		notes: ["dedalus", "e2b", "sprites", "vercel"],
	},
	{
		kicker: "AGENTS",
		title: "Four agent runtimes",
		body: "Hermes, OpenClaw, Claude Code, or Codex install into the same worker shape. Gateway agents expose chat endpoints; CLI agents run through terminal and one-shot commands.",
		notes: ["gateway", "terminal", "command"],
		mark: "agent",
	},
	{
		kicker: "HARNESS",
		title: "Registry-driven loadout",
		body: `${HARNESS.serviceRouteCount} service lanes, ${HARNESS.mcpServerCount} MCP servers, ${HARNESS.cliCount}+ CLIs, ${HARNESS.taskRouteCount} task lanes — ranked like tool-hierarchy.mdc. Native tool count varies by agent runtime (${HARNESS.nativeToolMin}–${HARNESS.nativeToolMax}).`,
		notes: ["MCP → CLI → skill", "catalog.json", "loadout.ts"],
		mark: "agent",
		nyx: "nyx-waves",
	},
	{
		kicker: "KNOWLEDGE",
		title: `${HARNESS.skillCount}-skill protocol`,
		body: "SKILL.md docs auto-loaded by intent. Drop a folder into knowledge/skills/, click Reload on the dashboard, the VM git-pulls -- no CLI.",
		notes: ["agent-ethos", "deepsec", "Reload"],
	},
	{
		kicker: "OBSERVE",
		title: "Inspect the worker",
		body: "Sessions, logs, usage, terminal snapshots, artifacts, gateway health, and transitions make the machine inspectable before orchestration gets fancy.",
		notes: ["sessions", "logs", "usage"],
		mark: "am",
	},
	{
		kicker: "DELEGATION",
		title: "Cursor is optional",
		body: "The agent can hand code work to Cursor SDK through cursor_agent. Without CURSOR_API_KEY, the machine still works: chat, tools, skills, cron, browser, files.",
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
						Pick agents. Pick machines. Watch the fleet.
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
							{c.mark ? (
								<Logo mark={c.mark} size={14} tone={publicLogoTone(c.mark)} />
							) : null}
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
		["hermes", "e2b", "dedalus"],
		["clerk", "fleet", "active"],
		["sleep", "wake", "bill"],
		["host", "shell", "disk"],
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

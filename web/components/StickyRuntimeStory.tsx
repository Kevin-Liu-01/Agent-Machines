import { AgentCommandToggle } from "@/components/AgentCommandToggle";
import { LoadoutPreview } from "@/components/LoadoutPreview";
import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { CircuitArt } from "@/components/reticle/CircuitArt";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { RuntimeVizGrid } from "@/components/RuntimeVizGrid";
import { AGENTS, getAgentMeta } from "@/lib/agents";
import type { AgentKind, AgentMeta } from "@/lib/types";

type StorySurface = "commands" | "loadout" | "dashboard" | "routes";

type StoryChapter = {
	id: string;
	agentId: AgentKind;
	label: string;
	title: string;
	body: string;
	surface: StorySurface;
	metric: readonly [string, string, string];
};

const STORY_CHAPTERS: ReadonlyArray<StoryChapter> = [
	{
		id: "commands",
		agentId: "hermes",
		label: "chat + terminal",
		title: "Chat and terminal commands for every agent.",
		body: "Open one worker surface, then pick Hermes, OpenClaw, Claude Code, or Codex. The command shape, docs, providers, and run mode stay visible.",
		surface: "commands",
		metric: ["mode", "runtime", "4 agents"],
	},
	{
		id: "loadout",
		agentId: "openclaw",
		label: "loadout",
		title: "The same kit follows the worker.",
		body: "Built-ins, MCP servers, CLIs, plugins, service lanes, and skills install once. Every agent sees the same runnable harness.",
		surface: "loadout",
		metric: ["kit", "MCP + CLI", "skills"],
	},
	{
		id: "dashboard",
		agentId: "claude-code",
		label: "dashboard",
		title: "Dashboard shows what is alive.",
		body: "Runtime files, gateway health, logs, usage, cron, and loadout are API-shaped panels that match the dashboard.",
		surface: "dashboard",
		metric: ["state", "observable", "6 panels"],
	},
	{
		id: "routes",
		agentId: "codex",
		label: "runtime lanes",
		title: "One contract, four runtimes.",
		body: "Autonomous agents stay awake. Task CLIs run on demand. Both land in the same machine record with saved model, provider, and environment choices.",
		surface: "routes",
		metric: ["lane", "saved", "per worker"],
	},
];

export function StickyRuntimeStory() {
	return (
		<section className="relative">
			<div className="grid gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[0.7fr_1.3fr]">
				<div className="relative overflow-hidden bg-[var(--ret-bg)] px-4 py-7 md:px-6 md:py-9">
					<CircuitArt
						slug="agents"
						variant="ambient"
						className="opacity-[0.18] dark:opacity-[0.24]"
					/>
					<div className="relative z-10">
						<ReticleLabel>AGENT SURFACES</ReticleLabel>
						<h2 className="ret-display mt-3 max-w-[18ch] text-2xl md:text-4xl">
							Every agent gets a full worker UI.
						</h2>
						<p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							Each agent lands in the same worker frame: command surface,
							loadout, observable state, and saved runtime lanes.
						</p>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-px bg-[var(--ret-border)] md:grid-cols-4">
					{STORY_CHAPTERS.map((chapter, index) => (
						<a
							key={chapter.id}
							href={`#agent-story-${chapter.id}`}
							className="group flex min-h-[128px] flex-col justify-between bg-[var(--ret-bg)] p-4 transition-colors duration-150 ease-out hover:bg-[var(--ret-bg-soft)] active:scale-[0.99]"
						>
							<div className="flex items-center justify-between gap-3">
								<Logo
									mark={getAgentMeta(chapter.agentId).logoMark}
									size={18}
									tone="native"
								/>
								<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{String(index + 1).padStart(2, "0")}
								</span>
							</div>
							<div>
								<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{chapter.label}
								</div>
								<div className="mt-1 text-[13px] font-semibold text-[var(--ret-text)]">
									{getAgentMeta(chapter.agentId).name}
								</div>
							</div>
						</a>
					))}
				</div>
			</div>

			<div className="divide-y divide-[var(--ret-border)]">
				{STORY_CHAPTERS.map((chapter, index) => (
					<StoryPanel key={chapter.id} chapter={chapter} index={index} />
				))}
			</div>
		</section>
	);
}

function StoryPanel({
	chapter,
	index,
}: {
	chapter: StoryChapter;
	index: number;
}) {
	const agent = getAgentMeta(chapter.agentId);

	return (
		<section
			id={`agent-story-${chapter.id}`}
			className="grid scroll-mt-[84px] gap-px bg-[var(--ret-border)] lg:grid-cols-[0.35fr_0.65fr]"
		>
			<AgentStoryAside agent={agent} chapter={chapter} index={index} />
			<div className="min-w-0 bg-[var(--ret-bg)]">
				<StorySurfaceRenderer surface={chapter.surface} agent={agent} />
			</div>
		</section>
	);
}

function AgentStoryAside({
	agent,
	chapter,
	index,
}: {
	agent: AgentMeta;
	chapter: StoryChapter;
	index: number;
}) {
	const commandRows = [
		["install", agent.installCmd],
		["interactive", agent.runCmd],
		agent.headlessCmd ? ["headless", agent.headlessCmd] : null,
		["docs", agent.docsUrl],
	].filter(Boolean) as Array<[string, string]>;
	const [metricLabel, metricValue, metricHint] = chapter.metric;

	return (
		<aside className="relative overflow-hidden bg-[var(--ret-bg)] p-5 md:p-6 lg:sticky lg:top-[72px] lg:min-h-[560px]">
			<CircuitArt
				slug={chapter.id}
				variant="ambient"
				className="opacity-[0.16] dark:opacity-[0.26]"
			/>
			<div className="relative z-10 flex h-full flex-col justify-between gap-8">
				<div>
					<div className="flex items-center justify-between gap-4">
						<ReticleLabel>{chapter.label}</ReticleLabel>
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							{String(index + 1).padStart(2, "0")}
						</span>
					</div>

					<div className="mt-5 flex items-start gap-3">
						<div className="grid h-12 w-12 place-items-center border border-[var(--ret-border)] bg-[var(--ret-surface)]">
							<Logo mark={agent.logoMark} size={28} tone="native" />
						</div>
						<div className="min-w-0">
							<h3 className="text-2xl font-semibold tracking-tight text-[var(--ret-text)]">
								{agent.name}
							</h3>
							<p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								by {agent.by}
							</p>
						</div>
					</div>

					<div className="mt-4 flex flex-wrap items-center gap-2">
						<ReticleBadge>{agent.operationModel}</ReticleBadge>
						<span className="text-[11px] text-[var(--ret-text-dim)]">
							{agent.tagline}
						</span>
					</div>

					<h4 className="mt-6 max-w-[18ch] text-xl font-semibold leading-tight text-[var(--ret-text)]">
						{chapter.title}
					</h4>
					<p className="mt-3 max-w-[52ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
						{chapter.body}
					</p>

					<div className="mt-6 grid grid-cols-3 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
						<div className="col-span-1 bg-[var(--ret-bg)] px-3 py-2">
							<div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{metricLabel}
							</div>
							<div className="mt-1 text-[12px] font-medium text-[var(--ret-text)]">
								{metricValue}
							</div>
						</div>
						<div className="col-span-2 bg-[var(--ret-bg)] px-3 py-2">
							<div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								scope
							</div>
							<div className="mt-1 text-[12px] font-medium text-[var(--ret-text)]">
								{metricHint}
							</div>
						</div>
					</div>
				</div>

				<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
					<div className="bg-[var(--ret-bg)] px-3 py-2">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							commands
						</p>
					</div>
					{commandRows.map(([label, value]) => (
						<div
							key={label}
							className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 bg-[var(--ret-bg)] px-3 py-2 text-[11px]"
						>
							<span className="font-mono uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
								{label}
							</span>
							<code className="truncate text-right font-mono text-[10px] text-[var(--ret-text-dim)]">
								{value}
							</code>
						</div>
					))}
				</div>
			</div>
		</aside>
	);
}

function StorySurfaceRenderer({
	surface,
	agent,
}: {
	surface: StorySurface;
	agent: AgentMeta;
}) {
	if (surface === "commands") return <AgentCommandToggle />;
	if (surface === "loadout") return <LoadoutPreview />;
	if (surface === "dashboard") return <RuntimeVizGrid />;
	return <AgentRouteMatrix agent={agent} />;
}

function AgentRouteMatrix({ agent }: { agent: AgentMeta }) {
	return (
		<div className="grid min-h-[560px] gap-px bg-[var(--ret-border)]">
			<div className="relative overflow-hidden bg-[var(--ret-bg)] px-4 py-5 md:px-5">
				<CircuitArt
					slug="routes"
					variant="ambient"
					className="opacity-[0.16] dark:opacity-[0.28]"
				/>
				<div className="relative z-10 grid gap-5 lg:grid-cols-[0.72fr_0.28fr]">
					<div>
						<ReticleLabel>WORKER CONTRACT</ReticleLabel>
						<h3 className="ret-display mt-2 text-xl md:text-2xl">
							Runtime choice is saved on the worker.
						</h3>
						<p className="mt-2 max-w-[74ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
							The control plane stores agent, model, provider, sandbox, env,
							loadout, and persistence together. Switching agents changes the
							runtime, not the machine record.
						</p>
					</div>
					<div className="grid grid-cols-2 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
						<MiniCell label="active" value={agent.name} />
						<MiniCell label="mode" value={agent.operationModel} />
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] lg:grid-cols-4">
				{AGENTS.map((item) => (
					<div key={item.id} className="bg-[var(--ret-bg)] p-4">
						<div className="flex items-center gap-2">
							<Logo mark={item.logoMark} size={18} tone="native" />
							<div className="min-w-0">
								<div className="truncate text-[13px] font-semibold text-[var(--ret-text)]">
									{item.name}
								</div>
								<div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{item.operationModel}
								</div>
							</div>
						</div>
						<p className="mt-4 min-h-[44px] text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
							{item.tagline}
						</p>
						<div className="mt-4 grid gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
							<MatrixRow label="run" value={item.runCmd} />
							<MatrixRow label="command" value={item.headlessCmd ?? "interactive"} />
							<MatrixRow
								label="providers"
								value={`${item.providerOptions.length} options`}
							/>
						</div>
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] md:grid-cols-3">
				<MiniCell label="machine" value="persistent state" />
				<MiniCell label="model" value="per-worker path" />
				<MiniCell label="env" value="named profile" />
			</div>
		</div>
	);
}

function MiniCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-3">
			<div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</div>
			<div className="mt-1 truncate text-[13px] font-semibold text-[var(--ret-text)]">
				{value}
			</div>
		</div>
	);
}

function MatrixRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 bg-[var(--ret-bg)] px-2.5 py-2 text-[10px]">
			<span className="font-mono uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<code className="truncate text-right font-mono text-[var(--ret-text-dim)]">
				{value}
			</code>
		</div>
	);
}

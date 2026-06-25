"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";

import { AgentCommandToggle } from "@/components/AgentCommandToggle";
import { LoadoutPreview } from "@/components/LoadoutPreview";
import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { CircuitArt } from "@/components/reticle/CircuitArt";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { RuntimeVizGrid } from "@/components/RuntimeVizGrid";
import { cn } from "@/lib/cn";
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
	const introRef = useRef<HTMLDivElement | null>(null);
	const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
	const [activeId, setActiveId] = useState(STORY_CHAPTERS[0]?.id ?? "");
	const activeIndex = Math.max(
		0,
		STORY_CHAPTERS.findIndex((chapter) => chapter.id === activeId),
	);
	const activeChapter = STORY_CHAPTERS[activeIndex] ?? STORY_CHAPTERS[0];
	const activeAgent = getAgentMeta(activeChapter.agentId);

	const scrollToChapter = (id: string) => {
		setActiveId(id);
		sectionRefs.current[id]?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};

	const handleChapterClick = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault();
		scrollToChapter(id);
	};

	useEffect(() => {
		const ratios = new Map<string, number>();
		const nodes = [
			introRef.current,
			...STORY_CHAPTERS.map((chapter) => sectionRefs.current[chapter.id]),
		].filter((node): node is HTMLElement => Boolean(node));
		if (!nodes.length) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const chapterId = (entry.target as HTMLElement).dataset.storyId;
					if (!chapterId) continue;
					ratios.set(chapterId, entry.isIntersecting ? entry.intersectionRatio : 0);
				}

				let bestId = "";
				let bestRatio = 0;
				for (const chapter of STORY_CHAPTERS) {
					const ratio = ratios.get(chapter.id) ?? 0;
					if (ratio > bestRatio) {
						bestId = chapter.id;
						bestRatio = ratio;
					}
				}

				if (bestId) {
					setActiveId((current) => (current === bestId ? current : bestId));
				}
			},
			{
				root: null,
				rootMargin: "-42% 0px -46% 0px",
				threshold: [0, 0.01, 0.18, 0.34, 0.55, 0.72, 0.9, 1],
			},
		);

		for (const node of nodes) {
			observer.observe(node);
		}

		return () => observer.disconnect();
	}, []);

	return (
		<section className="relative overflow-x-clip">
			<div
				ref={introRef}
				data-story-id={STORY_CHAPTERS[0]?.id}
				className="grid gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[448px_minmax(0,1fr)]"
			>
				<div className="relative overflow-hidden bg-[var(--ret-bg)] px-4 py-7 md:px-6 md:py-10">
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
							aria-current={chapter.id === activeId ? "step" : undefined}
							onClick={handleChapterClick(chapter.id)}
							className={cn(
								"group relative flex min-h-[150px] flex-col justify-between overflow-hidden bg-[var(--ret-bg)] p-4 transition-[background-color,transform,border-color] duration-300 [transition-timing-function:var(--ret-ease-out)] hover:bg-[var(--ret-bg-soft)] active:scale-[0.99]",
								chapter.id === activeId ? "bg-[var(--ret-bg-soft)]" : null,
							)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"absolute inset-x-0 top-0 h-px origin-left bg-[var(--ret-text)] transition-transform duration-500 [transition-timing-function:var(--ret-ease-out)]",
									chapter.id === activeId ? "scale-x-100" : "scale-x-0",
								)}
							/>
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

			<div className="grid gap-px bg-[var(--ret-border)] lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
				<AgentStoryAside
					key={activeChapter.id}
					agent={activeAgent}
					chapter={activeChapter}
					index={activeIndex}
					activeId={activeId}
					onSelect={scrollToChapter}
				/>
				<div className="min-w-0 bg-[var(--ret-border)]">
					{STORY_CHAPTERS.map((chapter, index) => (
						<section
							key={chapter.id}
							id={`agent-story-${chapter.id}`}
							ref={(node) => {
								sectionRefs.current[chapter.id] = node;
							}}
							data-story-id={chapter.id}
							className="scroll-mt-[72px] bg-[var(--ret-bg)] transition-opacity duration-500 [scroll-snap-align:start] [transition-timing-function:var(--ret-ease-out)] lg:min-h-[calc(100dvh-64px)]"
						>
							<StorySurfacePanel
								chapter={chapter}
								index={index}
								active={chapter.id === activeId}
							/>
						</section>
					))}
				</div>
			</div>
		</section>
	);
}

function StorySurfacePanel({
	chapter,
	index,
	active,
}: {
	chapter: StoryChapter;
	index: number;
	active: boolean;
}) {
	const agent = getAgentMeta(chapter.agentId);

	return (
		<div
			className={cn(
				"grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)] gap-px bg-[var(--ret-border)] lg:min-h-[calc(100dvh-64px)]",
				active ? "relative" : null,
			)}
		>
			<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-[minmax(0,1fr)_180px]">
				<div className="flex min-w-0 items-center gap-3 bg-[var(--ret-bg)] px-4 py-3 md:px-5">
					<Logo mark={agent.logoMark} size={22} tone="native" />
					<div className="min-w-0">
						<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{chapter.label}
						</div>
						<div className="truncate text-[14px] font-semibold text-[var(--ret-text)]">
							{agent.name}
						</div>
					</div>
				</div>
				<div className="hidden items-center justify-end bg-[var(--ret-bg)] px-5 md:flex">
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						{String(index + 1).padStart(2, "0")}
					</span>
				</div>
			</div>
			<div className="min-h-0 min-w-0 overflow-hidden bg-[var(--ret-bg)]">
				<div className="h-full min-h-[560px] w-full transition-[opacity,transform] duration-500 [transition-timing-function:var(--ret-ease-out)]">
					<StorySurfaceRenderer surface={chapter.surface} agent={agent} />
				</div>
			</div>
		</div>
	);
}

function AgentStoryAside({
	agent,
	chapter,
	index,
	activeId,
	onSelect,
}: {
	agent: AgentMeta;
	chapter: StoryChapter;
	index: number;
	activeId: string;
	onSelect: (id: string) => void;
}) {
	const commandRows = [
		["install", agent.installCmd],
		["interactive", agent.runCmd],
		agent.headlessCmd ? ["headless", agent.headlessCmd] : null,
		["docs", agent.docsUrl],
	].filter(Boolean) as Array<[string, string]>;
	const [metricLabel, metricValue, metricHint] = chapter.metric;

	return (
		<aside className="relative overflow-hidden bg-[var(--ret-bg)] p-5 md:p-6 lg:sticky lg:top-[64px] lg:h-[calc(100dvh-64px)] lg:min-h-[620px]">
			<CircuitArt
				slug={chapter.id}
				variant="ambient"
				className="opacity-[0.16] dark:opacity-[0.26]"
			/>
			<div
				key={chapter.id}
				className="relative z-10 grid h-full animate-[ret-panel-in_260ms_cubic-bezier(0.16,1,0.3,1)_both] grid-rows-[auto_minmax(0,1fr)_auto] gap-5 motion-reduce:animate-none"
			>
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

				<div className="min-h-0 overflow-hidden">
					<StoryProgressRail activeIndex={index} />
					<nav
						aria-label="Agent surface chapters"
						className="mt-4 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]"
					>
						{STORY_CHAPTERS.map((item, itemIndex) => (
							<a
								key={item.id}
								href={`#agent-story-${item.id}`}
								aria-current={item.id === activeId ? "step" : undefined}
								onClick={(event) => {
									event.preventDefault();
									onSelect(item.id);
								}}
								className={cn(
									"group grid grid-cols-[32px_minmax(0,1fr)_40px] items-center gap-3 bg-[var(--ret-bg)] px-3 py-2 text-[11px] transition-[background-color,color] duration-300 [transition-timing-function:var(--ret-ease-out)] hover:bg-[var(--ret-bg-soft)]",
									item.id === activeId ? "bg-[var(--ret-bg-soft)]" : null,
								)}
							>
								<Logo
									mark={getAgentMeta(item.agentId).logoMark}
									size={16}
									tone="native"
								/>
								<span className="truncate font-mono uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
									{item.label}
								</span>
								<span className="text-right font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
									{String(itemIndex + 1).padStart(2, "0")}
								</span>
							</a>
						))}
					</nav>
				</div>

				<div className="hidden gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid">
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

function StoryProgressRail({ activeIndex }: { activeIndex: number }) {
	const last = Math.max(1, STORY_CHAPTERS.length - 1);
	const progress = activeIndex / last;
	return (
		<div className="relative overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-3">
			<div className="absolute inset-0 opacity-[0.18] [background:radial-gradient(circle_at_85%_15%,var(--ret-text),transparent_36%)]" />
			<div className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
				<svg
					aria-hidden="true"
					viewBox="0 0 28 132"
					className="h-[132px] w-7 overflow-visible text-[var(--ret-border-strong)]"
				>
					<path
						d="M14 4 C4 28 24 48 14 68 C4 88 24 104 14 128"
						fill="none"
						stroke="currentColor"
						strokeWidth="1"
						strokeDasharray="3 7"
					/>
					<path
						d="M14 4 C4 28 24 48 14 68 C4 88 24 104 14 128"
						fill="none"
						stroke="var(--ret-text)"
						strokeWidth="1.4"
						pathLength={1}
						strokeDasharray="1"
						strokeDashoffset={1 - progress}
						style={{
							transition:
								"stroke-dashoffset 520ms var(--ret-ease-drawer)",
						}}
					/>
					{STORY_CHAPTERS.map((item, itemIndex) => {
						const y = 4 + (124 / last) * itemIndex;
						const active = itemIndex <= activeIndex;
						return (
							<circle
								key={item.id}
								cx="14"
								cy={y}
								r={active ? 3.8 : 2.5}
								fill={active ? "var(--ret-text)" : "var(--ret-bg)"}
								stroke="var(--ret-border-strong)"
								strokeWidth="1"
								style={{
									transition:
										"r 260ms var(--ret-ease-out), fill 260ms var(--ret-ease-out)",
								}}
							/>
						);
					})}
				</svg>
				<div className="grid content-between py-0.5">
					{STORY_CHAPTERS.map((item, itemIndex) => (
						<div
							key={item.id}
							className={cn(
								"flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] transition-colors duration-300",
								itemIndex === activeIndex
									? "text-[var(--ret-text)]"
									: "text-[var(--ret-text-muted)]",
							)}
						>
							<span>{item.label}</span>
							<span>{String(itemIndex + 1).padStart(2, "0")}</span>
						</div>
					))}
				</div>
			</div>
		</div>
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

import type { SVGProps } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import {
	WireframeDashboard,
	WireframeAgent,
	WireframeLoadout,
	WireframeHosts,
	WireframeEnvironment,
} from "@/components/three";
import { ToolIcon } from "@/components/ToolIcon";
import { WingBackground } from "@/components/WingBackground";
import { cn } from "@/lib/cn";
import {
	BUILTIN_TOOLS,
	SERVICES,
	TRUSTED_ADDONS,
	type ToolCategory,
} from "@/lib/dashboard/loadout";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";

type Step = {
	id: string;
	tab: string;
	kicker: string;
	title: string;
	body: string;
	Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
	metrics: Array<[string, string]>;
};

const STEPS: ReadonlyArray<Step> = [
	{
		id: "ui",
		tab: "ui",
		kicker: "01 / dashboard",
		title: "Configure once, then operate from the fleet view.",
		body: "Settings, setup, machine lifecycle, terminal, logs, artifacts, and chat all read from the same account configuration instead of one-off wizard state.",
		Icon: IconPanel,
		metrics: [
			["settings", "providers + gateways + profiles"],
			["actions", "wake . sleep . destroy"],
			["storage", "/home/machine/.agent-machines"],
		],
	},
	{
		id: "agent",
		tab: "agent",
		kicker: "02 / runtime",
		title: "Four agents, two operation models, one machine.",
		body: "Autonomous agents (Hermes, OpenClaw) have built-in drivers that wake up on schedule. Task-driven CLIs (Claude Code, Codex) run per-task but can be automated via headless flags.",
		Icon: IconAgent,
		metrics: [
			["autonomous", "hermes . openclaw"],
			["task-driven", "claude code . codex"],
			["profiles", "reusable per account"],
		],
	},
	{
		id: "tools",
		tab: "tools + mcps",
		kicker: "03 / loadout",
		title: "Skills, MCP servers, CLI tools, and plugins are visible.",
		body: "Built-ins and custom loadout entries live in the same account settings model so terminal edits can sync back into the dashboard.",
		Icon: IconTools,
		metrics: [
			["skills", `${listSkills().length} synced`],
			["services", `${SERVICES.length} routes`],
			["custom", "skill . tool . mcp . cli . plugin"],
		],
	},
	{
		id: "providers",
		tab: "providers",
		kicker: "04 / hosts",
		title: "Dedalus by default. Fly and Sandbox are explicit hosts.",
		body: "Persistent-machine providers expose disk, wake/sleep, destroy, and exec. Ephemeral sandboxes expose session exec and external storage.",
		Icon: IconProvider,
		metrics: [
			["dedalus", "persistent microVM"],
			["fly", "app + volume + machine"],
			["sandbox", "ephemeral session"],
		],
	},
	{
		id: "env",
		tab: "vm sandbox env",
		kicker: "05 / environment",
		title: "Gateway and environment settings follow new machines.",
		body: "Gateway profiles, env profiles, and bootstrap presets are account-level objects that a new machine can inherit.",
		Icon: IconEnv,
		metrics: [
			["gateway", "dedalus . ai gateway . byo"],
			["env", "named variable sets"],
			["bootstrap", "phase tracked"],
		],
	},
];

export function WorkflowNavigator() {
	return (
		<section className="relative">
			<div className="sticky top-[48px] z-30 -mx-3 border-y border-[var(--ret-border)] bg-[var(--ret-bg)]/90 backdrop-blur md:-mx-4">
				<nav className="mx-auto grid max-w-[var(--ret-content-max)] grid-cols-2 divide-x divide-y divide-[var(--ret-border)] border-x border-[var(--ret-border)] md:grid-cols-5 md:divide-y-0">
					{STEPS.map((step) => (
						<a
							key={step.id}
							href={`#workflow-${step.id}`}
							className="group flex items-center justify-between gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] transition-colors hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]"
						>
							<span>{step.tab}</span>
							<span className="h-1 w-1 bg-current opacity-40 transition-opacity group-hover:opacity-100" />
						</a>
					))}
				</nav>
			</div>

			<div className="mt-4 grid gap-px overflow-hidden bg-[var(--ret-border)]">
				{STEPS.map((step, index) => (
					<WorkflowRow key={step.id} step={step} index={index} />
				))}
			</div>
		</section>
	);
}

const WING_VARIANTS: Array<"nyx-waves" | "nyx-lines" | "cloud"> = [
	"nyx-waves",
	"nyx-lines",
	"nyx-waves",
	"cloud",
	"nyx-lines",
];

const WIREFRAMES = [
	WireframeDashboard,
	WireframeAgent,
	WireframeLoadout,
	WireframeHosts,
	WireframeEnvironment,
];

function WorkflowRow({ step, index }: { step: Step; index: number }) {
	const flipped = index % 2 === 1;
	const WireScene = WIREFRAMES[index];

	const textPanel = (
		<div
			className={cn(
				"flex flex-col justify-between border-b border-[var(--ret-border)] p-4",
				flipped ? "md:border-l md:border-b-0" : "md:border-r md:border-b-0",
			)}
		>
			<div>
				<ReticleLabel>{step.kicker}</ReticleLabel>
				<h3 className="ret-display mt-3 max-w-[16ch] text-2xl md:text-3xl">
					{step.title}
				</h3>
				<p className="mt-3 max-w-[52ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
					{step.body}
				</p>
			</div>
			<div className="mt-6 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{step.metrics.map(([label, value]) => (
					<div key={label} className="flex items-center justify-between gap-4 bg-[var(--ret-bg-soft)] px-3 py-2">
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{label}
						</span>
						<span className="font-mono text-[10px] text-[var(--ret-text)]">
							{value}
						</span>
					</div>
				))}
			</div>
		</div>
	);

	const diagramPanel = (
		<div className="relative min-h-[360px] overflow-hidden bg-[var(--ret-bg-soft)]">
			<WingBackground
				variant={WING_VARIANTS[index] ?? "nyx-lines"}
				opacity={{ light: 0.26, dark: 0.44 }}
				fadeEdges
			/>
			<div className="ret-material-field absolute inset-0 opacity-80" aria-hidden="true" />
			<div className="relative z-10 grid h-full grid-cols-[0.65fr_1fr] gap-px bg-[var(--ret-border)]">
				<div className="flex flex-col justify-between bg-[var(--ret-bg)]/92 p-3 backdrop-blur-sm">
					{WireScene ? <WireScene className="h-full min-h-[180px] w-full" /> : null}
					<div className="mt-2 space-y-1">
						<ReticleBadge variant={index === 1 ? "accent" : "default"}>
							{step.tab}
						</ReticleBadge>
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							block {String(index + 1).padStart(2, "0")}
						</p>
					</div>
				</div>
				<RowDiagram index={index} />
			</div>
		</div>
	);

	return (
		<div
			id={`workflow-${step.id}`}
			className={cn(
				"grid min-h-[360px] bg-[var(--ret-bg)]",
				flipped
					? "md:grid-cols-[1.15fr_0.85fr]"
					: "md:grid-cols-[0.85fr_1.15fr]",
			)}
		>
			{flipped ? (
				<>
					{diagramPanel}
					{textPanel}
				</>
			) : (
				<>
					{textPanel}
					{diagramPanel}
				</>
			)}
		</div>
	);
}

function RowDiagram({ index }: { index: number }) {
	switch (index) {
		case 0:
			return <DashboardPanel />;
		case 1:
			return <RuntimePanel />;
		case 2:
			return <LoadoutPanel />;
		case 3:
			return <HostsPanel />;
		case 4:
			return <EnvironmentPanel />;
		default:
			return null;
	}
}

/* ------------------------------------------------------------------ */
/* Row 01: Dashboard -- agent flow diagram                             */
/* ------------------------------------------------------------------ */

function DashboardPanel() {
	return (
		<div className="flex flex-col justify-between bg-[var(--ret-bg)]/88 p-4 backdrop-blur-sm">
			<div className="flex items-center gap-1">
				<Logo mark="dedalus" size={14} />
				<Logo mark="nous" size={14} />
			</div>
			<div className="flex items-center gap-1.5">
				<FlowBox label="You" accent="var(--ret-text-muted)">
					<IconUser className="h-4 w-4" />
				</FlowBox>
				<FlowArrow />
				<FlowBox label="Gateway" accent="var(--ret-purple)">
					<IconGateway className="h-4 w-4" />
				</FlowBox>
				<FlowArrow />
				<FlowBox label="Agent" accent="var(--ret-green)">
					<Logo mark="agent" size={14} />
				</FlowBox>
				<FlowArrow />
				<FlowBox label="Container" accent="var(--ret-amber)">
					<IconContainer className="h-4 w-4" />
				</FlowBox>
			</div>
			<div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{(
					[
						["settings", "fleet"],
						["dashboard", "terminal"],
					] as const
				)
					.flat()
					.map((label) => (
						<div key={label} className="bg-[var(--ret-bg-soft)] px-2.5 py-2">
							<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text)]">
								{label}
							</span>
						</div>
					))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Row 02: Runtime -- gateway + agent split                            */
/* ------------------------------------------------------------------ */

function RuntimePanel() {
	return (
		<div className="flex flex-col justify-between bg-[var(--ret-bg)]/88 p-4 backdrop-blur-sm">
			<div className="flex items-center gap-2">
				<Logo mark="nous" size={14} />
				<Logo mark="openclaw" size={14} />
				<Logo mark="anthropic" size={14} />
				<Logo mark="openai" size={14} />
			</div>
			<div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				<MiniCell label="Hermes" value="memory + cron + MCP" />
				<MiniCell label="OpenClaw" value="browser + vision" />
				<MiniCell label="Claude Code" value="coding + SDK" />
				<MiniCell label="Codex CLI" value="sandbox + exec" />
			</div>
			<div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				<div className="bg-[var(--ret-bg-soft)] px-2.5 py-2">
					<p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text)]">autonomous</p>
					<p className="font-mono text-[9px] text-[var(--ret-text-muted)]">hermes . openclaw</p>
				</div>
				<div className="bg-[var(--ret-bg-soft)] px-2.5 py-2">
					<p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text)]">task-driven</p>
					<p className="font-mono text-[9px] text-[var(--ret-text-muted)]">claude code . codex</p>
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Row 03: Loadout -- brand logos + tallies + skill categories          */
/* ------------------------------------------------------------------ */

const FEATURED_BRANDS: Array<{ name: string; slug: ServiceSlug }> =
	TRUSTED_ADDONS.filter((a): a is typeof a & { brand: ServiceSlug } => Boolean(a.brand))
		.reduce<Array<{ name: string; slug: ServiceSlug }>>((acc, a) => {
			if (!acc.some((x) => x.slug === a.brand)) acc.push({ name: a.name, slug: a.brand! });
			return acc;
		}, [])
		.slice(0, 18);

function LoadoutPanel() {
	const skills = listSkills();
	const mcps = listMcpServers();
	const mcpToolCount = mcps.reduce((sum, m) => sum + m.tools.length, 0);

	const skillCats = skills.reduce<Record<string, number>>(
		(acc, s) => ({ ...acc, [s.category]: (acc[s.category] ?? 0) + 1 }),
		{},
	);

	return (
		<div className="flex flex-col gap-2.5 overflow-y-auto bg-[var(--ret-bg)]/88 p-4 backdrop-blur-sm">
			{/* Tallies */}
			<div className="grid grid-cols-4 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				<CountCell label="built-ins" value={String(BUILTIN_TOOLS.length)} />
				<CountCell label="skills" value={String(skills.length)} />
				<CountCell label="MCP tools" value={String(mcpToolCount)} />
				<CountCell label="services" value={String(SERVICES.length)} />
			</div>

			{/* Brand logo grid */}
			<div className="grid grid-cols-6 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{FEATURED_BRANDS.map((b) => (
					<div
						key={b.slug}
						className="flex flex-col items-center justify-center gap-1 bg-[var(--ret-bg-soft)] py-2.5"
					>
						<ServiceIcon slug={b.slug} size={18} tone="color" />
						<span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ret-text-muted)]">
							{b.name.split(" ")[0]}
						</span>
					</div>
				))}
			</div>

			{/* Skill categories */}
			<div className="flex flex-wrap gap-1">
				{Object.entries(skillCats)
					.sort((a, b) => b[1] - a[1])
					.map(([cat, count]) => (
						<span
							key={cat}
							className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ret-text-dim)]"
						>
							{cat} <span className="text-[var(--ret-text-muted)]">{count}</span>
						</span>
					))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Row 04: Hosts -- container filesystem + provider marks              */
/* ------------------------------------------------------------------ */

function HostsPanel() {
	return (
		<div className="flex flex-col justify-between bg-[var(--ret-bg)]/88 p-4 backdrop-blur-sm">
			<div className="flex items-center gap-2">
				<Logo mark="dedalus" size={14} />
				<ServiceIcon slug="vercel" size={14} />
				<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">+ fly</span>
			</div>
			<div className="grid grid-cols-3 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{(
					[
						["~/.agent-machines/", "runtime state"],
						["skills/", "SKILL.md files"],
						["config.toml", "agent config"],
						["skills/", "96 SKILL.md"],
						["sessions.db", "FTS5 history"],
						["crons/", "scheduled tasks"],
					] as const
				).map(([label, sub]) => (
					<div key={`${label}-${sub}`} className="bg-[var(--ret-bg-soft)] px-2.5 py-2">
						<p className="font-mono text-[10px] text-[var(--ret-text)]">{label}</p>
						<p className="font-mono text-[8px] text-[var(--ret-text-muted)]">{sub}</p>
					</div>
				))}
			</div>
			<div className="grid grid-cols-3 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				<MiniCell label="Dedalus" value="persistent microVM" />
				<MiniCell label="Fly" value="app + volume" />
				<MiniCell label="Sandbox" value="ephemeral session" />
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Row 05: Environment -- config flow + preset list                    */
/* ------------------------------------------------------------------ */

function EnvironmentPanel() {
	return (
		<div className="flex flex-col justify-between bg-[var(--ret-bg)]/88 p-4 backdrop-blur-sm">
			<div className="flex items-center gap-2">
				<Logo mark="dedalus" size={14} />
			</div>

			{/* Config flow */}
			<div className="flex items-center gap-1.5">
				{(["account", "gateway", "agent", "env", "machine"] as const).map((label, i) => (
					<span key={label} className="flex items-center gap-1.5">
						{i > 0 ? (
							<span className="text-[var(--ret-purple)]">
								<svg width="10" height="6" viewBox="0 0 10 6" fill="none">
									<path d="M0 3h7M6 1l2 2-2 2" stroke="currentColor" strokeWidth="1" />
								</svg>
							</span>
						) : null}
						<span className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ret-text)]">
							{label}
						</span>
					</span>
				))}
			</div>

			{/* Preset list */}
			<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{(
					[
						["Opinionated default", "active", "bundled skills + tools + MCPs"],
						["Frontend design lab", "", "taste + Figma + browser"],
						["Production ops", "", "Vercel + Datadog + CI/CD"],
						["Research browser", "", "search + extraction + reach"],
					] as const
				).map(([name, badge, hint]) => (
					<div
						key={name}
						className="flex items-center justify-between bg-[var(--ret-bg-soft)] px-2.5 py-1.5"
					>
						<span className="font-mono text-[10px] text-[var(--ret-text)]">{name}</span>
						<span className="flex items-center gap-1 font-mono text-[8px] text-[var(--ret-text-muted)]">
							{badge ? <ReticleBadge variant="accent" className="text-[8px]">{badge}</ReticleBadge> : null}
							{hint}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

function FlowBox({
	label,
	accent,
	children,
}: {
	label: string;
	accent: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-1 flex-col items-center gap-1 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1.5 py-2">
			<div style={{ color: accent }}>{children}</div>
			<p className="font-mono text-[8px] font-semibold text-[var(--ret-text)]">{label}</p>
		</div>
	);
}

function FlowArrow() {
	return (
		<div className="flex shrink-0 items-center px-0.5 text-[var(--ret-purple)]">
			<svg width="12" height="6" viewBox="0 0 12 6" fill="none">
				<path d="M0 3h9M8 1l2 2-2 2" stroke="currentColor" strokeWidth="1" />
			</svg>
		</div>
	);
}

function MiniCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg-soft)] px-2.5 py-2">
			<p className="font-mono text-[10px] font-semibold text-[var(--ret-text)]">{label}</p>
			<p className="font-mono text-[8px] text-[var(--ret-text-muted)]">{value}</p>
		</div>
	);
}

function CountCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg-soft)] px-2 py-2 text-center">
			<p className="font-mono text-sm tabular-nums text-[var(--ret-text)]">{value}</p>
			<p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ret-text-muted)]">{label}</p>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Inline icons                                                        */
/* ------------------------------------------------------------------ */

function IconPanel(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><rect x="4" y="6" width="24" height="20" /><path d="M4 12h24M11 12v14M15 17h9M15 21h6" /></svg>;
}

function IconAgent(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><path d="M16 4l9 5v14l-9 5-9-5V9z" /><path d="M11 14h10M11 18h10M16 4v8M16 20v8" /></svg>;
}

function IconTools(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><rect x="5" y="5" width="8" height="8" /><rect x="19" y="5" width="8" height="8" /><rect x="5" y="19" width="8" height="8" /><rect x="19" y="19" width="8" height="8" /><path d="M13 9h6M9 13v6M23 13v6M13 23h6" /></svg>;
}

function IconProvider(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><path d="M6 9h20v6H6zM6 17h20v6H6z" /><path d="M10 12h3M10 20h3M22 12h2M22 20h2" /></svg>;
}

function IconEnv(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><path d="M5 8h22v16H5z" /><path d="M9 13h4M9 17h8M9 21h5M21 13l2 2-2 2" /></svg>;
}

function IconUser(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<circle cx="10" cy="6" r="3" />
			<path d="M3 18c0-3.5 3.1-6 7-6s7 2.5 7 6" />
		</svg>
	);
}

function IconGateway(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="3" y="4" width="14" height="5" />
			<rect x="3" y="11" width="14" height="5" />
			<circle cx="6" cy="6.5" r="0.8" fill="currentColor" />
			<circle cx="6" cy="13.5" r="0.8" fill="currentColor" />
			<path d="M10 9v2" />
		</svg>
	);
}

function IconContainer(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M10 2l7 4v8l-7 4-7-4V6z" />
			<path d="M10 10l7-4M10 10v8M10 10L3 6" />
		</svg>
	);
}

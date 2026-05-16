import type { SVGProps } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { WorkflowTabs } from "@/components/WorkflowTabs";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

type Bullet = readonly [prefix: string, highlight: string, suffix?: string];

type PoweredByEntry = { name: string; mark: Mark };

type Step = {
	id: string;
	tab: string;
	kicker: string;
	title: string;
	body: string;
	Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
	bullets: readonly Bullet[];
	poweredBy: readonly PoweredByEntry[];
};

const STEPS: ReadonlyArray<Step> = [
	{
		id: "ui",
		tab: "dashboard",
		kicker: "AGENT MACHINES · DASHBOARD",
		title: "Configure once, then operate from the fleet view.",
		body: "Settings, setup, machine lifecycle, terminal, logs, artifacts, and chat all read from the same account configuration instead of one-off wizard state.",
		Icon: IconPanel,
		bullets: [
			["Configure all ", "settings", " — providers, gateways, and profiles"],
			["Full machine lifecycle: ", "wake · sleep · destroy"],
			["Persistent state in ", "/home/machine/.agent-machines"],
		],
		poweredBy: [{ name: "Dedalus", mark: "dedalus" }],
	},
	{
		id: "agent",
		tab: "agent",
		kicker: "AGENT MACHINES · RUNTIME",
		title: "Four agents, two operation models, one machine.",
		body: "Autonomous agents have built-in drivers that wake up on schedule. Task-driven CLIs run per-task but can be automated via headless flags and cron.",
		Icon: IconAgent,
		bullets: [
			["Autonomous agents: ", "Hermes · OpenClaw"],
			["Task-driven CLIs: ", "Claude Code · Codex"],
			["Reusable per-account ", "agent profiles"],
		],
		poweredBy: [
			{ name: "Nous", mark: "nous" },
			{ name: "OpenClaw", mark: "openclaw" },
		],
	},
	{
		id: "tools",
		tab: "tools + mcps",
		kicker: "AGENT MACHINES · LOADOUT",
		title: "Skills, MCP servers, CLI tools, and plugins — all visible.",
		body: "Built-ins and custom loadout entries live in the same account settings model so terminal edits sync back into the dashboard.",
		Icon: IconTools,
		bullets: [
			["", "96 skills", " synced from the wiki at boot"],
			["", "17 service", " integrations and routes"],
			["Custom loadout: ", "skill · tool · mcp · cli · plugin"],
		],
		poweredBy: [],
	},
	{
		id: "providers",
		tab: "providers",
		kicker: "AGENT MACHINES · HOSTS",
		title: "Dedalus by default. Fly and Sandbox are explicit stubs.",
		body: "Persistent-machine providers expose disk, wake/sleep, destroy, and exec. Ephemeral sandboxes expose session exec and external storage.",
		Icon: IconProvider,
		bullets: [
			["", "Dedalus", " — persistent microVM with full disk"],
			["", "Fly", " — app + volume + machine"],
			["", "Sandbox", " — ephemeral session execution"],
		],
		poweredBy: [{ name: "Dedalus", mark: "dedalus" }],
	},
	{
		id: "env",
		tab: "environment",
		kicker: "AGENT MACHINES · ENVIRONMENT",
		title: "Gateway and environment settings follow new machines.",
		body: "Gateway profiles, env profiles, and bootstrap presets are account-level objects that a new machine can inherit.",
		Icon: IconEnv,
		bullets: [
			["Gateway modes: ", "dedalus · ai gateway · byo"],
			["Named variable sets with ", "env profiles"],
			["Phase-tracked ", "bootstrap", " presets"],
		],
		poweredBy: [{ name: "Dedalus", mark: "dedalus" }],
	},
];

const TAB_DATA = STEPS.map((s) => ({
	id: s.id,
	tab: s.tab,
	icon: <s.Icon className="h-3.5 w-3.5" />,
}));

const STEP_GRADIENTS: ReadonlyArray<string> = [
	[
		"radial-gradient(circle at 30% 20%, rgba(139,92,246,0.65) 0%, transparent 50%)",
		"radial-gradient(circle at 70% 80%, rgba(79,70,229,0.55) 0%, transparent 45%)",
		"radial-gradient(circle at 85% 25%, rgba(192,132,252,0.4) 0%, transparent 40%)",
		"#0c0515",
	].join(", "),
	[
		"radial-gradient(circle at 40% 30%, rgba(16,185,129,0.65) 0%, transparent 50%)",
		"radial-gradient(circle at 75% 70%, rgba(6,182,212,0.55) 0%, transparent 45%)",
		"radial-gradient(circle at 15% 75%, rgba(52,211,153,0.4) 0%, transparent 40%)",
		"#020f0a",
	].join(", "),
	[
		"radial-gradient(circle at 50% 25%, rgba(59,130,246,0.65) 0%, transparent 50%)",
		"radial-gradient(circle at 20% 75%, rgba(99,102,241,0.55) 0%, transparent 45%)",
		"radial-gradient(circle at 80% 50%, rgba(37,99,235,0.4) 0%, transparent 40%)",
		"#030815",
	].join(", "),
	[
		"radial-gradient(circle at 60% 40%, rgba(236,72,153,0.65) 0%, transparent 50%)",
		"radial-gradient(circle at 20% 65%, rgba(168,85,247,0.55) 0%, transparent 45%)",
		"radial-gradient(circle at 85% 15%, rgba(244,63,94,0.4) 0%, transparent 40%)",
		"#150510",
	].join(", "),
	[
		"radial-gradient(circle at 35% 30%, rgba(245,158,11,0.65) 0%, transparent 50%)",
		"radial-gradient(circle at 70% 65%, rgba(249,115,22,0.55) 0%, transparent 45%)",
		"radial-gradient(circle at 20% 70%, rgba(239,68,68,0.4) 0%, transparent 40%)",
		"#150a02",
	].join(", "),
];

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function WorkflowNavigator() {
	return (
		<section className="relative">
			<div className="px-4 py-10 text-center md:px-5 md:py-14">
				<ReticleLabel className="mx-auto">WORKFLOW</ReticleLabel>
				<h2 className="ret-display mx-auto mt-4 max-w-[24ch] text-2xl md:text-4xl">
					Everything your machine needs in one tool
				</h2>
				<p className="mx-auto mt-4 max-w-[54ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
					Agent Machines unifies dashboard, agents, tools, providers,
					and environment into a single, consistent interface.
				</p>
			</div>

			<WorkflowTabs steps={TAB_DATA} />

			<div className="divide-y divide-[var(--ret-border)]">
				{STEPS.map((step, index) => (
					<WorkflowRow
						key={step.id}
						step={step}
						index={index}
					/>
				))}
			</div>
		</section>
	);
}

/* ------------------------------------------------------------------ */
/* Per-step row                                                        */
/* ------------------------------------------------------------------ */

function WorkflowRow({ step, index }: { step: Step; index: number }) {
	return (
		<div
			id={`workflow-${step.id}`}
			className="grid min-h-[480px] scroll-mt-[84px] grid-cols-1 md:grid-cols-2"
		>
			{/* Text panel */}
			<div className="flex flex-col justify-between p-5 md:p-8 lg:p-10">
				<div>
					<ReticleLabel>{step.kicker}</ReticleLabel>
					<h3 className="mt-4 max-w-[18ch] text-xl font-semibold tracking-tight text-[var(--ret-text)] md:text-2xl">
						{step.title}
					</h3>
					<p className="mt-3 max-w-[48ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						{step.body}
					</p>

					<ul className="mt-6 space-y-3">
						{step.bullets.map(([prefix, highlight, suffix], bi) => (
							<li
								key={bi}
								className="flex items-start gap-2.5 text-[13px] leading-relaxed text-[var(--ret-text)]"
							>
								<span className="mt-px shrink-0 font-semibold text-[var(--ret-purple)]">
									→→
								</span>
								<span>
									{prefix}
									<code className="rounded bg-[var(--ret-surface)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--ret-purple)]">
										{highlight}
									</code>
									{suffix}
								</span>
							</li>
						))}
					</ul>
				</div>

				{step.poweredBy.length > 0 && (
					<div className="mt-8 flex items-center gap-2.5 pt-2">
						<span className="text-[11px] text-[var(--ret-text-muted)]">
							Powered by
						</span>
						{step.poweredBy.map((p) => (
							<span
								key={p.name}
								className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ret-surface)] px-2.5 py-1"
							>
								<Logo mark={p.mark} size={14} />
								<span className="text-[11px] font-medium text-[var(--ret-text)]">
									{p.name}
								</span>
							</span>
						))}
					</div>
				)}
			</div>

			{/* Gradient + terminal panel */}
			<div
				className="relative min-h-[420px] overflow-hidden md:min-h-0"
				style={{ background: STEP_GRADIENTS[index] }}
			>
				<div className="absolute inset-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0d12]/85 backdrop-blur-xl md:inset-5">
					<div className="flex h-full flex-col p-4 md:p-5">
						<StepTerminal index={index} />
					</div>
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Terminal blocks                                                     */
/* ------------------------------------------------------------------ */

function StepTerminal({ index }: { index: number }) {
	switch (index) {
		case 0:
			return <DashboardTerminal />;
		case 1:
			return <AgentTerminal />;
		case 2:
			return <ToolsTerminal />;
		case 3:
			return <ProvidersTerminal />;
		case 4:
			return <EnvironmentTerminal />;
		default:
			return null;
	}
}

function DashboardTerminal() {
	return (
		<TerminalShell command="dedalus fleet inspect">
			<TLine dim>Fleet: kevin-fleet</TLine>
			<TLine dim>Machines: 1 active</TLine>
			<TSpacer />
			<TRow label="Machine" value="main-01" />
			<TRow label="Status" value="awake" success />
			<TRow label="Provider" value="dedalus (persistent microVM)" />
			<TRow label="Disk" value="2.1 / 10 GiB" />
			<TRow label="Last wake" value="12m ago" />
			<TSpacer />
			<TRow label="Settings" value="providers + gateways + profiles" />
			<TRow label="Actions" value="wake · sleep · destroy" />
			<TRow label="Storage" value="/home/machine/.agent-machines" />
			<TSpacer />
			<TLine success>✓ Fleet healthy</TLine>
		</TerminalShell>
	);
}

function AgentTerminal() {
	return (
		<TerminalShell command="dedalus agent list">
			<TLine dim>4 agents configured</TLine>
			<TSpacer />
			<THeader cols={["Name", "Mode", "Driver"]} />
			<TTableRow cols={["Hermes", "autonomous", "memory + cron + MCP"]} />
			<TTableRow
				cols={["OpenClaw", "autonomous", "browser + vision"]}
			/>
			<TTableRow
				cols={["Claude Code", "task-driven", "coding + SDK"]}
			/>
			<TTableRow
				cols={["Codex CLI", "task-driven", "sandbox + exec"]}
			/>
			<TSpacer />
			<TLine success>✓ 2 autonomous drivers active</TLine>
		</TerminalShell>
	);
}

function ToolsTerminal() {
	return (
		<TerminalShell command="dedalus loadout show">
			<TLine dim>Loadout: opinionated-default</TLine>
			<TSpacer />
			<TRow label="Built-ins" value="23 tools" />
			<TRow label="Skills" value="96 synced" />
			<TRow label="MCP servers" value="7 connected (42 tools)" />
			<TRow label="Services" value="17 routes" />
			<TSpacer />
			<TLine dim>
				Categories: frontend · security · research · design · ops ·
				content · ...
			</TLine>
			<TSpacer />
			<TLine success>✓ All integrations healthy</TLine>
		</TerminalShell>
	);
}

function ProvidersTerminal() {
	return (
		<TerminalShell command="dedalus provider list">
			<TLine dim>3 providers configured</TLine>
			<TSpacer />
			<THeader cols={["Provider", "Type", "Status"]} />
			<TTableRow cols={["dedalus", "persistent", "● active"]} accent={[false, false, true]} />
			<TTableRow cols={["fly", "persistent", "○ standby"]} />
			<TTableRow cols={["sandbox", "ephemeral", "○ standby"]} />
			<TSpacer />
			<TLine dim>Filesystem:</TLine>
			<TLine>{"  "}~/.agent-machines/{"    "}runtime state</TLine>
			<TLine>{"  "}skills/{"               "}96 SKILL.md files</TLine>
			<TLine>{"  "}sessions.db{"           "}FTS5 history</TLine>
			<TSpacer />
			<TLine success>✓ 1 provider active</TLine>
		</TerminalShell>
	);
}

function EnvironmentTerminal() {
	return (
		<TerminalShell command="dedalus env show">
			<TLine>
				Gateway:{"   "}
				<span className="text-[#d2beff]">dedalus</span> (default)
			</TLine>
			<TLine>Bootstrap: phase-tracked</TLine>
			<TSpacer />
			<THeader cols={["Profile", "Status", "Description"]} />
			<TTableRow
				cols={[
					"Opinionated default",
					"● active",
					"bundled skills + tools",
				]}
				accent={[false, true, false]}
			/>
			<TTableRow
				cols={[
					"Frontend design lab",
					"ready",
					"taste + Figma + browser",
				]}
			/>
			<TTableRow
				cols={["Production ops", "ready", "Vercel + Datadog + CI/CD"]}
			/>
			<TTableRow
				cols={[
					"Research browser",
					"ready",
					"search + extraction + reach",
				]}
			/>
			<TSpacer />
			<TLine success>✓ 4 presets available</TLine>
		</TerminalShell>
	);
}

/* ------------------------------------------------------------------ */
/* Terminal primitives                                                  */
/* ------------------------------------------------------------------ */

function TerminalShell({
	command,
	children,
}: {
	command: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-full flex-col font-mono text-[11px] leading-[1.8] md:text-[12px]">
			<div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
				<span className="text-white/35">$</span>
				<span className="font-medium text-white/80">{command}</span>
			</div>
			<div className="mt-3 flex-1 space-y-0.5 overflow-auto">
				{children}
			</div>
		</div>
	);
}

function TLine({
	dim,
	success,
	children,
}: {
	dim?: boolean;
	success?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				dim && "text-white/35",
				success && "text-emerald-400",
				!dim && !success && "text-white/65",
			)}
		>
			{children}
		</div>
	);
}

function TRow({
	label,
	value,
	success,
}: {
	label: string;
	value: string;
	success?: boolean;
}) {
	return (
		<div className="flex gap-2">
			<span className="w-28 shrink-0 text-white/35">{label}</span>
			<span className={success ? "text-emerald-400" : "text-white/70"}>
				{value}
			</span>
		</div>
	);
}

function THeader({ cols }: { cols: string[] }) {
	return (
		<div className="flex gap-2 border-b border-white/[0.06] pb-1 text-white/30">
			{cols.map((c) => (
				<span key={c} className="flex-1">
					{c}
				</span>
			))}
		</div>
	);
}

function TTableRow({
	cols,
	accent,
}: {
	cols: string[];
	accent?: boolean[];
}) {
	return (
		<div className="flex gap-2 text-white/65">
			{cols.map((c, i) => (
				<span
					key={i}
					className={cn(
						"flex-1",
						accent?.[i] && "text-emerald-400",
					)}
				>
					{c}
				</span>
			))}
		</div>
	);
}

function TSpacer() {
	return <div className="h-2" />;
}

/* ------------------------------------------------------------------ */
/* SVG Icons                                                           */
/* ------------------------------------------------------------------ */

function IconPanel(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			{...props}
		>
			<rect x="4" y="6" width="24" height="20" />
			<path d="M4 12h24M11 12v14M15 17h9M15 21h6" />
		</svg>
	);
}

function IconAgent(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			{...props}
		>
			<path d="M16 4l9 5v14l-9 5-9-5V9z" />
			<path d="M11 14h10M11 18h10M16 4v8M16 20v8" />
		</svg>
	);
}

function IconTools(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			{...props}
		>
			<rect x="5" y="5" width="8" height="8" />
			<rect x="19" y="5" width="8" height="8" />
			<rect x="5" y="19" width="8" height="8" />
			<rect x="19" y="19" width="8" height="8" />
			<path d="M13 9h6M9 13v6M23 13v6M13 23h6" />
		</svg>
	);
}

function IconProvider(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			{...props}
		>
			<path d="M6 9h20v6H6zM6 17h20v6H6z" />
			<path d="M10 12h3M10 20h3M22 12h2M22 20h2" />
		</svg>
	);
}

function IconEnv(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 32 32"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			{...props}
		>
			<path d="M5 8h22v16H5z" />
			<path d="M9 13h4M9 17h8M9 21h5M21 13l2 2-2 2" />
		</svg>
	);
}

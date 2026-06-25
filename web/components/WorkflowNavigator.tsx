import type { SVGProps } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { CircuitArt } from "@/components/reticle/CircuitArt";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { WorkflowTabs } from "@/components/WorkflowTabs";
import { cn } from "@/lib/cn";
import { HARNESS } from "@/lib/platform/harness";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

type Bullet = readonly [prefix: string, highlight: string, suffix?: string];

type PoweredByEntry =
	| { kind: "logo"; name: string; mark: Mark }
	| { kind: "service"; name: string; slug: ServiceSlug };

type Metric = readonly [label: string, value: string, hint?: string];

type Step = {
	id: string;
	tab: string;
	stage: string;
	kicker: string;
	title: string;
	body: string;
	Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
	art: string;
	bullets: readonly Bullet[];
	metrics: readonly Metric[];
	poweredBy: readonly PoweredByEntry[];
};

const STEPS: ReadonlyArray<Step> = [
	{
		id: "ui",
		tab: "dashboard",
		stage: "01",
		kicker: "AGENT MACHINES · CONTROL PLANE",
		title: "Configure once, supervise the whole fleet.",
		body: "Setup, lifecycle, terminal, logs, artifacts, usage, and chat all read from the same account objects. The dashboard shows what is configured, running, and saved.",
		Icon: IconPanel,
		art: "overview",
		bullets: [
			["Route ", "runtime + substrate", " from one account settings model"],
			["Worker lifecycle: ", "wake · sleep · destroy", " (per substrate capability)"],
			["Persistent state in ", "/home/machine/.agent-machines"],
		],
		metrics: [
			["route", "runtime + substrate", "account object"],
			["state", "disk-backed", "/home/machine"],
			["actions", "wake · sleep · destroy", "capability gated"],
		],
		poweredBy: [
			{ kind: "service", name: "Clerk", slug: "clerk" },
			{ kind: "service", name: "Vercel", slug: "vercel" },
		],
	},
	{
		id: "agent",
		tab: "agent",
		stage: "02",
		kicker: "AGENT MACHINES · RUNTIME ROUTES",
		title: "Four runtimes, two operation models, one worker.",
		body: "Hermes and OpenClaw run as longer-lived agent routes. Claude Code and Codex run as task CLIs. Each lands inside the same machine record and persistent runtime root.",
		Icon: IconAgent,
		art: "agents",
		bullets: [
			["Autonomous routes: ", "Hermes · OpenClaw"],
			["Task-driven routes: ", "Claude Code · Codex"],
			["Reusable per-account ", "agent profiles"],
		],
		metrics: [
			["autonomous", "Hermes · OpenClaw", "gateway workers"],
			["task cli", "Claude Code · Codex", "headless exec"],
			["profile", "per account", "saved default"],
		],
		poweredBy: [
			{ kind: "logo", name: "Nous", mark: "nous" },
			{ kind: "logo", name: "OpenClaw", mark: "openclaw" },
		],
	},
	{
		id: "tools",
		tab: "tools + mcps",
		stage: "03",
		kicker: "AGENT MACHINES · LOADOUT",
		title: "Skills, MCP servers, CLIs, and plugins — one harness.",
		body: "Loadout is the active stack on a machine: skills, MCPs, service routes, CLIs, plugins, and source entries. Registry is where new entries get added.",
		Icon: IconTools,
		art: "loadout",
		bullets: [
			["", `${HARNESS.skillCount} skills`, " in SKILL.md protocol"],
			["", `${HARNESS.serviceRouteCount} service routes`, " · MCP → CLI → skills"],
			["", `${HARNESS.cliCount}+ CLIs`, " · closed-loop verification"],
			["Custom loadout: ", "skill · tool · mcp · cli · plugin"],
		],
		metrics: [
			["skills", `${HARNESS.skillCount}`, "SKILL.md"],
			["services", `${HARNESS.serviceRouteCount}`, "ranked routes"],
			["tools", `${HARNESS.rigToolSurfaceCount}`, "callable"],
		],
		poweredBy: [{ kind: "logo", name: "Agent Machines", mark: "am" }],
	},
	{
		id: "providers",
		tab: "providers",
		stage: "04",
		kicker: "AGENT MACHINES · SUBSTRATE ROUTES",
		title: "Four substrate lanes — E2B, Sprites, Dedalus, and Vercel.",
		body: "Each lane implements the same MachineProvider shape. The UI shows only the lifecycle actions and streaming behavior that provider supports.",
		Icon: IconProvider,
		art: "machines",
		bullets: [
			["", "E2B", " — sandbox with pause/resume"],
			["", "Sprites", " — persistent microVM on Sprites.dev"],
			["", "Dedalus Machines", " — strong default on boot and sleep/wake"],
			["", "Vercel Sandbox", " — persistent microVMs with auto-snapshots"],
		],
		metrics: [
			["lanes", "4", "one interface"],
			["capability", "provider-scoped", "no fake buttons"],
			["stream", "terminal + logs", "when supported"],
		],
		poweredBy: [{ kind: "service", name: "Vercel", slug: "vercel" }],
	},
	{
		id: "env",
		tab: "environment",
		stage: "05",
		kicker: "AGENT MACHINES · ENVIRONMENT",
		title: "Gateway and env profiles follow every new worker.",
		body: "Gateway modes, named variable sets, and bootstrap presets are account-level objects a new worker inherits on deploy.",
		Icon: IconEnv,
		art: "settings",
		bullets: [
			["Gateway modes: ", "tunnel · ai gateway · byo"],
			["Named variable sets with ", "env profiles"],
			["Phase-tracked ", "bootstrap", " presets"],
		],
		metrics: [
			["gateway", "ai gateway", "default route"],
			["env", "profiles", "named sets"],
			["bootstrap", "phased", "visible steps"],
		],
		poweredBy: [
			{ kind: "service", name: "Vercel", slug: "vercel" },
			{ kind: "service", name: "Cloudflare", slug: "cloudflare" },
		],
	},
];

const TAB_DATA = STEPS.map((s) => ({
	id: s.id,
	tab: s.tab,
	icon: <s.Icon className="h-3.5 w-3.5" />,
}));

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function WorkflowNavigator() {
	return (
		<section className="relative">
			<div className="grid gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[0.82fr_1.18fr]">
				<div className="bg-[var(--ret-bg)] px-4 py-8 md:px-6 md:py-10">
					<ReticleLabel>WORKFLOW</ReticleLabel>
					<h2 className="ret-display mt-4 max-w-[20ch] text-2xl md:text-4xl">
						One worker, one recipe.
					</h2>
					<p className="mt-4 max-w-[58ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						Account settings compile into a runnable worker: runtime,
						substrate, model route, environment, loadout, and observable state.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-px bg-[var(--ret-border)] sm:grid-cols-4">
					<WorkflowPillar label="runtime" value="agent driver" />
					<WorkflowPillar label="substrate" value="machine lane" />
					<WorkflowPillar label="loadout" value="tools + MCP" />
					<WorkflowPillar label="observe" value="logs + usage" />
				</div>
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
			className="grid min-h-[520px] scroll-mt-[84px] grid-cols-1 md:grid-cols-[0.42fr_0.58fr]"
		>
			{/* Text panel */}
			<div className="relative flex flex-col justify-between overflow-hidden bg-[var(--ret-bg)] p-5 md:p-8 lg:p-10">
				<CircuitArt
					slug={step.art}
					variant="ambient"
					className="opacity-[0.22] dark:opacity-[0.3]"
				/>
				<div>
					<div className="flex items-center justify-between gap-4">
						<ReticleLabel>{step.kicker}</ReticleLabel>
						<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
							stage {step.stage}
						</span>
					</div>
					<h3 className="mt-4 max-w-[18ch] text-xl font-semibold tracking-tight text-[var(--ret-text)] md:text-2xl">
						{step.title}
					</h3>
					<p className="mt-3 max-w-[48ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						{step.body}
					</p>

					<ul className="mt-7 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
						{step.bullets.map(([prefix, highlight, suffix], bi) => (
							<li
								key={bi}
								className="grid grid-cols-[auto_1fr] gap-3 bg-[var(--ret-bg)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--ret-text)]"
							>
								<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
									{String(bi + 1).padStart(2, "0")}
								</span>
								<span>
									{prefix}
									<code className="bg-[var(--ret-surface)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ret-text)]">
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
							Backed by
						</span>
						{step.poweredBy.map((p) => (
							<span
								key={p.name}
								className="inline-flex min-h-8 items-center gap-1.5 border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2.5 py-1"
							>
								{p.kind === "logo" ? (
									<Logo
										mark={p.mark}
										size={14}
										tone={p.mark === "nous" || p.mark === "openclaw" ? "native" : undefined}
									/>
								) : (
									<ServiceIcon slug={p.slug} size={14} tone="color" />
								)}
								<span className="text-[11px] font-medium text-[var(--ret-text)]">
									{p.name}
								</span>
							</span>
						))}
					</div>
				)}
			</div>

			{/* Transparent diagram + concrete readout */}
			<div className="grid min-h-[440px] gap-px border-l border-[var(--ret-border)] bg-[var(--ret-border)] md:min-h-0 lg:grid-rows-[0.54fr_0.46fr]">
				<div className="grid gap-px bg-[var(--ret-border)] lg:grid-cols-[0.86fr_1.14fr]">
					<div className="group relative min-h-[230px] overflow-hidden bg-[var(--ret-bg)]">
						<CircuitArt slug={step.art} variant="fill" fit="cover" />
						<div className="ret-circuit-texture pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-multiply invert dark:opacity-[0.14] dark:mix-blend-screen dark:invert-0" />
						<div className="relative z-10 flex h-full flex-col justify-between p-4 md:p-5">
							<div className="flex items-center justify-between gap-3">
								<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									transparent schematic
								</span>
								<step.Icon className="h-5 w-5 text-[var(--ret-text-muted)]" />
							</div>
							<div className="grid grid-cols-3 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
								{step.metrics.map(([label, value]) => (
									<div key={label} className="bg-[var(--ret-bg)]/90 px-2.5 py-2 backdrop-blur-sm">
										<div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
											{label}
										</div>
										<div className="mt-1 truncate text-[11px] font-medium text-[var(--ret-text)]">
											{value}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
					<div className="bg-[var(--ret-bg)] p-4 md:p-5">
						<div className="grid h-full gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
							<div className="flex items-center justify-between bg-[var(--ret-bg)] px-3 py-2">
								<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									worker recipe
								</span>
								<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
									{step.tab}
								</span>
							</div>
							{step.metrics.map(([label, value, hint]) => (
								<div
									key={label}
									className="grid grid-cols-[0.34fr_0.36fr_0.3fr] bg-[var(--ret-bg)] px-3 py-2.5 text-[12px]"
								>
									<span className="font-mono uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
										{label}
									</span>
									<span className="font-medium text-[var(--ret-text)]">{value}</span>
									<span className="truncate text-right text-[var(--ret-text-dim)]">
										{hint}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
				<div className="bg-[var(--ret-bg)] p-4 md:p-5">
					<div className="h-full min-h-[250px] overflow-hidden border border-[var(--ret-border)] bg-[#0d0d12] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
						<div className="h-full p-4 md:p-5">
							<StepTerminal index={index} />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function WorkflowPillar({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-h-[128px] flex-col justify-end bg-[var(--ret-bg)] p-4 md:p-5">
			<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</div>
			<div className="mt-2 text-[16px] font-semibold tracking-tight text-[var(--ret-text)]">
				{value}
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
		<TerminalShell command="am fleet inspect">
			<TLine dim>Fleet: kevin-fleet</TLine>
			<TLine dim>Workers: 3 active</TLine>
			<TSpacer />
			<TRow label="Worker" value="code-review-01" />
			<TRow label="Status" value="awake" success />
			<TRow label="Runtime" value="hermes (autonomous)" />
			<TRow label="Substrate" value="e2b (sandbox)" />
			<TRow label="Last wake" value="12m ago" />
			<TSpacer />
			<TRow label="Settings" value="runtime + substrate + profiles" />
			<TRow label="Actions" value="wake · sleep · destroy" />
			<TRow label="Storage" value="/home/machine/.agent-machines" />
			<TSpacer />
			<TLine success>✓ Fleet healthy</TLine>
		</TerminalShell>
	);
}

function AgentTerminal() {
	return (
		<TerminalShell command="am runtime list">
			<TLine dim>4 runtimes configured</TLine>
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
			<TLine success>✓ Runtime routes ready</TLine>
		</TerminalShell>
	);
}

function ToolsTerminal() {
	return (
		<TerminalShell command="am loadout show">
			<TLine dim>Loadout: opinionated-default</TLine>
			<TSpacer />
			<TRow label="Built-ins" value={`${HARNESS.rigToolSurfaceCount} tools`} />
			<TRow label="Skills" value={`${HARNESS.skillCount} synced`} />
			<TRow label="MCP servers" value={`${HARNESS.mcpServerCount} catalog entries`} />
			<TRow label="Services" value={`${HARNESS.serviceRouteCount} routes`} />
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
		<TerminalShell command="am substrate list">
			<TLine dim>4 substrate lanes configured</TLine>
			<TSpacer />
			<THeader cols={["Lane", "Type", "Status"]} />
			<TTableRow cols={["e2b", "sandbox", "● active"]} accent={[false, false, true]} />
			<TTableRow cols={["sprites", "persistent", "○ standby"]} />
			<TTableRow cols={["dedalus", "persistent", "○ standby"]} />
			<TTableRow cols={["vercel", "persistent", "○ standby"]} />
			<TSpacer />
			<TLine dim>Filesystem:</TLine>
			<TLine>{"  "}~/.agent-machines/{"    "}runtime state</TLine>
			<TLine>{"  "}skills/{"               "}{HARNESS.skillCount} SKILL.md files</TLine>
			<TLine>{"  "}sessions.db{"           "}FTS5 history</TLine>
			<TSpacer />
			<TLine success>✓ 1 lane active</TLine>
		</TerminalShell>
	);
}

function EnvironmentTerminal() {
	return (
		<TerminalShell command="am env show">
			<TLine>
				Gateway:{"   "}
				<span className="text-[#d2beff]">ai gateway</span> (default)
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
				success && "text-white/80",
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
			<span className={success ? "text-white/80" : "text-white/70"}>
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
						accent?.[i] && "text-white/80",
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

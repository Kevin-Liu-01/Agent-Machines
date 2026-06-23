import type { SVGProps } from "react";

import { Logo, type Mark } from "@/components/Logo";
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
		kicker: "AGENT MACHINES · CONTROL PLANE",
		title: "Configure once, supervise the whole fleet.",
		body: "Setup, lifecycle, terminal, logs, artifacts, usage, and chat all read from the same account objects. The dashboard shows what is configured, running, and saved.",
		Icon: IconPanel,
		bullets: [
			["Route ", "runtime + substrate", " from one account settings model"],
			["Worker lifecycle: ", "wake · sleep · destroy", " (per substrate capability)"],
			["Persistent state in ", "/home/machine/.agent-machines"],
		],
		poweredBy: [
			{ kind: "service", name: "Clerk", slug: "clerk" },
			{ kind: "service", name: "Vercel", slug: "vercel" },
		],
	},
	{
		id: "agent",
		tab: "agent",
		kicker: "AGENT MACHINES · RUNTIME ROUTES",
		title: "Four runtimes, two operation models, one worker.",
		body: "Hermes and OpenClaw run as longer-lived agent routes. Claude Code and Codex run as task CLIs. Each lands inside the same machine record and persistent runtime root.",
		Icon: IconAgent,
		bullets: [
			["Autonomous routes: ", "Hermes · OpenClaw"],
			["Task-driven routes: ", "Claude Code · Codex"],
			["Reusable per-account ", "agent profiles"],
		],
		poweredBy: [
			{ kind: "logo", name: "Nous", mark: "nous" },
			{ kind: "logo", name: "OpenClaw", mark: "openclaw" },
		],
	},
	{
		id: "tools",
		tab: "tools + mcps",
		kicker: "AGENT MACHINES · LOADOUT",
		title: "Skills, MCP servers, CLIs, and plugins — one harness.",
		body: "Loadout is the active stack on a machine: skills, MCPs, service routes, CLIs, plugins, and source entries. Registry is where new entries get added.",
		Icon: IconTools,
		bullets: [
			["", `${HARNESS.skillCount} skills`, " in SKILL.md protocol"],
			["", `${HARNESS.serviceRouteCount} service routes`, " · MCP → CLI → skills"],
			["", `${HARNESS.cliCount}+ CLIs`, " · closed-loop verification"],
			["Custom loadout: ", "skill · tool · mcp · cli · plugin"],
		],
		poweredBy: [{ kind: "logo", name: "Agent Machines", mark: "am" }],
	},
	{
		id: "providers",
		tab: "providers",
		kicker: "AGENT MACHINES · SUBSTRATE ROUTES",
		title: "Four substrate lanes — E2B, Sprites, Dedalus, and Vercel.",
		body: "Each lane implements the same MachineProvider shape. The UI shows only the lifecycle actions and streaming behavior that provider supports.",
		Icon: IconProvider,
		bullets: [
			["", "E2B", " — sandbox with pause/resume"],
			["", "Sprites", " — persistent microVM on Sprites.dev"],
			["", "Dedalus Machines", " — strong default on boot and sleep/wake"],
			["", "Vercel Sandbox", " — persistent microVMs with auto-snapshots"],
		],
		poweredBy: [{ kind: "service", name: "Vercel", slug: "vercel" }],
	},
	{
		id: "env",
		tab: "environment",
		kicker: "AGENT MACHINES · ENVIRONMENT",
		title: "Gateway and env profiles follow every new worker.",
		body: "Gateway modes, named variable sets, and bootstrap presets are account-level objects a new worker inherits on deploy.",
		Icon: IconEnv,
		bullets: [
			["Gateway modes: ", "tunnel · ai gateway · byo"],
			["Named variable sets with ", "env profiles"],
			["Phase-tracked ", "bootstrap", " presets"],
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

/**
 * Per-step circuit-art schematic. White-on-black line art shown as the
 * hero visual of each step's right column (foreground, not a tint), with
 * the live terminal docked below it. Replaces the old off-brand colored
 * gradients now that the system is grayscale.
 */
const STEP_ART: ReadonlyArray<string> = [
	"overview", // dashboard / control plane
	"agents", // runtime routes
	"loadout", // tools + mcps
	"machines", // substrate routes
	"settings", // environment
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
					The worker is runtime, substrate, and loadout together.
				</h2>
				<p className="mx-auto mt-4 max-w-[54ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
					The control plane turns account settings into a machine recipe:
					agent runtime, provider lane, model route, environment profile, and
					active tools.
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
								{p.kind === "logo" ? (
									<Logo mark={p.mark} size={14} />
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

			{/* Circuit-art hero + docked terminal */}
			<div className="relative flex min-h-[420px] flex-col overflow-hidden border-l border-[var(--ret-border)] bg-[#09090b] md:min-h-0">
				<div className="relative min-h-[170px] flex-1 overflow-hidden">
					{/* eslint-disable-next-line @next/next/no-img-element -- local white-on-black schematic, shown as the column's hero visual */}
					<img
						src={`/category-art/${STEP_ART[index]}.png`}
						alt=""
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-80 [mask-image:linear-gradient(to_bottom,black,black_72%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black,black_72%,transparent)]"
					/>
					<span className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45 md:left-5 md:top-5">
						{step.tab}
					</span>
				</div>
				<div className="relative z-10 mx-3 mb-3 overflow-hidden rounded-xl border border-white/[0.1] bg-[#0d0d12]/90 backdrop-blur-md md:mx-5 md:mb-5">
					<div className="p-4 md:p-5">
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
			<TLine dim>3 substrate lanes configured</TLine>
			<TSpacer />
			<THeader cols={["Lane", "Type", "Status"]} />
			<TTableRow cols={["e2b", "sandbox", "● active"]} accent={[false, false, true]} />
			<TTableRow cols={["sprites", "persistent", "○ standby"]} />
			<TTableRow cols={["dedalus", "persistent", "○ standby"]} />
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

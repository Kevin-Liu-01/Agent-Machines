import {
	ArrowRight,
	ArrowUpRight,
	CircleDot,
	Database,
	FileCheck2,
	Fingerprint,
	LockKeyhole,
	ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PublicIcon } from "@/components/marketing/PublicIcon";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { HARNESS } from "@/lib/platform/harness";
import type { PublicIconName } from "@/lib/marketing/public-site";

type Capability = {
	title: string;
	description: string;
	meta: string;
	href: string;
	icon: PublicIconName;
	dashboardId: string;
};

type CapabilityGroup = {
	id: string;
	number: string;
	title: string;
	description: string;
	capabilities: ReadonlyArray<Capability>;
};

export const CAPABILITY_GROUPS: ReadonlyArray<CapabilityGroup> = [
	{
		id: "compose",
		number: "01",
		title: "Compose",
		description: "Define the whole worker, not an empty sandbox.",
		capabilities: [
			{
				title: "Worker recipes",
				description: "Save runtime, model path, memory, loadout, schedules, and provider intent as a specialist template.",
				meta: "one declarative Worker",
				href: "/agents",
				icon: "bot",
				dashboardId: "agent-templates",
			},
			{
				title: "Runtime switchboard",
				description: "Launch Hermes, OpenClaw computer use, Claude Code, or Codex without changing the control surface.",
				meta: `${HARNESS.agentRuntimeCount} agent runtimes`,
				href: "/agents",
				icon: "route",
				dashboardId: "provider-routing",
			},
			{
				title: "Sandbox switchboard",
				description: "Place or fail over the same worker across E2B, Sprites, Dedalus, and Vercel Sandbox.",
				meta: `${HARNESS.providersLive.length} lanes · primary + backups`,
				href: "/product/lifecycle",
				icon: "server",
				dashboardId: "provider-routing",
			},
			{
				title: "Model paths",
				description: "Use Vercel AI Gateway, OpenRouter, native keys, or a custom OpenAI-compatible endpoint.",
				meta: "BYOK · server-side secrets",
				href: "/product/model-routing",
				icon: "boxes",
				dashboardId: "model-paths",
			},
		],
	},
	{
		id: "operate",
		number: "02",
		title: "Operate",
		description: "Keep long-running workers converged through failure and change.",
		capabilities: [
			{
				title: "Declarative lifecycle",
				description: "Provision, bootstrap, wake, sleep, repair, and delete through one reconciler.",
				meta: "desired state → observed state",
				href: "/product/lifecycle",
				icon: "activity",
				dashboardId: "machines",
			},
			{
				title: "Cold starts and auto-wake",
				description: "Pause compute where supported, then resume the worker from persistent state on demand.",
				meta: "provider pause and resume",
				href: "/product/persistent-machines",
				icon: "zap",
				dashboardId: "machines",
			},
			{
				title: "Cron jobs",
				description: "Bind recurring prompts and commands to a worker with durable schedules and run history.",
				meta: "scheduled dispatch",
				href: "/docs",
				icon: "clock",
				dashboardId: "cron",
			},
			{
				title: "Live provider migration",
				description: "Drain managed work, copy durable state, cut over providers, and preserve worker identity.",
				meta: "drain · transfer · cutover",
				href: "/product/lifecycle",
				icon: "git-branch",
				dashboardId: "migration",
			},
		],
	},
	{
		id: "work",
		number: "03",
		title: "Work live",
		description: "Use the real tools on the remote machine from a browser tab.",
		capabilities: [
			{
				title: "Browser Agent Console",
				description: "Attach to the real agent CLI and full-screen TUI through a reconnectable worker-owned PTY.",
				meta: "tmux · WebSocket · fallback",
				href: "/product/persistent-machines",
				icon: "terminal",
				dashboardId: "terminal",
			},
			{
				title: "Chat and streaming commands",
				description: "Send prompts or one-shot work and watch stdout, stderr, bootstrap, and agent events live.",
				meta: "native stream where available",
				href: "/product/api",
				icon: "code",
				dashboardId: "console",
			},
			{
				title: "Logs and sessions",
				description: "Inspect machine logs, saved conversations, activity, runtime state, and command history.",
				meta: "live and durable history",
				href: "/product/api",
				icon: "message",
				dashboardId: "sessions",
			},
			{
				title: "Artifacts and machine view",
				description: "Keep reports, screenshots, files, and runtime introspection beside the worker that made them.",
				meta: "outputs stay inspectable",
				href: "/product/snapshots-volumes",
				icon: "file",
				dashboardId: "artifacts",
			},
		],
	},
	{
		id: "extend",
		number: "04",
		title: "Extend",
		description: "Give workers an owned, portable harness that compounds.",
		capabilities: [
			{
				title: "Skills",
				description: "Install versioned SKILL.md procedures that survive beyond one chat or one provider.",
				meta: `${HARNESS.skillCount} synced skills`,
				href: "/registry",
				icon: "book",
				dashboardId: "skills",
			},
			{
				title: "MCP and service lanes",
				description: "Wire credential-gated MCP servers, ranked service routes, and optional Cursor delegation.",
				meta: `${HARNESS.mcpServerCount} MCP servers · ${HARNESS.serviceRouteCount} lanes`,
				href: "/registry",
				icon: "braces",
				dashboardId: "mcps",
			},
			{
				title: "Install registry",
				description: "Search the MCP registry, skills.sh, npm, Cursor plugins, GitHub, and URL manifests.",
				meta: "2,595 audited items",
				href: "/registry",
				icon: "search",
				dashboardId: "registry",
			},
			{
				title: "Memory and loadouts",
				description: "Move persona, rules, agent docs, skills, MCPs, and CLIs between runtimes as a bundle.",
				meta: "portable worker context",
				href: "/docs",
				icon: "database",
				dashboardId: "loadout",
			},
		],
	},
	{
		id: "observe",
		number: "05",
		title: "Observe",
		description: "Supervise the fleet and choose lanes with evidence.",
		capabilities: [
			{
				title: "Fleet supervision",
				description: "See every machine and Worker, its runtime, provider, state, loadout, and recent activity.",
				meta: "one operator dashboard",
				href: "/product/api",
				icon: "layers",
				dashboardId: "machines",
			},
			{
				title: "Usage and activity",
				description: "Track awake time, CPU, memory, storage, run outcomes, and lifecycle transitions.",
				meta: "machine and fleet views",
				href: "/product/api",
				icon: "bar-chart",
				dashboardId: "usage",
			},
			{
				title: "Provider benchmarks",
				description: "Compare boot, resume, command latency, compute, and I/O across substrate lanes.",
				meta: "measure before routing",
				href: "/product/lifecycle",
				icon: "cpu",
				dashboardId: "benchmarks",
			},
			{
				title: "SDK, API, and CLI",
				description: "Drive the same Worker model from the dashboard, TypeScript, REST, or another agent.",
				meta: "human and agent control",
				href: "/api-reference",
				icon: "braces",
				dashboardId: "api-access",
			},
		],
	},
	{
		id: "protect",
		number: "06",
		title: "Persist and protect",
		description: "Keep state durable and infrastructure differences explicit.",
		capabilities: [
			{
				title: "Persistent worker state",
				description: "Keep runtime files, sessions, schedules, memory, and outputs on the worker volume.",
				meta: "~/.agent-machines",
				href: "/product/persistent-machines",
				icon: "hard-drive",
				dashboardId: "memory",
			},
			{
				title: "Scoped credentials",
				description: "Validate provider and model keys before launch and keep raw secrets off the browser.",
				meta: "credential gate · BYOK",
				href: "/product/isolation",
				icon: "shield",
				dashboardId: "model-paths",
			},
			{
				title: "Durable operation journal",
				description: "Record lifecycle intent, lease reconciler work, and safely retry failed operations.",
				meta: "idempotent recovery",
				href: "/product/lifecycle",
				icon: "activity",
				dashboardId: "machines",
			},
			{
				title: "Provider persistence",
				description: "Report whether a lane uses memory snapshots, filesystem checkpoints, or always-on disk, and expose sleep and wake only where supported.",
				meta: "capability-gated checkpoints",
				href: "/product/snapshots-volumes",
				icon: "git-branch",
				dashboardId: "machines",
			},
		],
	},
];

const SUMMARY = [
	{ label: "runtimes", value: String(HARNESS.agentRuntimeCount) },
	{ label: "providers", value: String(HARNESS.providersLive.length) },
	{ label: "skills", value: String(HARNESS.skillCount) },
	{ label: "MCP servers", value: String(HARNESS.mcpServerCount) },
] as const;

export function CapabilityAtlas() {
	return (
		<div id="loadout" className="scroll-mt-[72px] border-y border-[var(--ret-border)]/60">
			<header className="grid gap-px bg-[var(--ret-border)]/45 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.48fr)]">
				<div className="bg-[var(--ret-bg)] px-5 py-8 md:px-8 md:py-10">
					<ReticleLabel>THE WHOLE SYSTEM</ReticleLabel>
					<h2 className="ret-display mt-3 max-w-[17ch] text-3xl md:text-5xl">
						Every control around the Worker.
					</h2>
					<p className="mt-5 max-w-[66ch] text-[14px] leading-relaxed text-[var(--ret-text-dim)]">
						Compose the job, operate the machine, work in the live runtime, add abilities,
						measure results, and protect durable state. Each board below maps to a working
						dashboard surface.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-px bg-[var(--ret-border)]/45">
					{SUMMARY.map((item) => (
						<div key={item.label} className="flex min-h-28 flex-col justify-end bg-[var(--ret-bg)] p-5">
							<strong className="ret-display text-3xl text-[var(--ret-text)]">{item.value}</strong>
							<span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
								{item.label}
							</span>
						</div>
					))}
				</div>
			</header>

			<div className="bg-[var(--ret-bg)]">
				{CAPABILITY_GROUPS.map((group) => (
					<section
						key={group.id}
						aria-labelledby={`capability-${group.id}`}
						className="grid border-t border-[var(--ret-border)]/55 first:border-t-0 xl:grid-cols-12"
					>
						<div className="relative flex min-h-[260px] flex-col overflow-hidden bg-[var(--ret-bg-soft)]/35 px-5 py-7 md:px-6 md:py-8 xl:col-span-3 xl:min-h-0">
							<span className="pointer-events-none absolute bottom-3 right-5 text-[52px] font-light leading-none tracking-[-0.08em] text-[var(--ret-text-muted)] opacity-[0.16]" aria-hidden="true">
								{group.number}
							</span>
							<div className="relative z-10">
								<span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									Workflow stage
								</span>
								<h3 id={`capability-${group.id}`} className="mt-4 text-xl font-semibold tracking-tight text-[var(--ret-text)] md:text-2xl">
									{group.title}
								</h3>
								<p className="mt-2 max-w-[34ch] text-[12.5px] leading-relaxed text-[var(--ret-text-dim)]">
									{group.description}
								</p>
							</div>
							<p className="relative z-10 mt-auto max-w-max pt-8 text-[10px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
								Dashboard surface
							</p>
						</div>

						<CapabilityFeature group={group} capability={group.capabilities[0]} />

						<div className="grid gap-px bg-[var(--ret-border)]/35 md:grid-cols-3 xl:col-span-3 xl:grid-cols-1 xl:border-l xl:border-[var(--ret-border)]/45">
							{group.capabilities.slice(1).map((capability) => (
								<CapabilityCompact key={capability.title} capability={capability} />
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}

function CapabilityFeature({
	group,
	capability,
}: {
	group: CapabilityGroup;
	capability: Capability;
}) {
	return (
		<Link
			href={capability.href}
			className="group flex min-h-[380px] flex-col bg-[var(--ret-bg)] p-5 transition-colors duration-300 [transition-timing-function:var(--ret-ease-out)] hover:bg-[var(--ret-surface)] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)] focus-visible:outline-offset-[-2px] md:p-7 xl:col-span-6 xl:border-l xl:border-[var(--ret-border)]/45"
		>
			<div className="flex items-start gap-4">
				<span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--ret-border)]/65 bg-[var(--ret-bg-soft)]/45 text-[var(--ret-text-dim)] transition-colors duration-300 [transition-timing-function:var(--ret-ease-out)] group-hover:border-[var(--ret-border-hover)] group-hover:text-[var(--ret-text)]">
					<PublicIcon name={capability.icon} className="h-4 w-4" />
				</span>
				<div className="min-w-0 flex-1">
					<h4 className="text-xl font-semibold tracking-tight text-[var(--ret-text)]">
						{capability.title}
					</h4>
					<p className="mt-1.5 max-w-[58ch] text-[12.5px] leading-relaxed text-[var(--ret-text-dim)]">
						{capability.description}
					</p>
				</div>
				<ArrowUpRight className="h-3.5 w-3.5 text-[var(--ret-text-muted)] transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ret-purple)]" aria-hidden="true" />
			</div>
			<div className="mt-6 flex-1">
				<CapabilityIllustration id={group.id} />
			</div>
			<div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--ret-border)]/55 pt-4">
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					{capability.meta}
				</span>
				<span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-purple)]">
					Open <ArrowRight className="h-3 w-3" />
				</span>
			</div>
		</Link>
	);
}

function CapabilityCompact({ capability }: { capability: Capability }) {
	return (
		<Link
			href={capability.href}
			className="group flex min-h-[126px] flex-col bg-[var(--ret-bg)] p-4 transition-colors duration-300 [transition-timing-function:var(--ret-ease-out)] hover:bg-[var(--ret-surface)] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)] focus-visible:outline-offset-[-2px]"
		>
			<div className="flex items-start gap-3">
				<span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--ret-border)]/55 bg-[var(--ret-bg-soft)]/35 text-[var(--ret-purple)] transition-colors duration-300 [transition-timing-function:var(--ret-ease-out)] group-hover:border-[var(--ret-border-hover)]">
					<PublicIcon name={capability.icon} className="h-3.5 w-3.5" />
				</span>
				<div className="min-w-0 flex-1">
					<h4 className="text-[13px] font-semibold tracking-tight text-[var(--ret-text)]">
						{capability.title}
					</h4>
					<p className="mt-1.5 line-clamp-2 text-[10.5px] leading-relaxed text-[var(--ret-text-dim)]">
						{capability.description}
					</p>
				</div>
				<ArrowUpRight className="h-3.5 w-3.5 text-[var(--ret-text-muted)] transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ret-purple)]" aria-hidden="true" />
			</div>
			<span className="mt-auto pt-3 font-mono text-[9px] uppercase tracking-[0.13em] text-[var(--ret-text-muted)]">
				{capability.meta}
			</span>
		</Link>
	);
}

function CapabilityIllustration({ id }: { id: string }) {
	switch (id) {
		case "compose":
			return <ComposeDiagram />;
		case "operate":
			return <OperateDiagram />;
		case "work":
			return <LiveWorkDiagram />;
		case "extend":
			return <ExtendDiagram />;
		case "observe":
			return <ObserveDiagram />;
		default:
			return <ProtectDiagram />;
	}
}

function DiagramFrame({ children }: { children: ReactNode }) {
	return (
		<div className="relative h-full min-h-36 overflow-hidden border border-[var(--ret-border)]/50 bg-[var(--ret-bg-soft)]/35 p-4">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.22]"
				style={{
					backgroundImage:
						"linear-gradient(var(--ret-border) 1px, transparent 1px), linear-gradient(90deg, var(--ret-border) 1px, transparent 1px)",
					backgroundSize: "32px 32px",
				}}
			/>
			<div className="relative h-full">{children}</div>
		</div>
	);
}

function ComposeDiagram() {
	return (
		<DiagramFrame>
			<div className="grid h-full items-center gap-3 sm:grid-cols-[1fr_32px_1fr]">
				<div className="grid grid-cols-2 gap-1.5">
					{["role", "memory", "tools", "schedule"].map((item) => (
						<span key={item} className="border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] px-2 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ret-text-dim)]">
							{item}
						</span>
					))}
				</div>
				<ArrowRight className="mx-auto hidden h-4 w-4 text-[var(--ret-purple)] sm:block" />
				<div className="border border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] p-4">
					<div className="flex items-center gap-2">
						<Fingerprint className="h-4 w-4 text-[var(--ret-purple)]" strokeWidth={1.5} />
						<strong className="text-[12px] text-[var(--ret-text)]">Worker recipe</strong>
					</div>
					<p className="mt-3 font-mono text-[9px] uppercase tracking-[0.13em] text-[var(--ret-text-dim)]">versioned · inspectable · portable</p>
				</div>
			</div>
		</DiagramFrame>
	);
}

function OperateDiagram() {
	const states = ["requested", "provisioning", "ready", "sleeping", "ready"];
	return (
		<DiagramFrame>
			<div className="flex h-full flex-col justify-center">
				<div className="flex items-center justify-between gap-1">
					{states.map((state, index) => (
						<div key={`${state}-${index}`} className="flex min-w-0 flex-1 items-center gap-1">
							<div className="min-w-0 flex-1 border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] px-2 py-3 text-center">
								<CircleDot className={`mx-auto h-3.5 w-3.5 ${state === "ready" ? "text-[var(--ret-green)]" : "text-[var(--ret-purple)]"}`} />
								<span className="mt-2 block truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ret-text-dim)]">{state}</span>
							</div>
							{index < states.length - 1 ? <ArrowRight className="h-3 w-3 shrink-0 text-[var(--ret-text-muted)]" /> : null}
						</div>
					))}
				</div>
				<p className="mt-4 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">desired state is reconciled until observed state matches</p>
			</div>
		</DiagramFrame>
	);
}

function LiveWorkDiagram() {
	return (
		<DiagramFrame>
			<div className="h-full border border-[var(--ret-border-hover)] bg-[#08090b] shadow-[0_16px_45px_rgba(0,0,0,0.28)]">
				<div className="flex h-8 items-center justify-between border-b border-white/10 px-3">
					<div className="flex gap-1"><span className="h-1.5 w-1.5 bg-white/30" /><span className="h-1.5 w-1.5 bg-white/20" /><span className="h-1.5 w-1.5 bg-white/10" /></div>
					<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/70">worker PTY · connected</span>
				</div>
				<div className="grid gap-2 p-3 font-mono text-[9px] text-white/75">
					<p><span className="text-emerald-400">worker@machine</span> $ inspect workspace</p>
					<p className="text-white/65">reading memory, tools, files, and current task...</p>
					<p className="text-white/80">Ready. What should I work on?</p>
					<span className="h-3 w-1.5 animate-pulse bg-white/70" />
				</div>
			</div>
		</DiagramFrame>
	);
}

function ExtendDiagram() {
	return (
		<DiagramFrame>
			<div className="relative mx-auto h-44 max-w-md">
				<div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 border border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] px-4 py-3 text-center">
					<Fingerprint className="mx-auto h-4 w-4 text-[var(--ret-purple)]" />
					<strong className="mt-1 block text-[11px] text-[var(--ret-text)]">Worker</strong>
				</div>
				<div className="absolute inset-6 rounded-[50%] border border-dashed border-[var(--ret-border-hover)]" />
				{[
					["Skills", "left-2 top-5"],
					["MCP", "right-2 top-5"],
					["CLI", "bottom-5 left-7"],
					["Memory", "bottom-5 right-7"],
				].map(([label, position]) => (
					<span key={label} className={`absolute ${position} border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ret-text-dim)]`}>
						{label}
					</span>
				))}
			</div>
		</DiagramFrame>
	);
}

function ObserveDiagram() {
	return (
		<DiagramFrame>
			<div className="grid h-full gap-2 sm:grid-cols-[1.4fr_0.6fr]">
				<div className="border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] p-3">
					<div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">runtime latency</span><span className="text-[10px] text-[var(--ret-green)]">healthy</span></div>
					<svg viewBox="0 0 360 100" className="mt-3 h-24 w-full" role="img" aria-label="Runtime latency chart">
						<path d="M0 82H360M0 50H360M0 18H360" stroke="var(--ret-border)" strokeWidth="1" />
						<path d="M0 70 C35 64,55 78,88 60 S140 42,175 55 S230 74,270 36 S330 48,360 24" fill="none" stroke="var(--ret-purple)" strokeWidth="2" />
						<path d="M0 76 C45 72,70 80,112 68 S180 70,225 54 S292 58,360 44" fill="none" stroke="var(--ret-green)" strokeWidth="1.5" opacity="0.75" />
					</svg>
				</div>
				<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-1">
					{[["P50", "tracked"], ["outcomes", "recorded"]].map(([label, value]) => (
						<div key={label} className="flex flex-col justify-end border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] p-3">
							<strong className="text-lg text-[var(--ret-text)]">{value}</strong>
							<span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">{label}</span>
						</div>
					))}
				</div>
			</div>
		</DiagramFrame>
	);
}

function ProtectDiagram() {
	return (
		<DiagramFrame>
			<div className="grid h-full items-center gap-3 sm:grid-cols-[1fr_72px_1fr]">
				<div className="grid gap-1.5">
					{[
						[Database, "persistent volume"],
						[FileCheck2, "operation journal"],
						[LockKeyhole, "scoped credentials"],
					].map(([Icon, label]) => {
						const ItemIcon = Icon as typeof Database;
						return <div key={label as string} className="flex items-center gap-2 border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] px-3 py-2"><ItemIcon className="h-3.5 w-3.5 text-[var(--ret-purple)]" /><span className="text-[9px] text-[var(--ret-text-dim)]">{label as string}</span></div>;
					})}
				</div>
				<div className="flex flex-col items-center gap-2"><ShieldCheck className="h-8 w-8 text-[var(--ret-green)]" strokeWidth={1.3} /><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ret-green)]">verified</span></div>
				<div className="border border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] p-4 text-center">
					<Fingerprint className="mx-auto h-5 w-5 text-[var(--ret-purple)]" />
					<strong className="mt-2 block text-[11px] text-[var(--ret-text)]">Worker state</strong>
					<span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ret-text-muted)]">recoverable</span>
				</div>
			</div>
		</DiagramFrame>
	);
}

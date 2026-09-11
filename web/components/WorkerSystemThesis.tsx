import {
	ArrowRight,
	BookOpenCheck,
	BrainCircuit,
	BriefcaseBusiness,
	Cable,
	Clock3,
	Cog,
	FileCheck2,
	Fingerprint,
	FolderKanban,
	History,
	KeyRound,
	PlugZap,
	Route,
	Server,
	ShieldCheck,
	TerminalSquare,
	Wrench,
	type LucideIcon,
} from "@/components/ui/icons";
import Link from "next/link";

import { Logo, type Mark } from "@/components/Logo";
import { WorkerGearMotion } from "@/components/WorkerGearMotion";
import { WorkerGearWheel } from "@/components/WorkerGearWheel";
import { cn } from "@/lib/cn";
import { LANDING_BODY, LANDING_EYEBROW, LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, LANDING_TITLE } from "@/lib/marketing/layout";
import { COMPONENT_GEARS, CORE_CAPTION_Y, CORE_GEAR, ENGINE_GEARS, ENGINE_HEIGHT, ENGINE_WIDTH, GEAR_MODULE, gearPath, type EngineGear } from "@/lib/marketing/worker-gears";

type MachineOption = { label: string } & (
	| { mark: Mark; icon?: never }
	| { icon: LucideIcon; mark?: never }
);

const MACHINE_PARTS: ReadonlyArray<{
	label: string;
	description: string;
	icon: LucideIcon;
	gear: keyof typeof COMPONENT_GEARS;
	options: ReadonlyArray<MachineOption>;
}> = [
	{
		label: "Agent runtime",
		description: "Choose how it works.",
		icon: TerminalSquare,
		gear: "runtime",
		options: [
			{ mark: "claudecode", label: "Claude Code" },
			{ mark: "codex", label: "Codex" },
			{ mark: "nous", label: "Hermes" },
			{ mark: "openclaw", label: "OpenClaw" },
		],
	},
	{
		label: "Sandbox provider",
		description: "Choose where it runs.",
		icon: Server,
		gear: "sandbox",
		options: [
			{ mark: "daytona", label: "Daytona" },
			{ mark: "e2b", label: "E2B" },
			{ mark: "sprites", label: "Sprites" },
			{ mark: "vercel", label: "Vercel" },
		],
	},
	{
		label: "Models & routing",
		description: "Connect the intelligence.",
		icon: Route,
		gear: "models",
		options: [
			{ mark: "anthropic", label: "Anthropic" },
			{ mark: "openai", label: "OpenAI" },
			{ icon: Route, label: "Routers" },
			{ icon: Cable, label: "Custom API" },
		],
	},
	{
		label: "Tools & skills",
		description: "Give it the right abilities.",
		icon: Wrench,
		gear: "tools",
		options: [
			{ icon: BookOpenCheck, label: "Skills" },
			{ icon: PlugZap, label: "MCP servers" },
			{ icon: TerminalSquare, label: "CLI tools" },
			{ icon: KeyRound, label: "Connections" },
		],
	},
];

const CORE_TRAITS: ReadonlyArray<{ icon: LucideIcon; label: string }> = [
	{ icon: Fingerprint, label: "Identity" },
	{ icon: BrainCircuit, label: "Memory" },
	{ icon: Clock3, label: "Schedules" },
	{ icon: FolderKanban, label: "Files" },
	{ icon: History, label: "History" },
	{ icon: FileCheck2, label: "Evidence" },
];

export function WorkerSystemThesis() {
	return (
		<section
			id="worker-system"
			aria-labelledby="worker-system-heading"
			className={cn("scroll-mt-[72px] border-y border-[var(--ret-border)]/50 bg-[var(--ret-bg)]")}
		>
			<header data-landing-header className={cn(LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, "items-end")}>
				<div>
					<p className={cn(LANDING_EYEBROW)}><Cog className={cn("size-4")} aria-hidden="true" />The Worker system</p>
					<h2 id="worker-system-heading" className={cn(LANDING_TITLE)}>
						Keep the Worker.
						<br />
						<span className={cn("text-[var(--ret-text-dim)]")}>Swap the machinery.</span>
					</h2>
				</div>
				<div>
					<p className={cn(LANDING_BODY, "max-w-[52ch]")}>
						Give your Worker a job. Its identity, memory, files, and schedules
						stay with it as you change the runtime, model, tools, or cloud provider.
					</p>
					<p className={cn("mt-4 flex items-center gap-2 text-sm text-[var(--ret-text)]")}>
						<ShieldCheck className={cn("size-4 shrink-0 text-[var(--ret-green)]")} aria-hidden="true" />
						Your Worker is more than a chat session.
					</p>
				</div>
			</header>

			<figure className={cn(LANDING_INSET, "border-y border-[var(--ret-border)]/40 py-6 lg:py-8")}>
				<div className={cn("mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--ret-text-muted)]")}>
					<span className={cn("flex items-center gap-2")}>
						<Fingerprint className={cn("size-4")} aria-hidden="true" />
						One lasting Worker
					</span>
					<span className={cn("flex items-center gap-2")}>
						<Cog className={cn("size-4")} aria-hidden="true" />
						Four replaceable layers
					</span>
				</div>

				<WorkerGearMotion>
					<p className={cn("mb-3 text-sm text-[var(--ret-text-muted)] lg:hidden")}>Scroll to explore the engine. Every layer connects to your Worker.</p>
					<div role="region" aria-label="Interlocking Worker engine" tabIndex={0} className={cn("overflow-x-auto overscroll-x-contain rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-text)]")}>
						<div className={cn("relative mx-auto min-w-[1000px] max-w-[1040px]")} style={{ aspectRatio: `${ENGINE_WIDTH} / ${ENGINE_HEIGHT}` }}>
							{/* One coordinate system preserves pitch-circle contact at every width.
							    All rotations share a clock and pause state; labels never rotate. */}
							<svg viewBox={`0 0 ${ENGINE_WIDTH} ${ENGINE_HEIGHT}`} className={cn("pointer-events-none absolute inset-0 size-full text-[var(--ret-text-dim)]")} aria-hidden="true">
								{ENGINE_GEARS.map((gear) => <GearWheel key={gear.id} gear={gear} />)}
							</svg>
							<WorkerCore />
							{MACHINE_PARTS.map((part) => <MachinePart key={part.label} part={part} />)}
						</div>
					</div>
				</WorkerGearMotion>

				<figcaption className={cn("mx-auto mt-5 max-w-[1040px]")}>
					<div data-worker-legend className={cn("grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--ret-border)]/40 pt-6 lg:grid-cols-4")}>
						{MACHINE_PARTS.map((part) => <MachinePartCaption key={part.gear} part={part} />)}
					</div>
					<p className={cn("mx-auto mt-6 max-w-[76ch] text-center text-sm leading-6 text-[var(--ret-text-muted)]")}>
						The Worker keeps its saved state; each provider supplies its own capabilities.
						Migration transfers files and restarts managed work—not live process memory.
					</p>
				</figcaption>
			</figure>

			<div className={cn(LANDING_INSET, "grid gap-6 py-8 md:grid-cols-3 md:gap-8")}>
				<WorkflowStep icon={BriefcaseBusiness} title="Give it a responsibility." description="Set the job, connect its tools, and define its permissions." />
				<WorkflowStep icon={Cog} title="Run it on your terms." description="Choose a runtime and provider without rebuilding the Worker." />
				<WorkflowStep icon={FileCheck2} title="Come back to its work." description="Review saved files, logs, and results from the dashboard." />
			</div>
			<footer className={cn(LANDING_INSET, "flex flex-col gap-3 border-t border-[var(--ret-border)]/40 py-5 sm:flex-row sm:items-center sm:justify-between")}>
				<p className={cn("text-sm text-[var(--ret-text-dim)]")}>Start with a specialist. Make it your own.</p>
				<div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2")}>
					<Link href="/docs" className={cn("inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ret-text-dim)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-text)]")}>
						Read the architecture <ArrowRight className={cn("size-4")} aria-hidden="true" />
					</Link>
					<Link href="/agents" className={cn("inline-flex min-h-11 items-center justify-center gap-5 bg-[var(--ret-text)] px-5 py-3 text-sm font-medium text-[var(--ret-bg)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-text)]")}>
						Choose a Worker <ArrowRight className={cn("size-4")} aria-hidden="true" />
					</Link>
				</div>
			</footer>
		</section>
	);
}

function WorkerCore() {
	return (
		<>
			<div className={cn("absolute aspect-square -translate-x-1/2 -translate-y-1/2")} style={{ left: `${CORE_GEAR.x / ENGINE_WIDTH * 100}%`, top: `${CORE_GEAR.y / ENGINE_HEIGHT * 100}%`, width: `${288 / ENGINE_WIDTH * 100}%` }}>
				<div className={cn("absolute inset-0 flex flex-col items-center justify-center rounded-full bg-[var(--ret-bg-soft)] text-center")}>
					<Logo mark="am" size={32} />
					<span className={cn("mt-2 text-xs font-medium text-[var(--ret-text-muted)] sm:mt-3")}>The durable core</span>
					<strong className={cn("mt-1 text-3xl font-semibold leading-none tracking-tight text-[var(--ret-text)] sm:text-4xl")}>Your Worker</strong>
					<div className={cn("mt-3 grid w-[85%] grid-cols-3 gap-x-2 gap-y-2 sm:mt-5 sm:gap-y-3")}>
						{CORE_TRAITS.map(({ icon: Icon, label }) => (
							<span key={label} className={cn("flex flex-col items-center gap-1.5 text-xs text-[var(--ret-text-dim)] sm:text-sm")}>
								<Icon className={cn("size-4")} strokeWidth={1.5} aria-hidden="true" />
								{label}
							</span>
						))}
					</div>
				</div>
			</div>
			<p className={cn("absolute flex -translate-x-1/2 items-center justify-center gap-2 whitespace-nowrap text-sm text-[var(--ret-text-dim)]")} style={{ left: "50%", top: `${CORE_CAPTION_Y / ENGINE_HEIGHT * 100}%` }}>
				<Fingerprint className={cn("size-4 text-[var(--ret-green)]")} aria-hidden="true" />
				Same identity. Saved context.
			</p>
		</>
	);
}

function MachinePart({ part }: { part: (typeof MACHINE_PARTS)[number] }) {
	const Icon = part.icon;
	const gear = COMPONENT_GEARS[part.gear];
	return (
		<div data-worker-part={part.gear} className={cn("absolute aspect-square -translate-x-1/2 -translate-y-1/2 text-center")} style={{ left: `${gear.x / ENGINE_WIDTH * 100}%`, top: `${gear.y / ENGINE_HEIGHT * 100}%`, width: `${gear.radius * 1.6 / ENGINE_WIDTH * 100}%` }}>
			<div className={cn("absolute inset-0 flex flex-col items-center justify-center rounded-full bg-[var(--ret-bg-soft)]")}>
				<Icon className={cn("mb-2 size-5 text-[var(--ret-text-muted)]")} strokeWidth={1.6} aria-hidden="true" />
				<h3 className={cn("text-base font-semibold tracking-tight text-[var(--ret-text)]")}>{part.label}</h3>
				<div className={cn("mt-3 flex items-center justify-center gap-2")}>
					{part.options.map((option) => (
						<span key={option.label} title={option.label} className={cn("grid size-5 shrink-0 place-items-center text-[var(--ret-text)]")} aria-hidden="true">
							{option.mark ? <Logo mark={option.mark} size={20} /> : option.icon ? <option.icon className={cn("size-5")} strokeWidth={1.5} /> : null}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

function MachinePartCaption({ part }: { part: (typeof MACHINE_PARTS)[number] }) {
	const Icon = part.icon;
	return (
		<div>
			<p className={cn("flex items-center gap-2 text-sm font-medium text-[var(--ret-text)]")}><Icon className={cn("size-4 shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" />{part.label}</p>
			<p className={cn("mt-2 text-sm text-[var(--ret-text-dim)]")}>{part.description}</p>
			<ul className={cn("mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[13px] leading-5 text-[var(--ret-text-muted)]")}>
				{part.options.map((option) => <li key={option.label}>{option.label}</li>)}
			</ul>
		</div>
	);
}

function GearWheel({ gear }: { gear: EngineGear }) {
	if (gear.kind === "idler") return <g opacity={0.7}><WorkerGearWheel gear={gear} /></g>;
	const root = gear.radius - GEAR_MODULE * 1.25;
	return (
		<g transform={`translate(${gear.x} ${gear.y})`}>
			<g transform={`rotate(${gear.phaseRadians * 180 / Math.PI})`}>
				<g
					data-worker-gear={gear.kind}
					data-gear-id={gear.id}
					data-gear-teeth={gear.teeth}
					className={cn("origin-[0_0] [transform-box:view-box] motion-safe:animate-spin group-data-[gear-motion=paused]/engine:[animation-play-state:paused]")}
					style={{ animationDuration: `${gear.period}s`, animationDirection: gear.direction === 1 ? "normal" : "reverse" }}
				>
					<path data-gear-profile="trapezoidal" d={gearPath(gear.teeth)} fill="var(--ret-bg-soft)" stroke="var(--ret-border-hover)" strokeWidth="1" strokeLinejoin="miter" />
					<circle r={root - 3} fill="var(--ret-bg)" stroke="currentColor" strokeWidth="1.4" />
					<circle r={root * 0.88} fill="none" stroke="var(--ret-border)" strokeWidth="4" />
					<circle r={root * 0.81} fill="none" stroke="var(--ret-border-hover)" strokeWidth="0.8" strokeDasharray="2 8" />
					{[45, 135, 225, 315].map(angle => <circle key={angle} cx={root * 0.93} cy="0" r="2.5" transform={`rotate(${angle})`} fill="var(--ret-text-muted)" />)}
				</g>
			</g>
		</g>
	);
}

function WorkflowStep({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
	return (
		<div className={cn("flex items-start gap-3")}>
			<Icon className={cn("mt-0.5 size-5 shrink-0 text-[var(--ret-text-muted)]")} strokeWidth={1.5} aria-hidden="true" />
			<div>
				<h3 className={cn("text-lg font-semibold text-[var(--ret-text)]")}>{title}</h3>
				<p className={cn("mt-2 max-w-[34ch] text-base leading-7 text-[var(--ret-text-dim)]")}>{description}</p>
			</div>
		</div>
	);
}

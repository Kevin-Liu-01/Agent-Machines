import {
	ArrowRight,
	BookOpenCheck,
	BrainCircuit,
	BriefcaseBusiness,
	Cable,
	Check,
	Clock3,
	Fingerprint,
	FolderKanban,
	Gauge,
	History,
	KeyRound,
	PlugZap,
	Route,
	Server,
	ShieldCheck,
	TerminalSquare,
	Wrench,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Logo, type Mark } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

const MACHINE_PARTS = [
	{
		kind: "runtime" as const,
		label: "Runtime",
		detail: "4 swappable harnesses",
		cx: 474,
		cy: 208,
		rotation: "normal" as const,
	},
	{
		kind: "sandbox" as const,
		label: "Sandbox",
		detail: "4 portable substrates",
		cx: 474,
		cy: 532,
		rotation: "reverse" as const,
	},
	{
		kind: "model" as const,
		label: "Model path",
		detail: "native or routed",
		cx: 966,
		cy: 208,
		rotation: "reverse" as const,
	},
	{
		kind: "abilities" as const,
		label: "Abilities",
		detail: "skills · MCP · CLI · tools",
		cx: 966,
		cy: 532,
		rotation: "normal" as const,
	},
] as const;

export function WorkerSystemThesis() {
	return (
		<section
			id="worker-system"
			className="scroll-mt-[72px] overflow-hidden border-y border-[var(--ret-border)] bg-[var(--ret-bg)]"
		>
			<header className="grid gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[minmax(0,0.58fr)_minmax(360px,0.42fr)]">
				<div className="bg-[var(--ret-bg)] px-5 py-9 md:px-8 md:py-11">
					<ReticleLabel>THE WORKER MACHINE</ReticleLabel>
					<h2 className="ret-display mt-4 max-w-[18ch] text-4xl leading-[0.98] md:text-6xl">
						One durable core. Every moving part can change.
					</h2>
				</div>
				<div className="flex flex-col justify-between gap-7 bg-[var(--ret-bg-soft)] px-5 py-8 md:px-8 md:py-10">
					<p className="max-w-[58ch] text-[14px] leading-7 text-[var(--ret-text-dim)]">
						A responsibility enters once. The Worker keeps its identity, memory, schedule,
						files, and evidence while the runtime, model, tools, and machine turn around it.
					</p>
					<div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
						<span className="flex items-center gap-1.5"><Fingerprint className="h-3 w-3 text-[var(--ret-purple)]" />core retained</span>
						<span className="flex items-center gap-1.5"><Gauge className="h-3 w-3 text-[var(--ret-purple)]" />parts replaceable</span>
						<span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-[var(--ret-green)]" />work verified</span>
					</div>
				</div>
			</header>

			<DesktopWorkerMachine />
			<MobileWorkerMachine />

			<footer className="grid gap-px border-t border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[minmax(0,1fr)_auto]">
				<div className="grid gap-px bg-[var(--ret-border)] sm:grid-cols-3">
					<MachineReadout index="01" label="Responsibility" value="defines the work" />
					<MachineReadout index="02" label="Worker" value="keeps identity + state" />
					<MachineReadout index="03" label="Machinery" value="routes and changes" />
				</div>
				<div className="flex min-w-[310px] items-center gap-2 bg-[var(--ret-bg-soft)] p-4">
					<Link
						href="/agents"
						className="group flex flex-1 items-center justify-between border border-[var(--ret-text)] bg-[var(--ret-text)] px-3 py-3 text-[11px] font-medium text-[var(--ret-bg)]"
					>
						Choose a Worker
						<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
					</Link>
					<Link
						href="/docs"
						aria-label="Read the Worker architecture"
						className="flex h-[42px] w-[42px] items-center justify-center border border-[var(--ret-border-hover)] text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]"
					>
						<History className="h-4 w-4" />
					</Link>
				</div>
			</footer>
		</section>
	);
}

function DesktopWorkerMachine() {
	return (
		<figure className="relative hidden min-h-[680px] overflow-hidden bg-[var(--ret-bg)] md:block">
			<svg
				viewBox="0 0 1440 740"
				role="img"
				aria-labelledby="worker-machine-title worker-machine-description"
				className="h-auto w-full"
			>
				<title id="worker-machine-title">The Agent Machines Worker mechanism</title>
				<desc id="worker-machine-description">
					A responsibility enters a durable Worker gear. Replaceable runtime, model,
					sandbox, and ability gears drive it while verified work exits on the right.
				</desc>
				<defs>
					<pattern id="machine-grid" width="42" height="42" patternUnits="userSpaceOnUse">
						<path d="M42 0H0V42" fill="none" stroke="var(--ret-border)" strokeWidth="1" opacity="0.44" />
					</pattern>
					<radialGradient id="worker-core" cx="50%" cy="42%" r="65%">
						<stop offset="0" stopColor="var(--ret-purple)" stopOpacity="0.22" />
						<stop offset="0.58" stopColor="var(--ret-purple)" stopOpacity="0.07" />
						<stop offset="1" stopColor="var(--ret-bg)" stopOpacity="0" />
					</radialGradient>
					<filter id="machine-glow" x="-70%" y="-70%" width="240%" height="240%">
						<feGaussianBlur stdDeviation="18" />
					</filter>
					<marker id="machine-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
						<path d="M0 0L8 4L0 8Z" fill="var(--ret-purple)" />
					</marker>
				</defs>

				<rect width="1440" height="740" fill="url(#machine-grid)" />
				<rect width="1440" height="740" fill="var(--ret-bg)" opacity="0.2" />

				<g fill="none" stroke="var(--ret-border-hover)" strokeWidth="1.4">
					<path d="M90 370H286" markerEnd="url(#machine-arrow)" />
					<path d="M320 370H390" strokeDasharray="5 7" />
					<path d="M720 148V78" strokeDasharray="5 7" />
					<path d="M720 592V662" strokeDasharray="5 7" />
					<path d="M1058 370H1190" markerEnd="url(#machine-arrow)" />
					<path d="M382 282C408 260 423 244 438 227" strokeDasharray="5 7" />
					<path d="M382 458C408 480 423 496 438 513" strokeDasharray="5 7" />
					<path d="M1058 282C1032 260 1017 244 1002 227" strokeDasharray="5 7" />
					<path d="M1058 458C1032 480 1017 496 1002 513" strokeDasharray="5 7" />
				</g>

				<g fontFamily="var(--font-mono)">
					<text x="720" y="54" fill="var(--ret-text-muted)" fontSize="10" textAnchor="middle" letterSpacing="2.4">DURABLE CONTROL OBJECT</text>
					<text x="720" y="694" fill="var(--ret-text-muted)" fontSize="10" textAnchor="middle" letterSpacing="2.1">DEFINE → PLACE → RUN → VERIFY → REPEAT</text>
				</g>
				<foreignObject x="90" y="316" width="194" height="108">
					<div className="flex h-full items-center gap-3 text-[var(--ret-text)]">
						<span className="grid size-10 shrink-0 place-items-center border border-[var(--ret-purple)] bg-[var(--ret-bg-soft)] text-[var(--ret-purple)] shadow-[0_0_24px_var(--ret-purple-glow)]">
							<BriefcaseBusiness className="size-5" strokeWidth={1.5} aria-hidden="true" />
						</span>
						<span className="min-w-0">
							<span className="block font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">Input 01</span>
							<strong className="mt-1 block text-[15px] font-semibold uppercase">Responsibility</strong>
							<span className="mt-1.5 block font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ret-text-dim)]">Job · budget · permissions</span>
						</span>
					</div>
				</foreignObject>

				<circle cx="720" cy="370" r="236" fill="var(--ret-purple)" opacity="0.09" filter="url(#machine-glow)" />
				<GearWheel cx={720} cy={370} radius={188} teeth={34} accent className="motion-safe:animate-[spin_80s_linear_infinite]" />
				<circle cx="720" cy="370" r="131" fill="url(#worker-core)" stroke="var(--ret-purple)" strokeWidth="1.8" />
				<circle cx="720" cy="370" r="102" fill="var(--ret-bg-soft)" stroke="var(--ret-border-hover)" strokeWidth="1.3" />
				<foreignObject x="616" y="266" width="208" height="208">
					<WorkerCoreContent />
				</foreignObject>

				{MACHINE_PARTS.map((part) => (
					<g key={part.label}>
						<GearWheel
							cx={part.cx}
							cy={part.cy}
							radius={98}
							teeth={22}
							className={
								part.rotation === "reverse"
									? "motion-safe:animate-[spin_46s_linear_infinite] motion-safe:[animation-direction:reverse]"
									: "motion-safe:animate-[spin_46s_linear_infinite]"
							}
						/>
						<circle cx={part.cx} cy={part.cy} r="66" fill="var(--ret-bg-soft)" stroke="var(--ret-border-hover)" />
						<foreignObject x={part.cx - 70} y={part.cy - 58} width="140" height="116">
							<MachinePartContent part={part} />
						</foreignObject>
					</g>
				))}

				<GearWheel cx={1244} cy={370} radius={76} teeth={18} accent accentColor="var(--ret-green)" className="motion-safe:animate-[spin_34s_linear_infinite]" />
				<circle cx="1244" cy="370" r="49" fill="var(--ret-bg-soft)" stroke="var(--ret-green)" />
				<foreignObject x="1192" y="318" width="104" height="104">
					<div className="flex h-full flex-col items-center justify-center text-center text-[var(--ret-text)]">
						<span className="grid size-8 place-items-center rounded-full border border-[var(--ret-green)] bg-[color-mix(in_srgb,var(--ret-green)_8%,var(--ret-bg))] text-[var(--ret-green)]">
							<ShieldCheck className="size-4" strokeWidth={1.6} aria-hidden="true" />
						</span>
						<span className="mt-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-green)]">Verified</span>
						<strong className="mt-0.5 text-[13px] font-semibold uppercase">Work</strong>
					</div>
				</foreignObject>
				<g fontFamily="var(--font-mono)" textAnchor="middle">
					<text x="1244" y="266" fill="var(--ret-text-muted)" fontSize="10" letterSpacing="2">OUTPUT 03</text>
					<text x="1244" y="480" fill="var(--ret-text)" fontSize="14" fontWeight="650">WORK CONTINUES</text>
					<text x="1244" y="503" fill="var(--ret-text-dim)" fontSize="8.5" letterSpacing="1">BROWSER CLOSED · PROVIDER CHANGED</text>
				</g>

				<g transform="translate(620 634)">
					<rect width="200" height="34" fill="var(--ret-bg-soft)" stroke="var(--ret-border-hover)" />
					<circle cx="17" cy="17" r="4" fill="var(--ret-green)" />
					<text x="31" y="21" fill="var(--ret-text-dim)" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1.3">WORKER STATE INTACT</text>
				</g>
			</svg>
			<figcaption className="absolute bottom-4 left-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)]">
				<Check className="h-3 w-3 text-[var(--ret-green)]" />
				The core does not belong to any runtime or provider
			</figcaption>
		</figure>
	);
}

const RUNTIME_MARKS: ReadonlyArray<{ mark: Mark; label: string }> = [
	{ mark: "claudecode", label: "Claude Code" },
	{ mark: "codex", label: "Codex CLI" },
	{ mark: "nous", label: "Hermes" },
	{ mark: "openclaw", label: "OpenClaw" },
];

const SANDBOX_MARKS: ReadonlyArray<{ mark: Mark; label: string }> = [
	{ mark: "e2b", label: "E2B" },
	{ mark: "sprites", label: "Sprites" },
	{ mark: "vercel", label: "Vercel Sandbox" },
	{ mark: "dedalus", label: "Dedalus" },
];

const MODEL_PATH_ICONS: ReadonlyArray<{ icon: LucideIcon; label: string }> = [
	{ icon: KeyRound, label: "Native key" },
	{ icon: Route, label: "Router" },
	{ icon: Server, label: "Gateway" },
	{ icon: Cable, label: "Custom endpoint" },
];

const ABILITY_ICONS: ReadonlyArray<{ icon: LucideIcon; label: string }> = [
	{ icon: BookOpenCheck, label: "Skills" },
	{ icon: PlugZap, label: "MCP" },
	{ icon: TerminalSquare, label: "CLI" },
	{ icon: Wrench, label: "Tools" },
];

const CORE_TRAITS: ReadonlyArray<{ icon: LucideIcon; label: string }> = [
	{ icon: Fingerprint, label: "Identity" },
	{ icon: BrainCircuit, label: "Memory" },
	{ icon: Clock3, label: "Schedule" },
	{ icon: FolderKanban, label: "Files" },
	{ icon: History, label: "History" },
	{ icon: ShieldCheck, label: "Evidence" },
];

function WorkerCoreContent() {
	return (
		<div className="flex h-full flex-col items-center justify-center text-center text-[var(--ret-text)]">
			<Logo mark="am" size={29} />
			<span className="mt-2 font-mono text-[8px] uppercase tracking-[0.24em] text-[var(--ret-text-muted)]">
				Durable core
			</span>
			<strong className="mt-0.5 text-[25px] font-bold uppercase leading-none tracking-[-0.03em]">
				Worker
			</strong>
			<div className="mt-4 grid w-[178px] grid-cols-3 gap-px border border-[var(--ret-border-hover)] bg-[var(--ret-border)]">
				{CORE_TRAITS.map(({ icon: Icon, label }) => (
					<span
						key={label}
						className="flex min-h-9 flex-col items-center justify-center gap-1 bg-[var(--ret-bg-soft)] px-1 text-[var(--ret-text-dim)]"
					>
						<Icon className="size-3 text-[var(--ret-purple)]" strokeWidth={1.55} aria-hidden="true" />
						<span className="font-mono text-[6.5px] uppercase tracking-[0.07em]">{label}</span>
					</span>
				))}
			</div>
		</div>
	);
}

function MachinePartContent({
	part,
}: {
	part: (typeof MACHINE_PARTS)[number];
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center text-center text-[var(--ret-text)]">
			<span className="text-[14px] font-semibold">{part.label}</span>
			<div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
				{part.kind === "runtime"
					? RUNTIME_MARKS.map((item) => <MarkChip key={item.mark} {...item} />)
					: null}
				{part.kind === "sandbox"
					? SANDBOX_MARKS.map((item) => <MarkChip key={item.mark} {...item} />)
					: null}
				{part.kind === "model"
					? MODEL_PATH_ICONS.map((item) => <FunctionChip key={item.label} {...item} />)
					: null}
				{part.kind === "abilities"
					? ABILITY_ICONS.map((item) => <FunctionChip key={item.label} {...item} />)
					: null}
			</div>
			<span className="mt-2.5 font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--ret-text-muted)]">
				{part.detail}
			</span>
		</div>
	);
}

function MarkChip({ mark, label }: { mark: Mark; label: string }) {
	return (
		<span
			title={label}
			className="grid size-6 place-items-center border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] text-[var(--ret-text)] shadow-[0_0_12px_color-mix(in_srgb,var(--ret-purple)_7%,transparent)]"
		>
			<Logo mark={mark} size={13} />
		</span>
	);
}

function FunctionChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
	return (
		<span
			title={label}
			className="grid size-6 place-items-center border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] text-[var(--ret-purple)]"
		>
			<Icon className="size-3" strokeWidth={1.6} aria-hidden="true" />
		</span>
	);
}

function GearWheel({
	cx,
	cy,
	radius,
	teeth,
	accent = false,
	accentColor,
	className = "",
}: {
	cx: number;
	cy: number;
	radius: number;
	teeth: number;
	accent?: boolean;
	accentColor?: string;
	className?: string;
}) {
	const toothWidth = Math.max(7, radius * 0.09);
	const toothHeight = Math.max(13, radius * 0.14);
	const activeStroke = accentColor ?? "var(--ret-purple)";
	return (
		<g className={`origin-center [transform-box:fill-box] ${className}`}>
			{Array.from({ length: teeth }, (_, index) => {
				const angle = (360 / teeth) * index;
				return (
					<rect
						key={angle}
						x={cx - toothWidth / 2}
						y={cy - radius - toothHeight * 0.7}
						width={toothWidth}
						height={toothHeight}
						transform={`rotate(${angle} ${cx} ${cy})`}
						fill="var(--ret-bg-soft)"
						stroke={accent ? activeStroke : "var(--ret-border-hover)"}
						strokeWidth="1.2"
					/>
				);
			})}
			<circle
				cx={cx}
				cy={cy}
				r={radius}
				fill="var(--ret-bg)"
				stroke={accent ? activeStroke : "var(--ret-border-hover)"}
				strokeWidth={accent ? 2 : 1.4}
			/>
			<circle cx={cx} cy={cy} r={radius * 0.82} fill="none" stroke="var(--ret-border)" strokeWidth="8" />
			<circle cx={cx} cy={cy} r={radius * 0.68} fill="none" stroke="var(--ret-border-hover)" strokeWidth="1.2" strokeDasharray="4 7" />
		</g>
	);
}

function MobileWorkerMachine() {
	return (
		<figure className="relative overflow-hidden bg-[var(--ret-bg)] px-4 py-8 md:hidden">
			<div
				className="pointer-events-none absolute inset-0 opacity-40"
				style={{
					backgroundImage:
						"linear-gradient(var(--ret-border) 1px, transparent 1px), linear-gradient(90deg, var(--ret-border) 1px, transparent 1px)",
					backgroundSize: "30px 30px",
				}}
			/>
			<div className="relative z-10">
				<div className="mx-auto flex w-fit items-center gap-2 border border-[var(--ret-border-hover)] bg-[var(--ret-bg-soft)] px-3 py-2 text-[var(--ret-text-dim)]">
					<BriefcaseBusiness className="size-3.5 text-[var(--ret-purple)]" strokeWidth={1.5} aria-hidden="true" />
					<span className="font-mono text-[9px] uppercase tracking-[0.15em]">Responsibility in</span>
				</div>
				<div className="mx-auto h-8 w-px bg-[var(--ret-purple)]" />
				<div className="grid grid-cols-2 gap-3">
					{MACHINE_PARTS.slice(0, 2).map((part) => <MobilePart key={part.label} part={part} />)}
				</div>
				<div className="relative mx-auto -my-2 flex aspect-square w-[min(76vw,290px)] items-center justify-center">
					<div
						aria-hidden="true"
						className="absolute inset-0 rounded-full motion-safe:animate-[spin_55s_linear_infinite]"
						style={{
							background:
								"repeating-conic-gradient(var(--ret-purple) 0deg 4deg, transparent 4deg 12deg)",
							maskImage:
								"radial-gradient(circle, transparent 0 64%, black 65% 78%, transparent 79%)",
						}}
					/>
					<div className="absolute inset-[12%] rounded-full border border-[var(--ret-border-hover)] bg-[var(--ret-bg-soft)]" />
					<div className="absolute inset-[24%] rounded-full border border-[var(--ret-purple)] bg-[var(--ret-bg)] shadow-[0_0_55px_var(--ret-purple-glow)]" />
					<div className="relative flex flex-col items-center text-center">
						<Logo mark="am" size={25} />
						<p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">durable core</p>
						<strong className="mt-1 block text-2xl text-[var(--ret-text)]">Worker</strong>
						<div className="mt-2 flex max-w-32 flex-wrap justify-center gap-1 text-[var(--ret-purple)]">
							{CORE_TRAITS.map(({ icon: Icon, label }) => (
								<span key={label} title={label} className="grid size-5 place-items-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
									<Icon className="size-2.5" strokeWidth={1.5} aria-hidden="true" />
								</span>
							))}
						</div>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3">
					{MACHINE_PARTS.slice(2).map((part) => <MobilePart key={part.label} part={part} />)}
				</div>
				<div className="mx-auto h-8 w-px bg-[var(--ret-green)]" />
				<div className="mx-auto flex w-full max-w-xs items-center justify-between border border-[var(--ret-green)] bg-[var(--ret-bg-soft)] px-3 py-3">
					<div>
						<p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ret-green)]">verified output</p>
						<strong className="mt-1 block text-sm text-[var(--ret-text)]">Work continues</strong>
					</div>
					<ShieldCheck className="h-5 w-5 text-[var(--ret-green)]" />
				</div>
			</div>
		</figure>
	);
}

function MobilePart({ part }: { part: (typeof MACHINE_PARTS)[number] }) {
	return (
		<div className="flex min-h-32 flex-col items-center justify-center rounded-full border border-[var(--ret-border-hover)] bg-[var(--ret-bg-soft)] p-2 text-center">
			<MachinePartContent part={part} />
		</div>
	);
}

function MachineReadout({ index, label, value }: { index: string; label: string; value: string }) {
	return (
		<div className="flex min-h-24 items-end justify-between gap-4 bg-[var(--ret-bg)] p-4 md:p-5">
			<div>
				<span className="font-mono text-[9px] tracking-[0.16em] text-[var(--ret-text-muted)]">{index}</span>
				<strong className="mt-2 block text-[13px] text-[var(--ret-text)]">{label}</strong>
			</div>
			<span className="max-w-28 text-right text-[10px] leading-relaxed text-[var(--ret-text-dim)]">{value}</span>
		</div>
	);
}

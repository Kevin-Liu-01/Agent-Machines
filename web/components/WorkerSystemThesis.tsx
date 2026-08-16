import { ArrowRight, Check, Fingerprint, Gauge, History, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { ReticleLabel } from "@/components/reticle/ReticleLabel";

const MACHINE_PARTS = [
	{
		label: "Runtime",
		detail: "Claude · Codex · Hermes · OpenClaw",
		cx: 474,
		cy: 208,
		rotation: "normal" as const,
	},
	{
		label: "Sandbox",
		detail: "E2B · Sprites · Vercel · Dedalus",
		cx: 474,
		cy: 532,
		rotation: "reverse" as const,
	},
	{
		label: "Model path",
		detail: "Native · Router · Gateway · Custom",
		cx: 966,
		cy: 208,
		rotation: "reverse" as const,
	},
	{
		label: "Abilities",
		detail: "Skills · MCP · CLI · Tools",
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
					<MachineReadout index="02" label="Worker" value="retains the world" />
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
					<text x="90" y="340" fill="var(--ret-text-muted)" fontSize="10" letterSpacing="2.4">INPUT 01</text>
					<text x="90" y="362" fill="var(--ret-text)" fontSize="16" fontWeight="650">RESPONSIBILITY</text>
					<text x="90" y="394" fill="var(--ret-text-dim)" fontSize="10" letterSpacing="1.5">JOB · BUDGET · PERMISSIONS</text>
					<text x="720" y="54" fill="var(--ret-text-muted)" fontSize="10" textAnchor="middle" letterSpacing="2.4">DURABLE CONTROL OBJECT</text>
					<text x="720" y="694" fill="var(--ret-text-muted)" fontSize="10" textAnchor="middle" letterSpacing="2.1">DEFINE → PLACE → RUN → VERIFY → REPEAT</text>
				</g>

				<circle cx="720" cy="370" r="236" fill="var(--ret-purple)" opacity="0.09" filter="url(#machine-glow)" />
				<GearWheel cx={720} cy={370} radius={188} teeth={34} accent className="motion-safe:animate-[spin_80s_linear_infinite]" />
				<circle cx="720" cy="370" r="131" fill="url(#worker-core)" stroke="var(--ret-purple)" strokeWidth="1.8" />
				<circle cx="720" cy="370" r="102" fill="var(--ret-bg-soft)" stroke="var(--ret-border-hover)" strokeWidth="1.3" />
				<circle cx="720" cy="370" r="15" fill="var(--ret-purple)" opacity="0.9" />
				<circle cx="720" cy="370" r="5" fill="var(--ret-bg)" />

				<g textAnchor="middle">
					<text x="720" y="328" fill="var(--ret-text-muted)" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="2.5">DURABLE CORE</text>
					<text x="720" y="360" fill="var(--ret-text)" fontFamily="var(--font-sans)" fontSize="28" fontWeight="700">WORKER</text>
					<text x="720" y="391" fill="var(--ret-text-dim)" fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="1.7">IDENTITY · MEMORY · SCHEDULE</text>
					<text x="720" y="410" fill="var(--ret-text-dim)" fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="1.7">FILES · HISTORY · EVIDENCE</text>
				</g>

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
						<circle cx={part.cx} cy={part.cy} r="63" fill="var(--ret-bg-soft)" stroke="var(--ret-border-hover)" />
						<text x={part.cx} y={part.cy - 5} textAnchor="middle" fill="var(--ret-text)" fontFamily="var(--font-sans)" fontSize="15" fontWeight="650">
							{part.label}
						</text>
						<text x={part.cx} y={part.cy + 18} textAnchor="middle" fill="var(--ret-text-muted)" fontFamily="var(--font-mono)" fontSize="7.7" letterSpacing="0.85">
							{part.detail.toUpperCase()}
						</text>
					</g>
				))}

				<GearWheel cx={1244} cy={370} radius={76} teeth={18} accent className="motion-safe:animate-[spin_34s_linear_infinite]" />
				<circle cx="1244" cy="370" r="47" fill="var(--ret-bg-soft)" stroke="var(--ret-purple)" />
				<g textAnchor="middle">
					<text x="1244" y="360" fill="var(--ret-green)" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1.8">VERIFIED</text>
					<text x="1244" y="382" fill="var(--ret-text)" fontFamily="var(--font-sans)" fontSize="14" fontWeight="700">WORK</text>
				</g>
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

function GearWheel({
	cx,
	cy,
	radius,
	teeth,
	accent = false,
	className = "",
}: {
	cx: number;
	cy: number;
	radius: number;
	teeth: number;
	accent?: boolean;
	className?: string;
}) {
	const toothWidth = Math.max(7, radius * 0.09);
	const toothHeight = Math.max(13, radius * 0.14);
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
						stroke={accent ? "var(--ret-purple)" : "var(--ret-border-hover)"}
						strokeWidth="1.2"
					/>
				);
			})}
			<circle
				cx={cx}
				cy={cy}
				r={radius}
				fill="var(--ret-bg)"
				stroke={accent ? "var(--ret-purple)" : "var(--ret-border-hover)"}
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
				<div className="mx-auto w-fit border border-[var(--ret-border-hover)] bg-[var(--ret-bg-soft)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ret-text-dim)]">
					Responsibility in
				</div>
				<div className="mx-auto h-8 w-px bg-[var(--ret-purple)]" />
				<div className="grid grid-cols-2 gap-3">
					{MACHINE_PARTS.slice(0, 2).map((part) => <MobilePart key={part.label} label={part.label} detail={part.detail} />)}
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
					<div className="relative text-center">
						<p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">durable core</p>
						<strong className="mt-1 block text-2xl text-[var(--ret-text)]">Worker</strong>
						<p className="mt-2 max-w-36 font-mono text-[8px] uppercase leading-relaxed tracking-[0.1em] text-[var(--ret-text-dim)]">
							identity · memory · schedule · evidence
						</p>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3">
					{MACHINE_PARTS.slice(2).map((part) => <MobilePart key={part.label} label={part.label} detail={part.detail} />)}
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

function MobilePart({ label, detail }: { label: string; detail: string }) {
	return (
		<div className="flex aspect-square flex-col items-center justify-center rounded-full border border-[var(--ret-border-hover)] bg-[var(--ret-bg-soft)] p-3 text-center">
			<strong className="text-[12px] text-[var(--ret-text)]">{label}</strong>
			<span className="mt-2 max-w-28 font-mono text-[7px] uppercase leading-relaxed tracking-[0.08em] text-[var(--ret-text-muted)]">
				{detail}
			</span>
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

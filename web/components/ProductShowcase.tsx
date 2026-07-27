import Image from "next/image";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon } from "@/components/ServiceIcon";

const RUNTIMES = [
	{ mark: "nous" as const, label: "Hermes" },
	{ mark: "openclaw" as const, label: "OpenClaw" },
	{ mark: "claudecode" as const, label: "Claude Code" },
	{ mark: "codex" as const, label: "Codex" },
];

const SUBSTRATES = [
	{ kind: "service" as const, icon: "e2b" as const, label: "E2B" },
	{ kind: "service" as const, icon: "sprites" as const, label: "Sprites" },
	{ kind: "logo" as const, icon: "dedalus" as const, label: "Dedalus" },
	{ kind: "service" as const, icon: "vercel" as const, label: "Vercel" },
];

export function ProductShowcase() {
	return (
		<section className="relative overflow-hidden">
			<header className="grid gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[minmax(300px,0.42fr)_minmax(0,0.58fr)]">
				<div className="bg-[var(--ret-bg)] px-5 py-8 md:px-8 md:py-10">
					<ReticleLabel>THE PRODUCT</ReticleLabel>
					<h2 className="ret-display mt-3 max-w-[15ch] text-3xl md:text-5xl">
						The real CLI. In your browser.
					</h2>
				</div>
				<div className="grid grid-cols-3 gap-px bg-[var(--ret-border)]">
					<Fact label="session" value="persistent" />
					<Fact label="transport" value="live PTY" />
					<Fact label="substrates" value="4 lanes" />
				</div>
			</header>

			<div className="grid gap-px bg-[var(--ret-border)] lg:grid-cols-2">
				<ProductScreen
					src="/screenshots/console-hermes.png"
					width={1024}
					height={692}
					label="Hermes · live console"
					alt="Hermes Agent running in the Agent Machines browser console"
				/>
				<ProductScreen
					src="/screenshots/console-codex.png"
					width={1024}
					height={688}
					label="Codex CLI · live console"
					alt="Codex CLI running in the Agent Machines browser console"
				/>
			</div>

			<div className="grid gap-px border-t border-[var(--ret-border)] bg-[var(--ret-border)] xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
				<div className="bg-[var(--ret-bg)] p-4 md:p-7">
					<div className="mb-5 flex items-end justify-between gap-4">
						<div>
							<ReticleLabel>DUAL ROUTING</ReticleLabel>
							<h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--ret-text)] md:text-2xl">
								Pick the brain. Pick the machine.
							</h3>
						</div>
						<ReticleBadge>one recipe</ReticleBadge>
					</div>
					<DualRouteDiagram />
				</div>
				<div className="bg-[var(--ret-bg)] p-4 md:p-7">
					<ReticleLabel>CONTROL LOOP</ReticleLabel>
					<h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--ret-text)] md:text-2xl">
						Deploy to prompt.
					</h3>
					<LifecycleDiagram />
				</div>
			</div>
		</section>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-h-28 flex-col justify-end bg-[var(--ret-bg)] p-4 md:p-5">
			<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<strong className="mt-2 text-sm font-semibold text-[var(--ret-text)] md:text-base">
				{value}
			</strong>
		</div>
	);
}

function ProductScreen({
	src,
	width,
	height,
	label,
	alt,
}: {
	src: string;
	width: number;
	height: number;
	label: string;
	alt: string;
}) {
	return (
		<figure className="group min-w-0 bg-[var(--ret-bg)] p-3 md:p-5">
			<div className="overflow-hidden border border-[var(--ret-border-hover)] bg-[#08090b] shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
				<div className="flex h-9 items-center justify-between border-b border-white/10 px-3">
					<div className="flex gap-1.5" aria-hidden="true">
						<span className="h-1.5 w-1.5 bg-white/25" />
						<span className="h-1.5 w-1.5 bg-white/15" />
						<span className="h-1.5 w-1.5 bg-white/10" />
					</div>
					<figcaption className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">
						{label}
					</figcaption>
				</div>
				<Image
					src={src}
					width={width}
					height={height}
					alt={alt}
					className="h-auto w-full transition-transform duration-500 [transition-timing-function:var(--ret-ease-out)] group-hover:scale-[1.015]"
					sizes="(min-width: 1024px) 50vw, 100vw"
				/>
			</div>
		</figure>
	);
}

function DualRouteDiagram() {
	return (
		<div className="relative border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
			<svg
				viewBox="0 0 1200 430"
				role="img"
				aria-labelledby="dual-route-title dual-route-desc"
				className="hidden h-auto w-full text-[var(--ret-text)] md:block"
			>
				<title id="dual-route-title">Agent Machines dual routing diagram</title>
				<desc id="dual-route-desc">
					Four agent runtimes and four machine substrates converge into one worker recipe, producing a persistent worker.
				</desc>
				<g fill="none" stroke="var(--ret-border-hover)" strokeWidth="2" vectorEffect="non-scaling-stroke">
					<path d="M135 110V145H845V182" />
					<path d="M335 110V145" />
					<path d="M535 110V145" />
					<path d="M735 110V145" />
					<path d="M135 320V285H845V248" />
					<path d="M335 320V285" />
					<path d="M535 320V285" />
					<path d="M735 320V285" />
					<path d="M930 215H1005" />
				</g>
				<g fill="var(--ret-bg)" stroke="var(--ret-border-hover)" strokeWidth="1.5">
					{[35, 235, 435, 635].map((x) => (
						<rect key={`top-${x}`} x={x} y="50" width="200" height="60" />
					))}
					{[35, 235, 435, 635].map((x) => (
						<rect key={`bottom-${x}`} x={x} y="320" width="200" height="60" />
					))}
					<rect x="760" y="165" width="170" height="100" stroke="var(--ret-purple)" />
					<rect x="1005" y="165" width="160" height="100" />
				</g>
				<g fill="var(--ret-text-muted)" fontFamily="var(--font-mono)" fontSize="14" letterSpacing="2">
					<text x="35" y="28">RUNTIME</text>
					<text x="35" y="410">SUBSTRATE</text>
				</g>
				<g fill="currentColor" fontFamily="var(--font-sans)" fontSize="17" fontWeight="600" textAnchor="middle">
					{RUNTIMES.map((runtime, index) => (
						<text key={runtime.label} x={135 + index * 200} y="87">{runtime.label}</text>
					))}
					{SUBSTRATES.map((substrate, index) => (
						<text key={substrate.label} x={135 + index * 200} y="357">{substrate.label}</text>
					))}
					<text x="845" y="207">Worker recipe</text>
					<text x="845" y="230" fill="var(--ret-text-muted)" fontSize="13" fontWeight="400">runtime + machine</text>
					<text x="1085" y="207">Persistent</text>
					<text x="1085" y="230">worker</text>
				</g>
				<g fill="var(--ret-purple)">
					<rect x="841" y="141" width="8" height="8" />
					<rect x="841" y="281" width="8" height="8" />
					<rect x="926" y="211" width="8" height="8" />
				</g>
			</svg>
			<div className="grid gap-2 p-3 md:hidden">
				<MobileBank label="runtime">
					{RUNTIMES.map((runtime) => (
						<div key={runtime.label} className="flex min-w-0 items-center gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-2">
							<Logo mark={runtime.mark} size={13} tone="native" />
							<span className="truncate text-[10px] font-medium text-[var(--ret-text)]">{runtime.label}</span>
						</div>
					))}
				</MobileBank>
				<FlowConnector />
				<div className="border border-[var(--ret-purple)] bg-[var(--ret-bg)] px-3 py-3 text-center">
					<strong className="text-xs text-[var(--ret-text)]">Worker recipe</strong>
					<p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">runtime + machine</p>
				</div>
				<FlowConnector />
				<MobileBank label="substrate">
					{SUBSTRATES.map((substrate) => (
						<div key={substrate.label} className="flex min-w-0 items-center gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-2">
							{substrate.kind === "service" ? <ServiceIcon slug={substrate.icon} size={13} /> : <Logo mark={substrate.icon} size={13} />}
							<span className="truncate text-[10px] font-medium text-[var(--ret-text)]">{substrate.label}</span>
						</div>
					))}
				</MobileBank>
				<FlowConnector />
				<div className="border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] px-3 py-3 text-center text-xs font-semibold text-[var(--ret-text)]">
					Persistent worker
				</div>
			</div>
		</div>
	);
}

function MobileBank({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">{label}</div>
			<div className="grid grid-cols-2 gap-1">{children}</div>
		</div>
	);
}

function FlowConnector() {
	return <span aria-hidden="true" className="mx-auto h-4 w-px bg-[var(--ret-border-hover)]" />;
}

function LifecycleDiagram() {
	const steps = ["configure", "provision", "bootstrap", "attach", "run"];
	return (
		<div className="mt-5 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4">
			<ol className="relative grid gap-3">
				{steps.map((step, index) => (
					<li key={step} className="relative grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3">
						{index < steps.length - 1 ? (
							<span className="absolute left-[13px] top-7 h-[calc(100%+12px)] w-px bg-[var(--ret-border-hover)]" aria-hidden="true" />
						) : null}
						<span className="relative z-10 flex h-7 w-7 items-center justify-center border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] font-mono text-[9px] text-[var(--ret-text-muted)]">
							{String(index + 1).padStart(2, "0")}
						</span>
						<span className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text)]">
							{step}
						</span>
					</li>
				))}
			</ol>
			<div className="mt-5 grid grid-cols-4 gap-px bg-[var(--ret-border)]">
				{SUBSTRATES.map((substrate) => (
					<div key={substrate.label} className="flex min-h-10 items-center justify-center bg-[var(--ret-bg)]" title={substrate.label}>
						{substrate.kind === "service" ? (
							<ServiceIcon slug={substrate.icon} size={14} />
						) : (
							<Logo mark={substrate.icon} size={14} />
						)}
					</div>
				))}
			</div>
		</div>
	);
}

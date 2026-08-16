import Image from "next/image";
import type { ReactNode } from "react";

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
					<ReticleLabel>PRODUCT EVIDENCE</ReticleLabel>
					<h2 className="ret-display mt-3 max-w-[15ch] text-3xl md:text-5xl">
						Configure it, run it, and inspect the result.
					</h2>
				</div>
				<div className="grid grid-cols-3 gap-px bg-[var(--ret-border)]">
					<Fact label="identity" value="worker-owned" />
					<Fact label="transport" value="live PTY" />
					<Fact label="machinery" value="replaceable" />
				</div>
			</header>

			<div className="grid gap-px bg-[var(--ret-border)] xl:grid-cols-12">
				<EvidenceScreen
					src="/screenshots/dashboard-conversation-claude.png"
					label="Claude Code on Sprites"
					caption="The live PTY, the agent reply, runtime detection, usage, and logs in one machine-scoped view."
					alt="Claude Code answering a question inside a live Agent Machines worker console"
					className="xl:col-span-8"
					imageClassName="aspect-[4/3] object-cover object-top md:aspect-[16/9]"
				/>
				<EvidenceScreen
					src="/screenshots/dashboard-worker-configure.png"
					label="Worker configuration"
					caption="Choose a recipe, runtime, and name before any infrastructure is created."
					alt="Worker configuration dialog in the Agent Machines dashboard"
					className="xl:col-span-4"
					imageClassName="aspect-[4/3] object-cover object-top md:aspect-[16/9]"
				/>
				<EvidenceScreen
					src="/screenshots/dashboard-conversation-openclaw.png"
					label="OpenClaw on E2B"
					caption="A real OpenClaw run on E2B, with the selected model and durable Worker state visible in the session."
					alt="OpenClaw answering a question inside a live E2B Worker console"
					className="xl:col-span-7"
					imageClassName="aspect-[4/3] object-cover object-top md:aspect-[16/9]"
				/>
				<EvidenceScreen
					src="/screenshots/dashboard-live-fleet.png"
					label="Live fleet"
					caption="Provider, runtime, model, health, loadout, and migration controls are visible on each machine."
					alt="Agent Machines fleet with Codex and Claude Code workers"
					className="xl:col-span-5"
					imageClassName="aspect-[4/3] object-cover object-top md:aspect-[16/9]"
				/>
				<EvidenceScreen
					src="/screenshots/dashboard-provider-routing.png"
					label="Provider routing"
					caption="The setup flow shows the primary lane, backups, capabilities, and measured command latency."
					alt="Sandbox provider routing and setup status in Agent Machines"
					className="xl:col-span-12"
					imageClassName="aspect-[4/3] object-cover object-top md:aspect-[16/9]"
				/>
				<EvidenceScreen
					src="/screenshots/console-hermes.png"
					label="Hermes console"
					caption="A persistent generalist with memory, tools, and scheduled work."
					alt="Hermes running in the Agent Machines browser console"
					className="xl:col-span-6"
					imageClassName="aspect-[4/3] object-cover object-top md:aspect-[16/9]"
				/>
				<EvidenceScreen
					src="/screenshots/console-codex.png"
					label="Codex CLI console"
					caption="A coding runtime attached to the same durable Worker control surface."
					alt="Codex CLI running in the Agent Machines browser console"
					className="xl:col-span-6"
					imageClassName="aspect-[4/3] object-cover object-top md:aspect-[16/9]"
				/>
			</div>

			<div className="grid gap-px border-t border-[var(--ret-border)] bg-[var(--ret-border)] xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
				<div className="bg-[var(--ret-bg)] p-4 md:p-7">
					<div className="mb-5 flex items-end justify-between gap-4">
						<div>
							<ReticleLabel>DURABLE CORE · MODULAR STACK</ReticleLabel>
							<h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--ret-text)] md:text-2xl">
								Keep the Worker. Swap the machinery.
							</h3>
						</div>
						<ReticleBadge>one durable identity</ReticleBadge>
					</div>
					<DualRouteDiagram />
				</div>
				<div className="bg-[var(--ret-bg)] p-4 md:p-7">
					<ReticleLabel>RESPONSIBILITY LOOP</ReticleLabel>
					<h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--ret-text)] md:text-2xl">
						Intent to supervised work.
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

function EvidenceScreen({
	src,
	label,
	caption,
	alt,
	className = "",
	imageClassName = "",
}: {
	src: string;
	label: string;
	caption: string;
	alt: string;
	className?: string;
	imageClassName?: string;
}) {
	return (
		<figure className={`group min-w-0 bg-[var(--ret-bg)] p-3 md:p-5 ${className}`}>
			<div className="overflow-hidden border border-[var(--ret-border-hover)] bg-[#08090b] shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
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
				<div className="relative overflow-hidden">
					<Image
						src={src}
						width={1440}
						height={1000}
						alt={alt}
						className={`h-auto w-full transition-transform duration-500 [transition-timing-function:var(--ret-ease-out)] group-hover:scale-[1.01] ${imageClassName}`}
						sizes="(min-width: 1280px) 60vw, 100vw"
					/>
					<div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-20 bg-gradient-to-t from-black/75 to-transparent md:block" />
					<p className="border-t border-white/10 bg-[#08090b] p-3 text-[10px] leading-relaxed text-white/70 md:absolute md:inset-x-0 md:bottom-0 md:border-t-0 md:bg-transparent md:p-4">
						{caption}
					</p>
				</div>
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
					A durable Worker intent keeps its identity and responsibility while four agent runtimes and four machine substrates remain replaceable implementations.
				</desc>
				<g
					fill="none"
					stroke="var(--ret-border-hover)"
					strokeWidth="1.5"
					strokeLinecap="square"
					strokeLinejoin="miter"
					vectorEffect="non-scaling-stroke"
				>
					<path d="M135 110L170 145H720L757 182" />
					<path d="M335 110L370 145" />
					<path d="M535 110L500 145" />
					<path d="M735 110L700 145" />
					<path d="M135 320L170 285H720L757 248" />
					<path d="M335 320L370 285" />
					<path d="M535 320L500 285" />
					<path d="M735 320L700 285" />
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
					<text x="845" y="207">Worker intent</text>
					<text x="845" y="230" fill="var(--ret-text-muted)" fontSize="13" fontWeight="400">identity + responsibility</text>
					<text x="1085" y="207">Running</text>
					<text x="1085" y="230">Worker</text>
				</g>
				<g fill="var(--ret-purple)">
					<rect x="753" y="178" width="8" height="8" transform="rotate(45 757 182)" />
					<rect x="753" y="244" width="8" height="8" transform="rotate(45 757 248)" />
					<rect x="926" y="211" width="8" height="8" transform="rotate(45 930 215)" />
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
					<strong className="text-xs text-[var(--ret-text)]">Worker intent</strong>
					<p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">identity + responsibility</p>
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
					Running Worker
				</div>
			</div>
		</div>
	);
}

function MobileBank({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">{label}</div>
			<div className="grid grid-cols-2 gap-1">{children}</div>
		</div>
	);
}

function FlowConnector() {
	return <span aria-hidden="true" className="mx-auto h-4 w-px bg-[var(--ret-border-hover)]" />;
}

function LifecycleDiagram() {
	const steps = ["describe", "compose", "provision", "run", "supervise"];
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

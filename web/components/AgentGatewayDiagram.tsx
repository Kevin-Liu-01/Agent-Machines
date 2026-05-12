import type { SVGProps } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon } from "@/components/ServiceIcon";
import { WingBackground } from "@/components/WingBackground";

type BentoItem = {
	kicker: string;
	title: string;
	body: string;
	span: "wide" | "normal" | "tall";
	variant?: "nyx-lines" | "nyx-waves" | "cloud";
	diagram?: "agent-flow" | "gateway" | "container" | "loadout" | "presets";
};

const BENTOS: ReadonlyArray<BentoItem> = [
	{
		kicker: "01 / the model",
		title: "Agent → Gateway → Container",
		body: "Your agent runs inside a persistent microVM. Chat goes through a gateway that serves an OpenAI-compatible /v1 endpoint. The container holds disk, tools, skills, and crons.",
		span: "wide",
		variant: "nyx-waves",
		diagram: "agent-flow",
	},
	{
		kicker: "02 / gateway",
		title: "One port, both agents",
		body: "Hermes and OpenClaw share :8642. The Dedalus AI router fronts 200+ models. Swap the agent from the navbar, not the endpoint.",
		span: "normal",
		variant: "nyx-lines",
		diagram: "gateway",
	},
	{
		kicker: "03 / container",
		title: "/home/machine persists",
		body: "Sleep pauses compute; the filesystem survives. Chats, skills, memory, crons, sessions, artifacts -- all on disk, not in RAM.",
		span: "normal",
		diagram: "container",
	},
	{
		kicker: "04 / loadout",
		title: "96 skills, 23 tools, 17 services",
		body: "Built-in tools fire in one turn. MCP servers auto-spawn at boot. Service entries rank MCP > CLI > skills per platform.",
		span: "normal",
		variant: "nyx-lines",
		diagram: "loadout",
	},
	{
		kicker: "05 / presets",
		title: "Compose your own rig",
		body: "The bundled stack is one preset. Add skills.sh skills, GitHub repos, MCP servers, CLIs, and npm packages -- then save as a named preset.",
		span: "normal",
		variant: "nyx-waves",
		diagram: "presets",
	},
];

export function AgentGatewayDiagram() {
	return (
		<>
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<ReticleLabel>ARCHITECTURE</ReticleLabel>
					<h2 className="ret-display mt-2 text-xl md:text-2xl">
						How the machine works.
					</h2>
				</div>
				<p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] md:block">
					5 blocks . one product boundary
				</p>
			</div>

			<div className="mt-4 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-2">
				{BENTOS.map((item) => (
					<BentoCell key={item.kicker} item={item} />
				))}
			</div>
		</>
	);
}

function BentoCell({ item }: { item: BentoItem }) {
	const isWide = item.span === "wide";
	return (
		<div
			className={`relative flex min-h-[220px] overflow-hidden bg-[var(--ret-bg)] ${isWide ? "md:col-span-2" : ""}`}
		>
			{item.variant ? (
				<WingBackground
					variant={item.variant}
					opacity={{ light: 0.14, dark: 0.28 }}
					fadeEdges
				/>
			) : null}
			<div className={`relative z-10 grid w-full ${isWide ? "md:grid-cols-[1fr_1.4fr]" : "grid-rows-[auto_1fr]"}`}>
				<div className="flex flex-col justify-between p-4">
					<div>
						<ReticleLabel>{item.kicker}</ReticleLabel>
						<h3 className="ret-display mt-2 max-w-[18ch] text-lg md:text-xl">
							{item.title}
						</h3>
						<p className="mt-2 max-w-[48ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
							{item.body}
						</p>
					</div>
				</div>
				<div className="flex items-center justify-center border-t border-[var(--ret-border)] p-4 md:border-t-0 md:border-l">
					<DiagramBlock diagram={item.diagram} />
				</div>
			</div>
		</div>
	);
}

function DiagramBlock({ diagram }: { diagram?: BentoItem["diagram"] }) {
	switch (diagram) {
		case "agent-flow":
			return <AgentFlowDiagram />;
		case "gateway":
			return <GatewayDiagram />;
		case "container":
			return <ContainerDiagram />;
		case "loadout":
			return <LoadoutDiagram />;
		case "presets":
			return <PresetsDiagram />;
		default:
			return null;
	}
}

function AgentFlowDiagram() {
	return (
		<div className="flex w-full max-w-[460px] items-center gap-2">
			<FlowBox label="You" sub="browser / CLI" accent="var(--ret-text-muted)">
				<IconUser className="h-5 w-5" />
			</FlowBox>
			<FlowArrow />
			<FlowBox label="Gateway" sub=":8642 /v1" accent="var(--ret-purple)">
				<IconGateway className="h-5 w-5" />
			</FlowBox>
			<FlowArrow />
			<FlowBox label="Agent" sub="Hermes / OC" accent="var(--ret-green)">
				<Logo mark="agent" size={18} />
			</FlowBox>
			<FlowArrow />
			<FlowBox label="Container" sub="/home/machine" accent="var(--ret-amber)">
				<IconContainer className="h-5 w-5" />
			</FlowBox>
		</div>
	);
}

function GatewayDiagram() {
	return (
		<div className="flex w-full flex-col gap-2">
			<div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				<MiniCell label="Hermes" value="memory + cron + MCP" />
				<MiniCell label="OpenClaw" value="browser + vision" />
				<MiniCell label="Router" value="200+ models via Dedalus" />
				<MiniCell label="Tunnel" value="Cloudflare / preview URL" />
			</div>
			<div className="flex items-center gap-2">
				<Logo mark="nous" size={14} />
				<Logo mark="openclaw" size={14} />
				<ServiceIcon slug="cloudflare" size={14} />
				<Logo mark="dedalus" size={14} />
			</div>
		</div>
	);
}

function ContainerDiagram() {
	return (
		<div className="grid w-full grid-cols-3 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
			{[
				["~/.hermes/", "runtime state"],
				["~/.agent-machines/", "app data"],
				["~/agent-machines/", "git checkout"],
				["skills/", "96 SKILL.md"],
				["sessions.db", "FTS5 history"],
				["crons/", "scheduled tasks"],
			].map(([label, sub]) => (
				<div key={label} className="bg-[var(--ret-bg)] px-3 py-2.5">
					<p className="font-mono text-[10px] text-[var(--ret-text)]">{label}</p>
					<p className="font-mono text-[9px] text-[var(--ret-text-muted)]">{sub}</p>
				</div>
			))}
		</div>
	);
}

function LoadoutDiagram() {
	return (
		<div className="flex w-full flex-col gap-2">
			<div className="grid grid-cols-3 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				<CountCell label="built-ins" value="23" />
				<CountCell label="skills" value="96" />
				<CountCell label="services" value="17" />
			</div>
			<div className="flex flex-wrap gap-1">
				{["Vercel", "Stripe", "Supabase", "GitHub", "Figma", "Linear"].map((s) => (
					<ReticleBadge key={s} className="text-[9px]">{s}</ReticleBadge>
				))}
			</div>
		</div>
	);
}

function PresetsDiagram() {
	return (
		<div className="flex w-full flex-col gap-2">
			{[
				["Opinionated default", "active", "bundled skills + tools + MCPs"],
				["Frontend design lab", "", "taste skills + Figma + browser"],
				["Production ops", "", "Vercel + Datadog + CI/CD"],
				["Research browser", "", "search + extraction + reach"],
			].map(([name, badge, hint]) => (
				<div
					key={name}
					className="flex items-center justify-between border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-1.5"
				>
					<span className="font-mono text-[10px] text-[var(--ret-text)]">{name}</span>
					<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
						{badge ? <ReticleBadge variant="accent" className="text-[8px] mr-1">{badge}</ReticleBadge> : null}
						{hint}
					</span>
				</div>
			))}
		</div>
	);
}

function FlowBox({
	label,
	sub,
	accent,
	children,
}: {
	label: string;
	sub: string;
	accent: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-1 flex-col items-center gap-1.5 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-3">
			<div style={{ color: accent }}>{children}</div>
			<p className="font-mono text-[10px] font-semibold text-[var(--ret-text)]">{label}</p>
			<p className="font-mono text-[8px] text-[var(--ret-text-muted)]">{sub}</p>
		</div>
	);
}

function FlowArrow() {
	return (
		<div className="flex shrink-0 items-center px-0.5 text-[var(--ret-purple)]">
			<svg width="16" height="8" viewBox="0 0 16 8" fill="none">
				<path d="M0 4h12M10 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" />
			</svg>
		</div>
	);
}

function MiniCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-2">
			<p className="font-mono text-[10px] font-semibold text-[var(--ret-text)]">{label}</p>
			<p className="font-mono text-[9px] text-[var(--ret-text-muted)]">{value}</p>
		</div>
	);
}

function CountCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-2 text-center">
			<p className="font-mono text-base tabular-nums text-[var(--ret-text)]">{value}</p>
			<p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">{label}</p>
		</div>
	);
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

import type { SVGProps } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { WingBackground } from "@/components/WingBackground";

type Step = {
	id: string;
	tab: string;
	kicker: string;
	title: string;
	body: string;
	Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
	metrics: Array<[string, string]>;
};

const STEPS: ReadonlyArray<Step> = [
	{
		id: "ui",
		tab: "ui",
		kicker: "01 / dashboard",
		title: "Configure once, then operate from the fleet view.",
		body: "Settings, setup, machine lifecycle, terminal, logs, artifacts, and chat all read from the same account configuration instead of one-off wizard state.",
		Icon: IconPanel,
		metrics: [
			["settings", "providers + gateways + profiles"],
			["actions", "wake . sleep . destroy"],
			["storage", "/home/machine/.agent-machines"],
		],
	},
	{
		id: "agent",
		tab: "agent",
		kicker: "02 / runtime",
		title: "Hermes and OpenClaw are sibling boot profiles.",
		body: "Each agent owns a runtime directory, log path, gateway command, model settings, and bootstrap preset. The UI does not pretend one is a demo path.",
		Icon: IconAgent,
		metrics: [
			["hermes", "memory . cron . mcp"],
			["openclaw", "browser . shell . vision"],
			["profiles", "reusable per account"],
		],
	},
	{
		id: "tools",
		tab: "tools + mcps",
		kicker: "03 / loadout",
		title: "Skills, MCP servers, CLI tools, and plugins are visible.",
		body: "Built-ins and custom loadout entries live in the same account settings model so terminal edits can sync back into the dashboard.",
		Icon: IconTools,
		metrics: [
			["skills", "96 synced"],
			["services", "17 routes"],
			["custom", "skill . tool . mcp . cli . plugin"],
		],
	},
	{
		id: "providers",
		tab: "providers",
		kicker: "04 / hosts",
		title: "Dedalus by default. Fly and Sandbox are explicit hosts.",
		body: "Persistent-machine providers expose disk, wake/sleep, destroy, and exec. Ephemeral sandboxes expose session exec and external storage.",
		Icon: IconProvider,
		metrics: [
			["dedalus", "persistent microVM"],
			["fly", "app + volume + machine"],
			["sandbox", "ephemeral session"],
		],
	},
	{
		id: "env",
		tab: "vm sandbox env",
		kicker: "05 / environment",
		title: "Gateway and environment settings follow new machines.",
		body: "Gateway profiles, env profiles, and bootstrap presets are account-level objects that a new machine can inherit.",
		Icon: IconEnv,
		metrics: [
			["gateway", "dedalus . ai gateway . byo"],
			["env", "named variable sets"],
			["bootstrap", "phase tracked"],
		],
	},
];

export function WorkflowNavigator() {
	return (
		<section className="relative">
			<div className="sticky top-[48px] z-30 -mx-3 border-y border-[var(--ret-border)] bg-[var(--ret-bg)]/90 backdrop-blur md:-mx-4">
				<nav className="mx-auto grid max-w-[var(--ret-content-max)] grid-cols-2 divide-x divide-y divide-[var(--ret-border)] border-x border-[var(--ret-border)] md:grid-cols-5 md:divide-y-0">
					{STEPS.map((step) => (
						<a
							key={step.id}
							href={`#workflow-${step.id}`}
							className="group flex items-center justify-between gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] transition-colors hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]"
						>
							<span>{step.tab}</span>
							<span className="h-1 w-1 bg-current opacity-40 transition-opacity group-hover:opacity-100" />
						</a>
					))}
				</nav>
			</div>

			<div className="mt-4 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{STEPS.map((step, index) => (
					<WorkflowRow key={step.id} step={step} index={index} />
				))}
			</div>
		</section>
	);
}

function WorkflowRow({ step, index }: { step: Step; index: number }) {
	const Icon = step.Icon;
	return (
		<div
			id={`workflow-${step.id}`}
			className="grid min-h-[360px] bg-[var(--ret-bg)] md:grid-cols-[0.85fr_1.15fr]"
		>
			<div className="flex flex-col justify-between border-b border-[var(--ret-border)] p-4 md:border-r md:border-b-0">
				<div>
					<ReticleLabel>{step.kicker}</ReticleLabel>
					<h3 className="ret-display mt-3 max-w-[16ch] text-2xl md:text-3xl">
						{step.title}
					</h3>
					<p className="mt-3 max-w-[52ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						{step.body}
					</p>
				</div>
				<div className="mt-6 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
					{step.metrics.map(([label, value]) => (
						<div key={label} className="flex items-center justify-between gap-4 bg-[var(--ret-bg-soft)] px-3 py-2">
							<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{label}
							</span>
							<span className="font-mono text-[10px] text-[var(--ret-text)]">
								{value}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="relative min-h-[360px] overflow-hidden bg-[var(--ret-bg-soft)]">
				<WingBackground
					variant={index % 2 === 0 ? "nyx-lines" : "nyx-waves"}
					opacity={{ light: 0.26, dark: 0.44 }}
					fadeEdges
				/>
				<div className="ret-material-field absolute inset-0 opacity-80" aria-hidden="true" />
				<div className="relative z-10 grid h-full grid-cols-[0.75fr_1fr] gap-px bg-[var(--ret-border)]">
					<div className="flex flex-col justify-between bg-[var(--ret-bg)]/92 p-4 backdrop-blur-sm">
						<div className="flex h-16 w-16 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-purple)]">
							<Icon className="h-9 w-9" />
						</div>
						<div className="space-y-2">
							<ReticleBadge variant={index === 1 ? "accent" : "default"}>
								{step.tab}
							</ReticleBadge>
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								workflow block {String(index + 1).padStart(2, "0")}
							</p>
						</div>
					</div>
					<MiniDiagram index={index} />
				</div>
			</div>
		</div>
	);
}

function MiniDiagram({ index }: { index: number }) {
	const labels = [
		["settings", "fleet", "dashboard", "terminal"],
		["profile", "runtime", "gateway", "logs"],
		["skills", "mcp", "cli", "plugin"],
		["provider", "machine", "volume", "exec"],
		["env", "model", "secrets", "bootstrap"],
	][index] ?? ["input", "agent", "output", "state"];
	return (
		<div className="relative bg-[var(--ret-bg)]/88 p-4 backdrop-blur-sm">
			<div className="grid h-full grid-cols-2 grid-rows-2 gap-2">
				{labels.map((label, i) => (
					<div
						key={label}
						className="relative flex flex-col justify-between border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3"
					>
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							0{i + 1}
						</span>
						<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text)]">
							{label}
						</span>
						<span className="absolute right-2 top-2 h-1.5 w-1.5 bg-[var(--ret-purple)]" />
					</div>
				))}
			</div>
			<div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-[var(--ret-purple)]/70" />
			<div className="pointer-events-none absolute inset-y-8 left-1/2 w-px bg-[var(--ret-purple)]/70" />
			<div className="absolute right-4 top-4 flex gap-1">
				<Logo mark={index === 1 ? "openclaw" : "dedalus"} size={14} />
				{index === 1 ? <Logo mark="nous" size={14} /> : null}
			</div>
		</div>
	);
}

function IconPanel(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><rect x="4" y="6" width="24" height="20" /><path d="M4 12h24M11 12v14M15 17h9M15 21h6" /></svg>;
}

function IconAgent(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><path d="M16 4l9 5v14l-9 5-9-5V9z" /><path d="M11 14h10M11 18h10M16 4v8M16 20v8" /></svg>;
}

function IconTools(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><rect x="5" y="5" width="8" height="8" /><rect x="19" y="5" width="8" height="8" /><rect x="5" y="19" width="8" height="8" /><rect x="19" y="19" width="8" height="8" /><path d="M13 9h6M9 13v6M23 13v6M13 23h6" /></svg>;
}

function IconProvider(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><path d="M6 9h20v6H6zM6 17h20v6H6z" /><path d="M10 12h3M10 20h3M22 12h2M22 20h2" /></svg>;
}

function IconEnv(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}><path d="M5 8h22v16H5z" /><path d="M9 13h4M9 17h8M9 21h5M21 13l2 2-2 2" /></svg>;
}

import type { SVGProps } from "react";

import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { SchematicPanel } from "@/components/reticle/SchematicPanel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";

const SPECS: ReadonlyArray<{
	label: string;
	value: string;
	description: string;
	icon: ToolCategory;
}> = [
	{
		label: "Runtime routes",
		value: "4 agents",
		description: "Hermes, OpenClaw, Claude Code, and Codex.",
		icon: "delegate",
	},
	{
		label: "Substrate routes",
		value: "4 lanes",
		description: "E2B, Sprites.dev, Dedalus Machines, and Vercel Sandbox.",
		icon: "shell",
	},
	{
		label: "Model routes",
		value: "BYOK",
		description: "Dedalus, OpenRouter, AI Gateway, or native keys.",
		icon: "memory",
	},
	{
		label: "Bootstrap",
		value: "phased",
		description: "Runtime, env, gateway, skills, MCP, and cron.",
		icon: "schedule",
	},
	{
		label: "Skills synced",
		value: "161",
		description: "SKILL.md files installed from registries at boot.",
		icon: "filesystem",
	},
	{
		label: "Fleet model",
		value: "account",
		description: "One identity, many machines. Clerk-backed.",
		icon: "delegate",
	},
];

type StackIcon =
	| { kind: "logo"; mark: "am" | "cursor" | "dedalus" | "nous" | "openclaw" }
	| { kind: "service"; slug: ServiceSlug };

type ServiceEntry = {
	id: string;
	icon: StackIcon;
	name: string;
	role: string;
	href: string;
};

type Assembly = "stack" | "pills" | "logos";

type Feature = {
	Icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
	title: string;
	body: string;
	services: ServiceEntry[];
	assembly: Assembly;
};

const FEATURES: ReadonlyArray<Feature> = [
	{
		assembly: "stack",
		Icon: IconRoute,
		title: "Route runtime and substrate",
		body: "Pick the agent runtime and provider lane separately. Agent Machines wires the same worker surface on top: console, gateway, loadout, cron, logs, and usage.",
		services: [
			{
				id: "e2b",
				icon: { kind: "service", slug: "e2b" },
				name: "E2B",
				role: "Sandbox substrate for fast ephemeral agent runs",
				href: "https://e2b.dev",
			},
			{
				id: "sprites",
				icon: { kind: "service", slug: "sprites" },
				name: "Sprites",
				role: "Persistent microVM substrate on Sprites.dev",
				href: "https://sprites.dev",
			},
			{
				id: "dedalus",
				icon: { kind: "logo", mark: "dedalus" },
				name: "Dedalus Machines",
				role: "Strong default on boot, sleep, and wake — one lane of four",
				href: "https://docs.dedaluslabs.ai/dcs",
			},
			{
				id: "vercel-sandbox",
				icon: { kind: "service", slug: "vercel" },
				name: "Vercel Sandbox",
				role: "Persistent microVMs with auto-snapshots, getOrCreate, and port URLs",
				href: "https://vercel.com/docs/vercel-sandbox",
			},
		],
	},
	{
		assembly: "pills",
		Icon: IconFleet,
		title: "Supervise a specialist fleet",
		body: "One Clerk sign-in stores provider credentials, runtime choices, machine records, and profile metadata. The dashboard shows the fleet instead of one local terminal.",
		services: [
			{
				id: "clerk",
				icon: { kind: "service", slug: "clerk" },
				name: "Clerk",
				role: "Per-user identity, fleet metadata, and API key storage",
				href: "https://clerk.com",
			},
			{
				id: "vercel",
				icon: { kind: "service", slug: "vercel" },
				name: "Vercel",
				role: "Hosts the dashboard, AI Gateway, and control-plane APIs",
				href: "https://vercel.com",
			},
			{
				id: "anthropic",
				icon: { kind: "service", slug: "anthropic" },
				name: "Anthropic",
				role: "Claude models via direct API or AI Gateway routing",
				href: "https://www.anthropic.com/",
			},
		],
	},
	{
		assembly: "logos",
		Icon: IconToolStack,
		title: "One worker, full harness",
		body: "Not a bare sandbox. The worker carries runtime, skills, MCP, cron, gateway, logs, usage, artifacts, and the browser console in one deployable unit.",
		services: [
			{
				id: "hermes",
				icon: { kind: "logo", mark: "nous" },
				name: "Hermes",
				role: "Memory, cron, sessions, MCP host, and subagents",
				href: "https://github.com/NousResearch/hermes-agent",
			},
			{
				id: "openclaw",
				icon: { kind: "logo", mark: "openclaw" },
				name: "OpenClaw",
				role: "Browser, shell, vision, and computer-use automation",
				href: "https://github.com/openclaw/openclaw",
			},
			{
				id: "cursor",
				icon: { kind: "logo", mark: "cursor" },
				name: "Cursor SDK",
				role: "Spawns coding agents for repo edits via MCP bridge",
				href: "https://cursor.com/docs/sdk/typescript",
			},
		],
	},
];

function StackIconView({
	icon,
	size = 16,
}: { icon: StackIcon; size?: number }) {
	if (icon.kind === "logo") {
		return (
			<Logo
				mark={icon.mark}
				size={size}
				tone={icon.mark === "nous" || icon.mark === "openclaw" ? "native" : undefined}
			/>
		);
	}
	return <ServiceIcon slug={icon.slug} size={size} />;
}

export function StatsRow() {
	return (
		<div>
			{/* Header + control-plane schematic */}
			<div className="grid grid-cols-1 items-stretch gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[1.05fr_0.95fr]">
				<div className="flex flex-col justify-center bg-[var(--ret-bg)] px-4 py-8 md:px-6 md:py-12">
					<ReticleLabel>CONTROL PLANE</ReticleLabel>
					<h2 className="ret-display mt-3 max-w-[18ch] text-2xl tracking-tight md:text-4xl">
						OpenRouter for agents and containers.
					</h2>
					<p className="mt-4 max-w-[52ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						Route the agent runtime and the container substrate from one
						account, then deploy a persistent worker with its full harness —
						supervised from a single dashboard.
					</p>
				</div>
				<div className="flex items-center justify-center bg-[var(--ret-bg)] p-4 md:p-6">
					<SchematicPanel slug="overview" className="w-full max-w-[440px]" />
				</div>
			</div>

			{/* Instrument readout grid */}
			<div className="grid grid-cols-2 gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{SPECS.map((spec) => (
					<ReadoutCell key={spec.label} spec={spec} />
				))}
			</div>

			{/* Feature cards */}
			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] md:grid-cols-3">
				{FEATURES.map(({ Icon, title, body, services, assembly }) => (
					<div
						key={title}
						className="flex flex-col bg-[var(--ret-bg)] p-5 md:p-6"
					>
						<div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text)]">
							<Icon className="h-4 w-4" />
						</div>
						<h3 className="text-[15px] font-semibold tracking-tight text-[var(--ret-text)]">
							{title}
						</h3>
						<p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							{body}
						</p>
						<div className="mt-5 flex-1">
							<ServiceAssembly variant={assembly} services={services} />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/* ── Instrument readout cell ── */

function ReadoutCell({ spec }: { spec: (typeof SPECS)[number] }) {
	return (
		<div className="flex flex-col gap-1 bg-[var(--ret-bg)] px-4 py-5">
			<div className="flex items-center gap-1.5">
				<ToolIcon name={spec.icon} size={11} className="text-[var(--ret-text-muted)]" />
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{spec.label}
				</span>
			</div>
			<span className="mt-1 text-[22px] font-semibold leading-none tabular-nums tracking-tight text-[var(--ret-text)]">
				{spec.value}
			</span>
			<span className="text-[11px] leading-snug text-[var(--ret-text-dim)]">
				{spec.description}
			</span>
		</div>
	);
}

/* ── Assembled service diagrams ── */

function ServiceAssembly({
	variant,
	services,
}: {
	variant: Assembly;
	services: ServiceEntry[];
}) {
	switch (variant) {
		case "stack":
			return <AssembledStack services={services} />;
		case "pills":
			return <AssembledPills services={services} />;
		case "logos":
			return <AssembledLogoGrid services={services} />;
	}
}

function AssembledStack({ services }: { services: ServiceEntry[] }) {
	return (
		<div className="flex flex-col gap-2">
			{services.map((s) => (
				<a
					key={s.id}
					href={s.href}
					target="_blank"
					rel="noreferrer"
					className="group flex items-center gap-3 rounded-lg border border-[var(--ret-border)] px-3 py-2.5 transition-colors duration-150 hover:border-[var(--ret-purple)]/30 hover:bg-[var(--ret-surface)]"
				>
					<StackIconView icon={s.icon} />
					<div className="min-w-0 flex-1">
						<p className="text-[12px] font-medium text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
							{s.name}
						</p>
						<p className="text-[10px] leading-snug text-[var(--ret-text-muted)]">
							{s.role}
						</p>
					</div>
				</a>
			))}
		</div>
	);
}

function AssembledPills({ services }: { services: ServiceEntry[] }) {
	return (
		<div className="flex flex-wrap gap-2">
			{services.map((s) => (
				<a
					key={s.id}
					href={s.href}
					target="_blank"
					rel="noreferrer"
					className="group inline-flex items-center gap-2 rounded-full border border-[var(--ret-border)] bg-[var(--ret-surface)] px-3.5 py-2 transition-colors duration-150 hover:border-[var(--ret-purple)]/30"
				>
					<StackIconView icon={s.icon} />
					<span className="text-[12px] font-medium text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
						{s.name}
					</span>
				</a>
			))}
		</div>
	);
}

function AssembledLogoGrid({ services }: { services: ServiceEntry[] }) {
	return (
		<div className="flex items-start gap-5">
			{services.map((s) => (
				<a
					key={s.id}
					href={s.href}
					target="_blank"
					rel="noreferrer"
					title={`${s.name}: ${s.role}`}
					className="group flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
				>
					<div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ret-border)] bg-[var(--ret-surface)]">
						<StackIconView icon={s.icon} size={18} />
					</div>
					<span className="text-[10px] font-medium text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text)]">
						{s.name}
					</span>
				</a>
			))}
		</div>
	);
}

/* ── SVG Icons ── */

function IconRoute(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<circle cx="4" cy="4" r="2" />
			<circle cx="12" cy="4" r="2" />
			<circle cx="8" cy="12" r="2" />
			<path d="M5.5 5.5 7 10M10.5 5.5 9 10" />
		</svg>
	);
}

function IconFleet(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<circle cx="5" cy="11" r="2.5" />
			<path d="M7 9l6.5-6.5M11 5l1.5 1.5M9.5 6.5L11 8" />
		</svg>
	);
}

function IconToolStack(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M8 2L2 5l6 3 6-3z" />
			<path d="M2 11l6 3 6-3M2 8l6 3 6-3" />
		</svg>
	);
}

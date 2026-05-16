import type { SVGProps } from "react";

import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";
import { cn } from "@/lib/cn";

const SPECS: ReadonlyArray<{
	label: string;
	value: string;
	description: string;
	icon: ToolCategory;
}> = [
	{
		label: "Compute",
		value: "1 vCPU",
		description: "Billed by the second. Pauses when idle.",
		icon: "shell",
	},
	{
		label: "Memory",
		value: "2 GiB RAM",
		description: "Enough for the agent runtime + browser.",
		icon: "memory",
	},
	{
		label: "Disk",
		value: "10 GiB SSD",
		description: "Persistent across sleep/wake cycles.",
		icon: "filesystem",
	},
	{
		label: "Cold boot",
		value: "< 30 seconds",
		description: "Warm wake < 5s. Auto-wakes on first prompt.",
		icon: "schedule",
	},
	{
		label: "Skills loaded",
		value: "96",
		description: "SKILL.md files synced from the wiki at boot.",
		icon: "memory",
	},
	{
		label: "Fleet model",
		value: "Per-account",
		description: "One identity, many machines. Clerk-backed.",
		icon: "delegate",
	},
];

type StackIcon =
	| { kind: "logo"; mark: "dedalus" | "cursor" | "nous" | "openclaw" }
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
		Icon: IconDisk,
		title: "State on disk, not in RAM",
		body: "Chats, files, memory, sessions, crons -- all in /home/machine. Survives every sleep.",
		services: [
			{
				id: "dedalus",
				icon: { kind: "logo", mark: "dedalus" },
				name: "Dedalus Machines",
				role: "Persistent microVMs that sleep on idle and wake on demand",
				href: "https://docs.dedaluslabs.ai/dcs",
			},
			{
				id: "cloudflare",
				icon: { kind: "service", slug: "cloudflare" },
				name: "Cloudflare",
				role: "Exposes the agent gateway via quick tunnels",
				href: "https://www.cloudflare.com/products/tunnel/",
			},
			{
				id: "vercel",
				icon: { kind: "service", slug: "vercel" },
				name: "Vercel",
				role: "Hosts the Next.js dashboard + AI Gateway",
				href: "https://vercel.com",
			},
		],
	},
	{
		assembly: "pills",
		Icon: IconFleet,
		title: "Per-account fleet",
		body: "One Clerk sign-in. Same machine on every device. Keys + agent choice in private metadata.",
		services: [
			{
				id: "clerk",
				icon: { kind: "service", slug: "clerk" },
				name: "Clerk",
				role: "Per-user config, machine fleet, API key storage",
				href: "https://clerk.com",
			},
			{
				id: "anthropic",
				icon: { kind: "service", slug: "anthropic" },
				name: "Anthropic",
				role: "Claude models via direct API or Vercel AI Gateway",
				href: "https://www.anthropic.com/",
			},
			{
				id: "openai",
				icon: { kind: "service", slug: "openai" },
				name: "OpenAI",
				role: "GPT and Codex models via direct API or AI Gateway",
				href: "https://openai.com",
			},
		],
	},
	{
		assembly: "logos",
		Icon: IconToolStack,
		title: "Bring any agent + tool",
		body: "Hermes or OpenClaw. 96 skills, 23 built-ins, 17 services. Dedalus live; Sandbox + Fly shaped.",
		services: [
			{
				id: "hermes",
				icon: { kind: "logo", mark: "nous" },
				name: "Hermes",
				role: "Memory, cron, sessions, MCP host, subagents",
				href: "https://github.com/NousResearch/hermes-agent",
			},
			{
				id: "openclaw",
				icon: { kind: "logo", mark: "openclaw" },
				name: "OpenClaw",
				role: "Browser, screenshot, shell, vision, computer-use",
				href: "https://github.com/openclaw/openclaw",
			},
			{
				id: "cursor",
				icon: { kind: "logo", mark: "cursor" },
				name: "Cursor SDK",
				role: "Spawns coding agents for file edits via MCP bridge",
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
		return <Logo mark={icon.mark} size={size} />;
	}
	return <ServiceIcon slug={icon.slug} size={size} />;
}

export function StatsRow() {
	return (
		<div>
			<div className="grid grid-cols-1 gap-6 border-b border-[var(--ret-border)] px-4 py-6 md:px-5 lg:grid-cols-[1fr_1.4fr] lg:gap-8 lg:py-8">
				<div className="flex flex-col justify-center">
					<ReticleLabel>MACHINE SPEC</ReticleLabel>
					<h2 className="ret-display mt-3 text-xl tracking-tight md:text-2xl">
						What each microVM ships with out of the box.
					</h2>
				</div>
				<div className="flex flex-col gap-3">
					<SpecTerminal label="Hardware" specs={SPECS.slice(0, 3)} />
					<SpecTerminal label="Runtime" specs={SPECS.slice(3)} />
				</div>
			</div>

			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] md:grid-cols-3">
				{FEATURES.map(({ Icon, title, body, services, assembly }) => (
					<div
						key={title}
						className="flex flex-col bg-[var(--ret-bg)] p-5 md:p-6"
					>
						<div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ret-surface)] text-[var(--ret-purple)]">
							<Icon className="h-4 w-4" />
						</div>
						<h3 className="text-[15px] font-semibold tracking-tight text-[var(--ret-text)]">
							{title}
						</h3>
						<p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							{body}
						</p>
						<div className="mt-5 flex-1">
							<ServiceAssembly
								variant={assembly}
								services={services}
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/* ── Dark terminal-style spec box ── */

function SpecTerminal({
	label,
	specs,
}: {
	label: string;
	specs: ReadonlyArray<(typeof SPECS)[number]>;
}) {
	return (
		<div className="overflow-hidden rounded-xl border border-[#27272a] bg-[#18181b]">
			<div className="flex items-center border-b border-[#27272a] px-4 py-2.5">
				<span className="rounded-md bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/50">
					{label}
				</span>
			</div>
			<div
				className={cn(
					"grid divide-x divide-[#27272a]",
					specs.length <= 3
						? "grid-cols-3"
						: "grid-cols-2 sm:grid-cols-3",
				)}
			>
				{specs.map((s) => (
					<div key={s.label} className="px-4 py-4">
						<div className="flex items-center gap-1.5">
							<ToolIcon
								name={s.icon}
								size={10}
								className="text-white/30"
							/>
							<p className="text-[10px] uppercase tracking-[0.14em] text-white/35">
								{s.label}
							</p>
						</div>
						<p className="mt-1.5 text-lg font-semibold tabular-nums leading-tight text-white">
							{s.value}
						</p>
						<p className="mt-1 text-[11px] leading-snug text-white/40">
							{s.description}
						</p>
					</div>
				))}
			</div>
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

function IconDisk(props: SVGProps<SVGSVGElement>) {
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
			<ellipse cx="8" cy="4" rx="6" ry="2" />
			<path d="M2 4v8c0 1.1 2.7 2 6 2s6-.9 6-2V4" />
			<path d="M2 8c0 1.1 2.7 2 6 2s6-.9 6-2" />
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

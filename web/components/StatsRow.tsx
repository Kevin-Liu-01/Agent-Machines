import type { SVGProps } from "react";

import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
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

type Feature = {
	Icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
	title: string;
	body: string;
	services: ServiceEntry[];
};

const FEATURES: ReadonlyArray<Feature> = [
	{
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

function StackIconView({ icon }: { icon: StackIcon }) {
	if (icon.kind === "logo") {
		return <Logo mark={icon.mark} size={16} />;
	}
	return <ServiceIcon slug={icon.slug} size={16} />;
}

export function StatsRow() {
	return (
		<div>
			{/* Section header */}
			<div className="grid grid-cols-[1fr_auto] border-b border-[var(--ret-border)]">
				<div className="px-4 py-3 md:px-5">
					<ReticleLabel>MACHINE SPEC</ReticleLabel>
					<p className="mt-1 text-[12px] text-[var(--ret-text-dim)]">
						What each microVM ships with out of the box.
					</p>
				</div>
				<div className="w-20 border-l border-[var(--ret-border)] bg-[repeating-linear-gradient(135deg,var(--ret-rail)_0_1px,transparent_1px_5px)] md:w-40" />
			</div>

			{/* Spec grid */}
			<div className="grid grid-cols-2 gap-px overflow-hidden bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{SPECS.map((s) => (
					<div
						key={s.label}
						className="flex flex-col gap-1.5 bg-[var(--ret-bg)] px-4 py-3.5 transition-colors duration-150 hover:bg-[var(--ret-surface)]"
					>
						<p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<ToolIcon name={s.icon} size={11} />
							{s.label}
						</p>
						<p className="font-mono text-lg tabular-nums leading-tight text-[var(--ret-text)]">
							{s.value}
						</p>
						<p className="text-[11px] leading-snug text-[var(--ret-text-dim)]">
							{s.description}
						</p>
					</div>
				))}
			</div>

			{/* Features with nested services */}
			<div className="grid grid-cols-1 gap-px overflow-hidden bg-[var(--ret-border)] md:grid-cols-3">
				{FEATURES.map(({ Icon, title, body, services }) => (
					<div key={title} className="flex flex-col bg-[var(--ret-bg)]">
						{/* Feature header */}
						<div className="flex items-start gap-3 border-b border-[var(--ret-border)] px-4 py-3.5">
							<span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--ret-bg-soft)] text-[var(--ret-purple)]">
								<Icon className="h-4 w-4" />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-[14px] font-semibold tracking-tight text-[var(--ret-text)]">
									{title}
								</p>
								<p className="mt-1 text-[12px] leading-snug text-[var(--ret-text-dim)]">
									{body}
								</p>
							</div>
						</div>
						{/* Services under this feature */}
						<div className="flex flex-col">
							{services.map((s) => (
								<a
									key={s.id}
									href={s.href}
									target="_blank"
									rel="noreferrer"
									className="group flex items-center gap-2.5 px-4 py-2.5 transition-colors duration-150 hover:bg-[var(--ret-surface)]"
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
									<span className="shrink-0 font-mono text-[10px] text-[var(--ret-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-[var(--ret-purple)]">
										{"->"}
									</span>
								</a>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function IconDisk(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<ellipse cx="8" cy="4" rx="6" ry="2" />
			<path d="M2 4v8c0 1.1 2.7 2 6 2s6-.9 6-2V4" />
			<path d="M2 8c0 1.1 2.7 2 6 2s6-.9 6-2" />
		</svg>
	);
}

function IconFleet(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<circle cx="5" cy="11" r="2.5" />
			<path d="M7 9l6.5-6.5M11 5l1.5 1.5M9.5 6.5L11 8" />
		</svg>
	);
}

function IconToolStack(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M8 2L2 5l6 3 6-3z" />
			<path d="M2 11l6 3 6-3M2 8l6 3 6-3" />
		</svg>
	);
}

import {
	ArrowRight,
	ArrowUpRight,
} from "@/components/ui/icons";
import Link from "next/link";

import { CapabilityDiagram } from "@/components/marketing/CapabilityDiagrams";
import { PublicIcon } from "@/components/marketing/PublicIcon";
import { cn } from "@/lib/cn";
import { HARNESS } from "@/lib/platform/harness";
import { LANDING_BODY, LANDING_EYEBROW, LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, LANDING_TITLE } from "@/lib/marketing/layout";
import type { PublicIconName } from "@/lib/marketing/public-site";

type Capability = {
	title: string;
	description: string;
	meta: string;
	href: string;
	icon: PublicIconName;
	dashboardId: string;
};

type CapabilityGroup = {
	id: string;
	number: string;
	title: string;
	description: string;
	capabilities: ReadonlyArray<Capability>;
};

export const CAPABILITY_GROUPS: ReadonlyArray<CapabilityGroup> = [
	{
		id: "compose",
		number: "01",
		title: "Start with the job.",
		description: "Choose a specialist, connect its tools, and decide how it should run.",
		capabilities: [
			{
				title: "Worker recipes",
				description: "Save an agent, model, memory, tools, and schedule together as a reusable specialist template.",
				meta: "One reusable Worker recipe",
				href: "/agents",
				icon: "bot",
				dashboardId: "agent-templates",
			},
			{
				title: "Choose your agent",
				description: "Run Claude Code, Codex, OpenClaw, or Hermes from the same dashboard.",
				meta: `${HARNESS.agentRuntimeCount} agent runtimes`,
				href: "/agents",
				icon: "route",
				dashboardId: "provider-routing",
			},
			{
				title: "Choose where it runs",
				description: "Launch on E2B, Sprites, Daytona, or Vercel Sandbox, with compatible backup providers for launch failures.",
				meta: `${HARNESS.providersLive.length} providers · Primary and backups`,
				href: "/product/lifecycle",
				icon: "server",
				dashboardId: "provider-routing",
			},
			{
				title: "Connect your models",
				description: "Bring native API keys, OpenRouter, Vercel AI Gateway, or a compatible custom endpoint.",
				meta: "Your models, your credentials",
				href: "/product/model-routing",
				icon: "boxes",
				dashboardId: "model-paths",
			},
		],
	},
	{
		id: "operate",
		number: "02",
		title: "Keep work moving.",
		description: "Manage the machine, schedule recurring work, and move providers when you need to.",
		capabilities: [
			{
				title: "Machine lifecycle",
				description: "Launch, configure, repair, and retire a Worker through tracked operations. Pause and wake are available where supported.",
				meta: "Track each step from request to result",
				href: "/product/lifecycle",
				icon: "activity",
				dashboardId: "machines",
			},
			{
				title: "Pause and resume",
				description: "Pause supported machines and resume from persistent files when work is needed again.",
				meta: "Availability depends on the provider",
				href: "/product/persistent-machines",
				icon: "zap",
				dashboardId: "machines",
			},
			{
				title: "Recurring jobs",
				description: "Schedule prompts and commands, then inspect when they ran and what happened.",
				meta: "Saved schedules and run history",
				href: "/docs",
				icon: "clock",
				dashboardId: "cron",
			},
			{
				title: "Move between providers",
				description: "Drain managed work, copy durable files and state, then cut over while keeping the Worker's identity.",
				meta: "Not a transfer of running processes or RAM",
				href: "/product/lifecycle",
				icon: "git-branch",
				dashboardId: "migration",
			},
		],
	},
	{
		id: "work",
		number: "03",
		title: "Work right alongside it.",
		description: "Open the real agent, follow its progress, and inspect what it produces.",
		capabilities: [
			{
				title: "A real terminal, in your browser",
				description: "Use the agent's own command-line interface on the remote machine, with a terminal session you can reconnect to.",
				meta: "Worker-owned terminal sessions",
				href: "/product/persistent-machines",
				icon: "terminal",
				dashboardId: "terminal",
			},
			{
				title: "Chat and streaming commands",
				description: "Send a prompt or run a command and follow output as it arrives, with streaming where supported.",
				meta: "Prompts, commands, and progress",
				href: "/product/api",
				icon: "code",
				dashboardId: "console",
			},
			{
				title: "Logs and sessions",
				description: "Return to saved conversations, review command history, and inspect the machine's logs and activity.",
				meta: "Context beyond a single browser tab",
				href: "/product/api",
				icon: "message",
				dashboardId: "sessions",
			},
			{
				title: "Files and artifacts",
				description: "Find reports, screenshots, and other outputs beside the Worker that made them. Inspect its installed runtime, too.",
				meta: "See the work, not just the answer",
				href: "/product/snapshots-volumes",
				icon: "file",
				dashboardId: "artifacts",
			},
		],
	},
	{
		id: "extend",
		number: "04",
		title: "Give it the right tools.",
		description: "Add repeatable procedures, connected services, and context worth keeping.",
		capabilities: [
			{
				title: "Reusable skills",
				description: "Give a Worker written procedures it can use again, stored as versioned SKILL.md files.",
				meta: `${HARNESS.skillCount} synced skills`,
				href: "/registry",
				icon: "book",
				dashboardId: "skills",
			},
			{
				title: "Connected tools and services",
				description: "Configure MCP connections and service routes with the credentials each needs. Add Cursor delegation when available.",
				meta: `${HARNESS.mcpServerCount} MCP servers · ${HARNESS.serviceRouteCount} service routes`,
				href: "/registry",
				icon: "braces",
				dashboardId: "mcps",
			},
			{
				title: "A searchable tool catalog",
				description: "Search the MCP registry, skills.sh, npm, Cursor plugins, GitHub, and URL manifests.",
				meta: "2,595 audited items",
				href: "/registry",
				icon: "search",
				dashboardId: "registry",
			},
			{
				title: "Memory and tool bundles",
				description: "Keep instructions, agent docs, skills, and tool configuration together in a portable loadout.",
				meta: "Context that belongs to the Worker",
				href: "/docs",
				icon: "database",
				dashboardId: "loadout",
			},
		],
	},
	{
		id: "observe",
		number: "05",
		title: "See the whole fleet.",
		description: "Know what's running, review activity, and compare providers using evidence.",
		capabilities: [
			{
				title: "One view of your Workers",
				description: "See each Worker's agent, provider, status, tools, and recent activity without juggling separate provider dashboards.",
				meta: "Your fleet, in one place",
				href: "/product/api",
				icon: "layers",
				dashboardId: "machines",
			},
			{
				title: "Usage and activity",
				description: "Review recorded activity and sampled compute usage. Missing measurements stay unknown; cost estimates are labeled.",
				meta: "Machine-level and fleet-wide views",
				href: "/product/api",
				icon: "bar-chart",
				dashboardId: "usage",
			},
			{
				title: "Provider benchmarks",
				description: "Compare recorded startup, resume, command latency, and compute tests across providers.",
				meta: "Measured results, not a speed promise",
				href: "/product/lifecycle",
				icon: "cpu",
				dashboardId: "benchmarks",
			},
			{
				title: "SDK, API, and CLI",
				description: "Manage Workers from your own code with TypeScript, REST, and command-line tools.",
				meta: "Built for people and software",
				href: "/api-reference",
				icon: "braces",
				dashboardId: "api-access",
			},
		],
	},
	{
		id: "protect",
		number: "06",
		title: "Keep the important parts.",
		description: "Preserve context and files, scope credentials, and make recovery visible.",
		capabilities: [
			{
				title: "Files and context that persist",
				description: "Keep the Worker's memory, runtime files, sessions, schedules, and outputs in its persistent storage.",
				meta: "~/.agent-machines",
				href: "/product/persistent-machines",
				icon: "hard-drive",
				dashboardId: "memory",
			},
			{
				title: "Scoped credentials",
				description: "Check credential presence and model compatibility before launch. Saved account secrets are stored server-side, not returned in settings.",
				meta: "Preflight is not vendor credential validation",
				href: "/product/isolation",
				icon: "shield",
				dashboardId: "model-paths",
			},
			{
				title: "A record of every operation",
				description: "Follow lifecycle requests through a durable journal, with recorded failures and recovery steps.",
				meta: "Inspect progress and failures",
				href: "/product/lifecycle",
				icon: "activity",
				dashboardId: "machines",
			},
			{
				title: "Know what survives a pause",
				description: "See the provider's actual persistence and pause capabilities. Persistent disk does not automatically mean preserved process memory.",
				meta: "Capabilities stay explicit",
				href: "/product/snapshots-volumes",
				icon: "git-branch",
				dashboardId: "machines",
			},
		],
	},
];

const SUMMARY = [
	{ label: "Agent runtimes", value: String(HARNESS.agentRuntimeCount), icon: "bot" },
	{ label: "Sandbox providers", value: String(HARNESS.providersLive.length), icon: "server" },
	{ label: "Skills", value: String(HARNESS.skillCount), icon: "book" },
	{ label: "MCP servers", value: String(HARNESS.mcpServerCount), icon: "braces" },
] as const;

const LINK_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-purple)]";

export function CapabilityAtlas() {
	return (
		<div id="loadout" className={cn("scroll-mt-[72px] border-y border-[var(--ret-border)]/30 bg-[var(--ret-bg)]")}>
			<header className={cn(LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, "items-end")}>
				<div>
					<p className={cn(LANDING_EYEBROW)}><PublicIcon name="layers" className={cn("h-[18px] w-[18px] shrink-0")} />Worker capabilities</p>
					<h2 className={cn(LANDING_TITLE, "max-w-[18ch]")}>
						Build a Worker. Run a fleet.
					</h2>
					<p className={cn(LANDING_BODY, "mt-5 max-w-[60ch]")}>
						Choose the agent. Give it tools and a place to work. Then manage its
						sessions, schedules, files, and activity from one dashboard.
					</p>
				</div>
				<dl className={cn("grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--ret-border)]/30 pt-5 sm:grid-cols-4 lg:grid-cols-2")}>
					{SUMMARY.map((item) => (
						<div key={item.label}>
							<dt className={cn("flex items-center gap-2 text-sm text-[var(--ret-text-dim)]")}>
								<PublicIcon name={item.icon} className={cn("h-4 w-4 shrink-0 text-[var(--ret-text-muted)]")} />
								{item.label}
							</dt>
							<dd className={cn("mt-2 text-2xl font-medium tabular-nums tracking-tight text-[var(--ret-text)]")}>{item.value}</dd>
						</div>
					))}
				</dl>
			</header>

			<div>
				{CAPABILITY_GROUPS.map((group) => (
					<section
						key={group.id}
						aria-labelledby={`capability-${group.id}`}
						className={cn(LANDING_INSET, LANDING_SECTION_SPACE, "relative border-t border-[var(--ret-border)]/30")}
					>
						<header className={cn(LANDING_SPLIT, "mb-6 items-end")}>
							<h3 id={`capability-${group.id}`} className={cn("shrink-0 text-2xl font-semibold tracking-tight text-[var(--ret-text)]")}>
								{group.title}
							</h3>
							<p className={cn(LANDING_BODY, "max-w-[68ch]")}>
								{group.description}
							</p>
						</header>
						<div className={cn(LANDING_SPLIT)}>
							<CapabilityFeature group={group} capability={group.capabilities[0]} />
							<div className={cn("flex flex-col divide-y divide-[var(--ret-border)]/25")}>
								{group.capabilities.slice(1).map((capability) => (
									<CapabilityCompact key={capability.title} capability={capability} />
								))}
							</div>
						</div>
						<span className={cn("pointer-events-none absolute bottom-3 right-5 font-sans text-[40px] font-light leading-none tracking-tight text-[var(--ret-text-muted)] opacity-[0.12] md:right-8 lg:right-10")} aria-hidden="true">
							{group.number}
						</span>
					</section>
				))}
			</div>
		</div>
	);
}

function CapabilityFeature({
	group,
	capability,
}: {
	group: CapabilityGroup;
	capability: Capability;
}) {
	return (
		<Link
			href={capability.href}
			data-capability={capability.dashboardId}
			className={cn("group flex min-w-0 flex-col border border-[var(--ret-border)]/25 bg-[var(--ret-bg-soft)]/25 motion-safe:transition-[background-color,border-color] motion-safe:duration-150 focus-visible:transition-none hover:border-[var(--ret-border)]/60 hover:bg-[var(--ret-surface)]", LINK_FOCUS)}
		>
			<CapabilityDiagram id={group.id} />
			<div className={cn("mt-auto border-t border-[var(--ret-border)]/25 px-4 py-5 sm:px-6")}>
				<div className={cn("flex items-start gap-3")}>
					<PublicIcon name={capability.icon} className={cn("mt-0.5 h-5 w-5 shrink-0 text-[var(--ret-purple)]")} />
					<h4 className={cn("text-lg font-semibold tracking-tight text-[var(--ret-text)]")}>
						{capability.title}
					</h4>
				</div>
				<p className={cn(LANDING_BODY, "mt-2 max-w-[58ch]")}>{capability.description}</p>
				<div className={cn("mt-4 flex flex-wrap items-center justify-between gap-3")}>
					<span className={cn("text-[13px] leading-5 text-[var(--ret-text-muted)]")}>{capability.meta}</span>
					<span className={cn("flex items-center gap-2 text-sm font-medium text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]")}>
						Explore <ArrowRight className={cn("h-4 w-4")} aria-hidden="true" />
					</span>
				</div>
			</div>
		</Link>
	);
}

function CapabilityCompact({ capability }: { capability: Capability }) {
	return (
		<Link
			href={capability.href}
			data-capability={capability.dashboardId}
			className={cn("group flex flex-1 items-start gap-4 px-2 py-5 motion-safe:transition-[background-color] motion-safe:duration-150 focus-visible:transition-none hover:bg-[var(--ret-bg-soft)]/40 md:px-3", LINK_FOCUS)}
		>
			<PublicIcon name={capability.icon} className={cn("mt-0.5 h-5 w-5 shrink-0 text-[var(--ret-text-muted)] group-hover:text-[var(--ret-purple)]")} />
			<div className={cn("min-w-0 flex-1")}>
				<div className={cn("flex items-start justify-between gap-3")}>
					<h4 className={cn("text-lg font-semibold tracking-tight text-[var(--ret-text)]")}>{capability.title}</h4>
					<ArrowUpRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-[var(--ret-text-muted)] group-hover:text-[var(--ret-purple)]")} aria-hidden="true" />
				</div>
				<p className={cn("mt-2 max-w-[62ch] text-base leading-6 text-[var(--ret-text-dim)]")}>{capability.description}</p>
				<p className={cn("mt-2 text-[13px] leading-5 text-[var(--ret-text-muted)]")}>{capability.meta}</p>
			</div>
		</Link>
	);
}

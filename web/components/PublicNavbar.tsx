"use client";

import {
	Activity,
	ArrowRight,
	BarChart3,
	BookOpen,
	Bot,
	Boxes,
	Braces,
	ChevronDown,
	Code2,
	Cpu,
	Database,
	FileText,
	GitBranch,
	HardDrive,
	KeyRound,
	Layers,
	LifeBuoy,
	MessageSquare,
	MousePointerClick,
	Newspaper,
	Route,
	Search,
	Server,
	ShieldCheck,
	SquareTerminal,
	Terminal,
	Zap,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode } from "react";

import { BrandHomeLockup } from "@/components/BrandHomeLockup";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleNavbar } from "@/components/reticle/ReticleNavbar";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import {
	AGENT_TEMPLATES,
	NAV_AGENT_TEMPLATES,
	PRODUCT_FEATURES,
	RESOURCE_PAGES,
	type PublicIconName,
} from "@/lib/marketing/public-site";

type MenuId = "product" | "agents" | "resources";

type MenuEntry = {
	href: string;
	title: string;
	description: string;
	icon: PublicIconName;
};

type MenuGroup = {
	id: MenuId;
	label: string;
	eyebrow: string;
	title: string;
	body: string;
	cta: string;
	ctaHref: string;
	entries: ReadonlyArray<MenuEntry>;
};

const ICONS: Record<PublicIconName, LucideIcon> = {
	activity: Activity,
	"bar-chart": BarChart3,
	book: BookOpen,
	bot: Bot,
	boxes: Boxes,
	braces: Braces,
	code: Code2,
	cpu: Cpu,
	database: Database,
	file: FileText,
	"git-branch": GitBranch,
	"hard-drive": HardDrive,
	key: KeyRound,
	layers: Layers,
	"life-buoy": LifeBuoy,
	message: MessageSquare,
	mouse: MousePointerClick,
	newspaper: Newspaper,
	route: Route,
	search: Search,
	server: Server,
	shield: ShieldCheck,
	terminal: Terminal,
	zap: Zap,
};

const PRODUCT_ENTRIES: ReadonlyArray<MenuEntry> = PRODUCT_FEATURES.map((item) => ({
	href: item.href,
	title: item.navTitle,
	description: item.description,
	icon: item.icon,
}));

const AGENT_ENTRIES: ReadonlyArray<MenuEntry> = NAV_AGENT_TEMPLATES.map(
	(item) => ({
		href: item.href,
		title: item.navTitle,
		description: item.description,
		icon: item.icon,
	}),
);

const RESOURCE_ENTRIES: ReadonlyArray<MenuEntry> = RESOURCE_PAGES.map((item) => ({
	href: item.href,
	title: item.navTitle,
	description: item.description,
	icon: item.icon,
}));

const CIRCUIT_TEXTURE_SIZE = "384px 512px";

const MENU_GROUPS: ReadonlyArray<MenuGroup> = [
	{
		id: "product",
		label: "Product",
		eyebrow: "./PERSISTENCE",
		title: "A control plane for agent workers.",
		body:
			"Pair runtime, provider, model path, loadout, logs, usage, cron, and artifacts from one account.",
		cta: "Why persistence",
		ctaHref: "/product/persistent-machines",
		entries: PRODUCT_ENTRIES,
	},
	{
		id: "agents",
		label: "Workers",
		eyebrow: "./WORKERS",
		title: `${AGENT_TEMPLATES.length} workers. Four agent runtimes.`,
		body:
			"Agents are runtimes. Workers are deployable presets. Each worker stores model, provider, memory, loadout.",
		cta: "Browse workers",
		ctaHref: "/agents",
		entries: AGENT_ENTRIES,
	},
	{
		id: "resources",
		label: "Resources",
		eyebrow: "./RESOURCES",
		title: "Docs, API notes, and operator playbooks.",
		body:
			"Read the setup path, inspect the dashboard API shape, and follow notes from real agent-fleet work.",
		cta: "Read the blog",
		ctaHref: "/blog",
		entries: RESOURCE_ENTRIES,
	},
];

export function PublicNavbar({
	githubRepo,
	githubLink,
}: {
	githubRepo: string;
	githubLink?: ReactNode;
}) {
	return (
		<ReticleNavbar className="z-50">
			<div className="relative">
				<div className="relative flex h-14 items-center gap-2 px-3 sm:gap-3 md:px-4 lg:px-5">
					<BrandHomeLockup density="navbar" className="relative z-10 shrink-0" />

					<nav
						aria-label="Marketing navigation"
						className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-px border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] md:flex"
					>
						{MENU_GROUPS.map((group) => (
							<details
								key={group.id}
								name="marketing-nav"
								className="group/nav relative"
							>
								<summary className="ret-nav-trigger inline-flex h-8 cursor-pointer list-none items-center gap-1.5 px-2.5 text-[12px] font-medium text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface-hover)] hover:text-[var(--ret-text)] group-open/nav:bg-[var(--ret-surface-hover)] group-open/nav:text-[var(--ret-text)]">
									<span>{group.label}</span>
									<ChevronDown className="h-3.5 w-3.5 transition-transform duration-[var(--ret-duration-hover)] [transition-timing-function:var(--ret-ease-out)] group-open/nav:rotate-180" aria-hidden="true" />
								</summary>
								<div className="absolute left-1/2 top-full z-50 w-[min(960px,calc(100vw-32px))] -translate-x-1/2 pt-2">
									<MegaMenu group={group} githubRepo={githubRepo} />
								</div>
							</details>
						))}
						<Link
							href="/pricing"
							className="ret-nav-trigger inline-flex h-8 items-center px-2.5 text-[12px] font-medium text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface-hover)] hover:text-[var(--ret-text)]"
						>
							Pricing
						</Link>
					</nav>

					<div className="relative z-10 ml-auto hidden shrink-0 items-center gap-2 md:flex">
						{githubLink ?? (
							<a
								href={`https://github.com/${githubRepo}`}
								target="_blank"
								rel="noreferrer"
								title="GitHub"
								className="ret-nav-trigger inline-flex h-8 items-center gap-1.5 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2.5 text-[12px] font-medium text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]"
							>
								<ServiceIcon slug="github" size={12} tone="mono" />
								<span className="hidden lg:inline">GitHub</span>
							</a>
						)}
						<ThemeToggle />
						<Link
							href="/sign-in"
							className="ret-nav-trigger inline-flex h-8 items-center px-2.5 text-[12px] font-medium text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]"
						>
							Sign in
						</Link>
						<ReticleButton as="a" href="/sign-in" variant="primary" size="sm" className="h-8 px-3 text-[12px]">
							Start for free
						</ReticleButton>
					</div>

					<details className="group/mobile ml-auto md:hidden">
						<summary aria-label="Toggle navigation" className="ret-pressable inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center border border-[var(--ret-border)] text-[var(--ret-text)]">
							<ChevronDown className="h-5 w-5 transition-transform duration-[var(--ret-duration-hover)] group-open/mobile:rotate-180" />
						</summary>
						<div className="ret-popover-panel absolute inset-x-0 top-full border-t border-[var(--ret-border)] bg-[var(--ret-bg)] px-4 pb-4">
							<MobileMenu />
						</div>
					</details>
				</div>
			</div>
		</ReticleNavbar>
	);
}

function MobileMenu() {
	return (
		<div className="grid gap-3 pt-3">
			{MENU_GROUPS.map((group) => (
				<details key={group.id} name="mobile-marketing-nav" className="rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
					<summary className="ret-pressable flex min-h-12 cursor-pointer list-none items-center justify-between rounded-[var(--ret-card-radius)] px-4 text-[14px] font-semibold text-[var(--ret-text)]">
						<span>{group.label}</span>
						<ChevronDown className="ret-details-chevron h-4 w-4 text-[var(--ret-text-muted)] transition-transform duration-[var(--ret-duration-hover)]" />
					</summary>
					<div className="ret-details-content grid gap-1 border-t border-[var(--ret-border)] p-2">
						{group.entries.map((entry, index) => <MobileMenuLink key={entry.href} entry={entry} index={index} />)}
						<Link href={group.ctaHref} className="ret-pressable mt-1 inline-flex min-h-11 items-center gap-2 rounded-[var(--ret-card-radius)] px-3 text-[13px] font-semibold text-[var(--ret-text)] hover:bg-[var(--ret-surface-hover)]">
							{group.cta}<ArrowRight className="h-4 w-4" />
						</Link>
					</div>
				</details>
			))}
			<Link href="/pricing" className="ret-pressable flex min-h-12 items-center rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 text-[14px] font-semibold text-[var(--ret-text)]">Pricing</Link>
			<div className="grid grid-cols-2 gap-2 pt-1">
				<Link href="/sign-in" className="ret-pressable inline-flex min-h-12 items-center justify-center rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] text-[14px] font-semibold text-[var(--ret-text)]">Sign in</Link>
				<Link href="/sign-in" className="ret-pressable inline-flex min-h-12 items-center justify-center rounded-[var(--ret-card-radius)] bg-[var(--ret-accent)] px-4 text-[14px] font-semibold text-[var(--ret-bg)]">Start free</Link>
			</div>
		</div>
	);
}

function MegaMenu({
	group,
	githubRepo,
}: {
	group: MenuGroup;
	githubRepo: string;
}) {
	return (
		<div className="ret-mega-menu overflow-hidden rounded-[var(--ret-card-radius)] border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] shadow-[0_18px_60px_var(--ret-purple-glow)]">
			<div className="grid min-h-[328px] lg:grid-cols-[minmax(0,1fr)_300px]">
				<div className="grid gap-x-3 gap-y-2 p-4 lg:grid-cols-2">
					{group.entries.map((entry, index) => (
						<MenuLink key={entry.href} entry={entry} index={index} />
					))}
				</div>
				<div className="group/menu relative overflow-hidden border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 lg:border-l lg:border-t-0">
					<DropdownCircuitBackground />
					<div className="relative z-10 flex h-full flex-col">
						<p className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{group.eyebrow}
						</p>
						<h2 className="ret-display mt-6 max-w-[14ch] text-[20px] leading-tight text-[var(--ret-text)]">
							{group.title}
						</h2>
						<p className="mt-4 max-w-[30ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							{group.body}
						</p>
						<MenuFacts group={group} />
						<Link
							href={group.ctaHref}
							className="ret-pressable mt-auto inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 text-[13px] font-semibold text-[var(--ret-text)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)]"
						>
							{group.cta}
							<ArrowRight className="h-4 w-4" />
						</Link>
						<a
							href={`https://github.com/${githubRepo}`}
							target="_blank"
							rel="noreferrer"
							className="ret-pressable mt-3 inline-flex min-h-8 items-center gap-2 rounded-[var(--ret-card-radius)] text-[11px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
						>
							<SquareTerminal className="h-3.5 w-3.5" />
							<span>source visible</span>
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}

function MenuFacts({ group }: { group: MenuGroup }) {
	const facts =
		group.id === "agents"
			? [
				{ label: "agent", value: "runtime" },
				{ label: "worker", value: "preset" },
				{ label: "machine", value: "sandbox" },
			]
			: [
				{ label: "runtime", value: "4 lanes" },
				{ label: "provider", value: "4 lanes" },
				{ label: "state", value: "saved" },
			];

	return (
		<div className="mt-5 grid grid-cols-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] font-mono text-[10px] text-[var(--ret-text-muted)]">
			{facts.map((fact, index) => (
				<div
					key={fact.label}
					className={cn(index < facts.length - 1 && "border-r border-[var(--ret-border)]", "p-2")}
				>
					<p className="text-[var(--ret-text)]">{fact.label}</p>
					<p className="mt-1">{fact.value}</p>
				</div>
			))}
		</div>
	);
}

function DropdownCircuitBackground() {
	return (
		<>
			<div
				aria-hidden="true"
				className="ret-circuit-texture pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-multiply invert transition-opacity duration-300 group-hover/menu:opacity-[0.22] dark:opacity-[0.24] dark:mix-blend-screen dark:invert-0 dark:group-hover/menu:opacity-[0.32]"
				style={{ "--ret-circuit-size": CIRCUIT_TEXTURE_SIZE } as CSSProperties}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_0%,transparent_44%,var(--ret-bg-soft)_100%)] opacity-75"
			/>
		</>
	);
}

function MenuLink({ entry, index }: { entry: MenuEntry; index: number }) {
	const Icon = ICONS[entry.icon];
	return (
		<Link
			href={entry.href}
			className="ret-interactive-card ret-pressable ret-stagger-item group grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-[var(--ret-card-radius)] p-2.5 hover:bg-[var(--ret-surface-hover)]"
			style={{ "--item-index": index } as CSSProperties}
		>
			<span className="ret-card-icon flex h-10 w-10 items-center justify-center rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text-muted)] group-hover:border-[var(--ret-border-hover)] group-hover:text-[var(--ret-text)]">
				<Icon className="h-4 w-4" />
			</span>
			<span className="min-w-0">
				<span className="block text-[14px] font-semibold tracking-tight text-[var(--ret-text)]">
					{entry.title}
				</span>
				<span className="mt-1 block max-w-[34ch] text-[12px] leading-5 text-[var(--ret-text-dim)]">
					{entry.description}
				</span>
			</span>
		</Link>
	);
}

function MobileMenuLink({
	entry,
	index,
}: {
	entry: MenuEntry;
	index: number;
}) {
	const Icon = ICONS[entry.icon];
	return (
		<Link
			href={entry.href}
			className="ret-pressable ret-stagger-item grid min-h-12 grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-[var(--ret-card-radius)] px-3 py-2 text-[13px] text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface-hover)] hover:text-[var(--ret-text)]"
			style={{ "--item-index": index } as CSSProperties}
		>
			<Icon className="h-4 w-4 text-[var(--ret-text-muted)]" />
			<span>{entry.title}</span>
		</Link>
	);
}

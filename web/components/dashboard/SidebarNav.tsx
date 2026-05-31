"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	BarChart3,
	Bot,
	Boxes,
	ChevronLeft,
	Clock,
	Gauge,
	History,
	LayoutGrid,
	type LucideIcon,
	MessagesSquare,
	Package,
	Plug2,
	Rocket,
	ScrollText,
	Server,
	SlidersHorizontal,
	Sparkles,
	SquareTerminal,
	Store,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { PublicMachineRef } from "@/lib/user-config/schema";

/**
 * Dashboard sidebar.
 *
 * Fleet view groups top-down by frequency of use: FLEET (operate the fleet),
 * LIBRARY (what's installed), ACCOUNT (keys + provisioning). Machine view
 * splits WORK (what you do) and LIVE (what's running). Icons are lucide;
 * rows are icon + label, with section headers carrying the one-line hint.
 */

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	dot?: boolean;
	badge?: "live" | "new";
	/**
	 * Match the active state on an exact path only. Required for any row
	 * whose href is a prefix of its siblings (the section root "Overview" /
	 * "/dashboard" and the machine base) -- otherwise `startsWith` lights it
	 * up on every child route (e.g. Console highlighting Overview).
	 */
	exact?: boolean;
};

type NavSection = {
	id: string;
	label: string;
	hint: string;
	items: ReadonlyArray<NavItem>;
};

type Props = {
	setupComplete: boolean;
	machines: PublicMachineRef[];
};

// Fleet view, top-down: operate the fleet, then what's installed on it,
// then account-level keys + provisioning. "Machines" is the single fleet
// listing (the old "Containers" page folded its analytics in here).
const FLEET_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
	{ href: "/dashboard/machines", label: "Machines", icon: Server },
	{ href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
	{ href: "/dashboard/benchmarks", label: "Benchmarks", icon: Gauge, badge: "new" },
];

const LIBRARY_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/skills", label: "Skills", icon: Sparkles },
	{ href: "/dashboard/mcps", label: "MCPs", icon: Plug2 },
	{ href: "/dashboard/cron", label: "Cron", icon: Clock },
	{ href: "/dashboard/registry", label: "Registry", icon: Store, badge: "new" },
];

const ACCOUNT_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/settings", label: "Settings", icon: SlidersHorizontal },
];

const SETUP_ITEM: NavItem = {
	href: "/dashboard/setup",
	label: "Setup",
	icon: Rocket,
};

function machineWorkItems(base: string): ReadonlyArray<NavItem> {
	return [
		{ href: base, label: "Overview", icon: LayoutGrid, exact: true },
		{ href: `${base}/console`, label: "Console", icon: MessagesSquare, badge: "new" },
		{ href: `${base}/terminal`, label: "Terminal", icon: SquareTerminal },
		{ href: `${base}/agents`, label: "Agents", icon: Bot },
		{ href: `${base}/loadout`, label: "Loadout", icon: Boxes },
	];
}

function machineLiveItems(base: string): ReadonlyArray<NavItem> {
	return [
		{ href: `${base}/logs`, label: "Logs", icon: ScrollText, badge: "live" },
		{ href: `${base}/sessions`, label: "Sessions", icon: History, badge: "live" },
		{ href: `${base}/artifacts`, label: "Artifacts", icon: Package },
	];
}

const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;

export function SidebarNav({ setupComplete, machines }: Props) {
	const pathname = usePathname();
	const machineMatch = MACHINE_PATH_RE.exec(pathname);

	if (machineMatch) {
		const machineId = machineMatch[1];
		const machine = machines.find((m) => m.id === machineId);
		const machineName = machine?.name ?? machineId.slice(0, 12);
		const base = `/dashboard/machines/${machineId}`;
		const sections: NavSection[] = [
			{ id: "work", label: "WORK", hint: "what you do", items: machineWorkItems(base) },
			{ id: "live", label: "LIVE", hint: "what's running", items: machineLiveItems(base) },
		];
		return (
			<nav
				aria-label="Machine dashboard"
				className="flex flex-col gap-5 px-3 pb-6 pt-4 text-[13px]"
			>
				<Link
					href="/dashboard/machines"
					className="group flex items-center gap-2 px-3 pb-1 text-[11px] text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-text)]"
				>
					<ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
					<span className="truncate">Fleet</span>
				</Link>
				<div className="px-3">
					<p
						className="truncate text-[18px] leading-none tracking-tight text-[var(--ret-text)]"
						style={{ fontFamily: "var(--font-display-serif)" }}
					>
						{machineName}
					</p>
					<p className="mt-1 font-mono text-[9px] text-[var(--ret-text-muted)]">
						{machineId.slice(0, 18)}
					</p>
				</div>
				{sections.map((section) => (
					<Section key={section.id} section={section} pathname={pathname} />
				))}
			</nav>
		);
	}

	const setupItem: NavItem = { ...SETUP_ITEM, dot: !setupComplete };
	const sections: NavSection[] = [
		{ id: "fleet", label: "FLEET", hint: "your fleet", items: FLEET_ITEMS },
		{ id: "library", label: "LIBRARY", hint: "what's installed", items: LIBRARY_ITEMS },
		{
			id: "account",
			label: "ACCOUNT",
			hint: "keys & config",
			items: [...ACCOUNT_ITEMS, setupItem],
		},
	];

	return (
		<nav
			aria-label="Dashboard"
			className="flex flex-col gap-5 px-3 pb-6 pt-4 text-[13px]"
		>
			{sections.map((section) => (
				<Section key={section.id} section={section} pathname={pathname} />
			))}
		</nav>
	);
}

function Section({
	section,
	pathname,
}: {
	section: NavSection;
	pathname: string;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-baseline justify-between gap-2 px-3 pb-1.5">
				{/* Section headers stay mono+tracked-uppercase: that's
				    the kicker pattern, not body copy. */}
				<p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					{section.label}
				</p>
				<p className="text-[10px] italic text-[var(--ret-text-muted)]">
					{section.hint}
				</p>
			</div>
			{section.items.map((item) => {
				const active = item.exact
					? pathname === item.href
					: pathname === item.href || pathname.startsWith(`${item.href}/`);
				return <Row key={item.href} item={item} active={active} />;
			})}
		</div>
	);
}

function Row({ item, active }: { item: NavItem; active: boolean }) {
	const Icon = item.icon;
	return (
		<Link
			href={item.href}
			aria-current={active ? "page" : undefined}
			className={cn(
				"group relative flex items-center gap-3 px-3 py-1.5 transition-colors",
				active
					? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
			)}
		>
			{/* Left rail accent so the active row reads at a glance even
			    on dense screens where the wash is subtle. */}
			<span
				aria-hidden="true"
				className={cn(
					"absolute inset-y-0 left-0 w-px",
					active ? "bg-[var(--ret-purple)]" : "bg-transparent",
				)}
			/>
			<Icon
				strokeWidth={1.75}
				className={cn(
					"h-3.5 w-3.5 shrink-0",
					active
						? "text-[var(--ret-purple)]"
						: "text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text-dim)]",
				)}
			/>
			<span className="flex-1 truncate">{item.label}</span>
			{item.dot ? (
				<span
					aria-label="needs setup"
					className="h-1.5 w-1.5 shrink-0 bg-[var(--ret-amber)]"
				/>
			) : null}
			{item.badge === "live" ? (
				<span className="flex shrink-0 items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					<span
						aria-hidden="true"
						className="h-1 w-1 animate-pulse rounded-full bg-[var(--ret-green)]"
					/>
					live
				</span>
			) : null}
			{item.badge === "new" ? (
				<span className="shrink-0 border border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] px-1 text-[8px] uppercase tracking-[0.22em] text-[var(--ret-purple)]">
					new
				</span>
			) : null}
		</Link>
	);
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Activity,
	BarChart3,
	Bot,
	Boxes,
	Brain,
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
	UsersRound,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { AgentKind, PublicMachineRef } from "@/lib/user-config/schema";

import { AgentSwitcher } from "./AgentSwitcher";
import { MachineSwitcher } from "./MachineSwitcher";
import { ModelSwitcher } from "./ModelSwitcher";

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
	{ href: "/dashboard/workers", label: "Workers", icon: UsersRound, badge: "new" },
	{ href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
	{ href: "/dashboard/benchmarks", label: "Benchmarks", icon: Gauge, badge: "new" },
];

const LIBRARY_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/memory", label: "Memory", icon: Brain, badge: "new" },
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
		{ href: `${base}/view`, label: "View", icon: Activity, badge: "live" },
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
				className="flex min-w-0 flex-col gap-5 overflow-x-hidden px-3 pb-6 pt-4 text-[13px]"
			>
				<MachineScopeHeader
					machineId={machineId}
					machineName={machineName}
					machine={machine}
					machines={machines}
				/>
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
			className="flex min-w-0 flex-col gap-5 overflow-x-hidden px-3 pb-6 pt-4 text-[13px]"
		>
			{sections.map((section) => (
				<Section key={section.id} section={section} pathname={pathname} />
			))}
		</nav>
	);
}

export function MobileDashboardNav({ setupComplete, machines }: Props) {
	const pathname = usePathname();
	const machineMatch = MACHINE_PATH_RE.exec(pathname);
	const setupItem: NavItem = { ...SETUP_ITEM, dot: !setupComplete };

	const items: ReadonlyArray<NavItem> = machineMatch
		? [
				{
					href: "/dashboard/machines",
					label: "Fleet",
					icon: ChevronLeft,
					exact: true,
				},
				...machineWorkItems(`/dashboard/machines/${machineMatch[1]}`),
				...machineLiveItems(`/dashboard/machines/${machineMatch[1]}`),
			]
		: [
				...FLEET_ITEMS,
				...LIBRARY_ITEMS,
				...ACCOUNT_ITEMS,
				setupItem,
			];

	return (
		<nav
			aria-label={machineMatch ? "Machine dashboard sections" : "Dashboard sections"}
			className="border-b border-[var(--ret-border)] bg-[var(--ret-bg)] lg:hidden"
		>
			<div className="ret-scrollbar-hidden flex gap-px overflow-x-auto px-2 py-2">
				{items.map((item) => {
					const active = item.exact
						? pathname === item.href
						: pathname === item.href || pathname.startsWith(`${item.href}/`);
					return <MobileRow key={item.href} item={item} active={active} />;
				})}
			</div>
		</nav>
	);
}

function MachineScopeHeader({
	machineId,
	machineName,
	machine,
	machines,
}: {
	machineId: string;
	machineName: string;
	machine: PublicMachineRef | undefined;
	machines: PublicMachineRef[];
}) {
	const activeAgent = machine?.agentKind ?? ("hermes" satisfies AgentKind);

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<Link
				href="/dashboard/machines"
				className="group flex items-center gap-2 px-3 pb-1 text-[11px] text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-text)]"
			>
				<ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
				<span className="truncate">Fleet</span>
			</Link>

			<div className="min-w-0 px-3">
				<p
					className="block max-w-full truncate text-[18px] leading-none tracking-tight text-[var(--ret-text)]"
					style={{ fontFamily: "var(--font-display-serif)" }}
					title={machineName}
				>
					{machineName}
				</p>
				<p className="mt-1 truncate font-mono text-[9px] text-[var(--ret-text-muted)]">
					{machineId.slice(0, 18)}
				</p>
			</div>

			<div className="grid min-w-0 gap-1.5 border-y border-[var(--ret-border)] px-2 py-3">
				<ModelSwitcher activeMachineId={machineId} surface="sidebar" />
				<MachineSwitcher currentMachineId={machineId} surface="sidebar" />
				<AgentSwitcher
					value={activeAgent}
					activeMachineId={machineId}
					machines={machines}
					surface="sidebar"
				/>
			</div>
		</div>
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

function MobileRow({ item, active }: { item: NavItem; active: boolean }) {
	const Icon = item.icon;
	return (
		<Link
			href={item.href}
			aria-current={active ? "page" : undefined}
			className={cn(
				"group flex min-h-11 shrink-0 items-center gap-2 border px-3 text-[12px] transition-colors",
				active
					? "border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]",
			)}
		>
			<Icon
				strokeWidth={1.75}
				className={cn(
					"h-4 w-4 shrink-0",
					active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]",
				)}
			/>
			<span className="whitespace-nowrap">{item.label}</span>
			{item.dot ? (
				<span
					aria-label="needs setup"
					className="h-1.5 w-1.5 shrink-0 bg-[var(--ret-amber)]"
				/>
			) : null}
			{item.badge === "live" ? (
				<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ret-green)]" aria-label="live" />
			) : null}
			{item.badge === "new" ? (
				<span className="shrink-0 border border-[var(--ret-purple)]/45 px-1 font-mono text-[8px] uppercase tracking-[0.18em]">
					new
				</span>
			) : null}
		</Link>
	);
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Activity,
	BarChart3,
	Boxes,
	ChevronDown,
	ChevronLeft,
	Clock,
	History,
	LayoutGrid,
	type LucideIcon,
	Rocket,
	Server,
	SlidersHorizontal,
	UsersRound,
} from "@/components/ui/icons";

import { cn } from "@/lib/cn";
import type { AgentKind, PublicMachineRef } from "@/lib/user-config/schema";

import { AgentSwitcher } from "./AgentSwitcher";
import { MachineSwitcher } from "./MachineSwitcher";
import { ModelSwitcher } from "./ModelSwitcher";

/** Six fleet workspaces. Detailed tools live inside their owning workspace. */

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	dot?: boolean;
	badge?: "live";
	/**
	 * Match the active state on an exact path only. Required for any row
	 * whose href is a prefix of its siblings (the section root "Overview" /
	 * "/dashboard" and the machine base) -- otherwise `startsWith` lights it
	 * up on every child route (e.g. Console highlighting Overview).
	 */
	exact?: boolean;
	aliases?: readonly string[];
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
	compact?: boolean;
	onExpand?: () => void;
};

// Keep the rail small; aliases preserve active context for existing deep links.
const FLEET_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
	{ href: "/dashboard/machines", label: "Workspaces", icon: Server, aliases: ["/dashboard/chat", "/dashboard/terminal", "/dashboard/logs", "/dashboard/sessions", "/dashboard/artifacts"] },
	{ href: "/dashboard/agents", label: "Studio", icon: UsersRound, aliases: ["/dashboard/workers", "/dashboard/memory"] },
	{ href: "/dashboard/registry", label: "Toolkit", icon: Boxes, aliases: ["/dashboard/skills", "/dashboard/mcps", "/dashboard/loadout", "/dashboard/components"] },
	{ href: "/dashboard/cron", label: "Automations", icon: Clock },
	{ href: "/dashboard/usage", label: "Insights", icon: BarChart3, aliases: ["/dashboard/benchmarks"] },
];

const ACCOUNT_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/setup", label: "Quickstart", icon: Rocket },
	{ href: "/dashboard/settings", label: "Settings", icon: SlidersHorizontal },
];

const SETUP_ITEM: NavItem = {
	href: "/dashboard/setup",
	label: "Quickstart",
	icon: Rocket,
};

function machineWorkItems(base: string): ReadonlyArray<NavItem> {
	return [
		{ href: base, label: "Overview", icon: LayoutGrid, exact: true },
		{ href: `${base}/view`, label: "Workbench", icon: Activity, aliases: [`${base}/console`, `${base}/terminal`] },
		{ href: `${base}/loadout`, label: "Tools & runtime", icon: Boxes, aliases: [`${base}/agents`] },
	];
}

function machineLiveItems(base: string): ReadonlyArray<NavItem> {
	return [
		{ href: `${base}/logs`, label: "Activity & files", icon: History, aliases: [`${base}/sessions`, `${base}/artifacts`] },
	];
}

function matchesItem(pathname: string, item: NavItem) {
	return [item.href, ...(item.aliases ?? [])].some(href => pathname === href || pathname.startsWith(`${href}/`));
}

const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;

export function SidebarNav({ setupComplete, machines, compact = false, onExpand }: Props) {
	const pathname = usePathname();
	const machineMatch = MACHINE_PATH_RE.exec(pathname);

	if (machineMatch) {
		const machineId = machineMatch[1];
		const machine = machines.find((m) => m.id === machineId);
		const machineName = machine?.name ?? machineId.slice(0, 12);
		const base = `/dashboard/machines/${machineId}`;
		const sections: NavSection[] = [
			{ id: "work", label: "Work", hint: "Workspace", items: machineWorkItems(base) },
			{ id: "live", label: "Live", hint: "Runtime activity", items: machineLiveItems(base) },
		];
		return (
			<nav
				aria-label="Machine dashboard"
				className={cn("flex min-w-0 flex-col overflow-x-hidden pb-5 pt-3 text-sm", compact ? "gap-3 px-2" : "gap-5 px-3")}
			>
				{compact ? (
					<button type="button" onClick={onExpand} aria-label={`Show controls for ${machineName}`} title={`Show controls for ${machineName}`} className={cn("grid min-h-10 place-items-center rounded-sm text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]")}>
						<SlidersHorizontal className={cn("size-[18px]")} aria-hidden="true" />
					</button>
				) : <MachineScopeHeader
					machineId={machineId}
					machineName={machineName}
					machine={machine}
					machines={machines}
				/>}
				{sections.map((section) => (
					<Section key={section.id} section={section} pathname={pathname} compact={compact} />
				))}
			</nav>
		);
	}

	const setupItem: NavItem = { ...SETUP_ITEM, dot: !setupComplete };
	const sections: NavSection[] = [
		{ id: "fleet", label: "Workspace", hint: "", items: FLEET_ITEMS.map(item => item.href === setupItem.href ? setupItem : item) },
		{
			id: "account",
			label: "Account",
			hint: "Keys & setup",
			items: ACCOUNT_ITEMS.map(item => item.href === setupItem.href ? setupItem : item),
		},
	];

	return (
		<nav
			aria-label="Dashboard"
			className={cn("flex min-w-0 flex-col overflow-x-hidden pb-5 pt-3 text-sm", compact ? "gap-3 px-2" : "gap-5 px-3")}
		>
			{sections.map((section) => (
				<Section key={section.id} section={section} pathname={pathname} compact={compact} />
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
				...FLEET_ITEMS.map(item => item.href === setupItem.href ? setupItem : item),
				...ACCOUNT_ITEMS.map(item => item.href === setupItem.href ? setupItem : item),
			];
	const activeItem = items.find(item => item.exact ? pathname === item.href : matchesItem(pathname, item));

	return (
		<nav
			aria-label={machineMatch ? "Machine dashboard sections" : "Dashboard sections"}
			className={cn("min-w-0 max-w-full overflow-hidden border-b border-[var(--ret-border)] bg-[var(--ret-bg)] lg:hidden")}
		>
			<details key={pathname} className={cn("group/mobile-navigation px-[var(--dashboard-gutter,16px)]")}>
				<summary className={cn("flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-text)] [&::-webkit-details-marker]:hidden")}>
					<span className={cn("flex min-w-0 items-center gap-2")}><LayoutGrid className={cn("size-4 shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" /><span className={cn("truncate")}>{activeItem?.label ?? "Workspace navigation"}</span></span>
					<span className={cn("flex shrink-0 items-center gap-2 text-[var(--ret-text-muted)]")}>Navigate <ChevronDown className={cn("size-4 group-open/mobile-navigation:rotate-180")} aria-hidden="true" /></span>
				</summary>
			<div className={cn("grid max-h-[65dvh] grid-cols-2 gap-1 overflow-y-auto overscroll-contain border-t border-[var(--ret-border)] py-3")}>
				{items.map((item) => {
					const active = item.exact
						? pathname === item.href
						: matchesItem(pathname, item);
					return <MobileRow key={item.href} item={item} active={active} />;
				})}
			</div>
			</details>
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
				className={cn("group flex min-h-9 items-center gap-2 rounded-sm px-3 text-sm text-[var(--ret-text-muted)] transition-[color,background-color] duration-150 ease-[var(--ret-ease-out)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)] focus-visible:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none")}
			>
				<ChevronLeft className={cn("size-4 shrink-0")} strokeWidth={1.75} aria-hidden="true" />
				<span className="truncate">Fleet</span>
			</Link>

			<div className="min-w-0 px-3">
				<p
					className={cn("block max-w-full truncate text-lg font-semibold leading-6 tracking-tight text-[var(--ret-text)]")}
					title={machineName}
				>
					{machineName}
				</p>
				<p className={cn("mt-1 truncate font-mono text-xs leading-5 text-[var(--ret-text-muted)]")}>
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
	compact,
}: {
	section: NavSection;
	pathname: string;
	compact: boolean;
}) {
	return (
		<div role="group" aria-label={section.label} className={cn("flex flex-col gap-0.5", compact && "border-t border-[var(--ret-border)]/60 pt-3 first:border-t-0 first:pt-0")}>
			<div className={cn(compact ? "sr-only" : "flex items-baseline justify-between gap-2 px-2 pb-1.5")}>
				<p className={cn("text-xs font-medium text-[var(--ret-text-muted)]")}>
					{section.label}
				</p>
				<p className={cn("text-xs leading-5 text-[var(--ret-text-muted)]")}>
					{section.hint}
				</p>
			</div>
			{section.items.map((item) => {
				const active = item.exact
					? pathname === item.href
					: matchesItem(pathname, item);
				return <Row key={item.href} item={item} active={active} compact={compact} />;
			})}
		</div>
	);
}

function Row({ item, active, compact }: { item: NavItem; active: boolean; compact: boolean }) {
	const Icon = item.icon;
	return (
		<Link
			href={item.href}
			aria-current={active ? "page" : undefined}
			title={compact ? `${item.label}${item.dot ? " · Needs setup" : ""}` : undefined}
			className={cn(
				"group relative flex items-center gap-2.5 rounded-md py-2 transition-[color,background-color] duration-150 ease-[var(--ret-ease-out)]",
				compact ? "min-h-10 justify-center px-2" : "min-h-9 px-2",
				"focus-visible:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none",
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
				aria-hidden="true"
				strokeWidth={1.75}
				className={cn(
					"size-[18px] shrink-0",
					active
						? "text-[var(--ret-purple)]"
						: "text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text-dim)]",
				)}
			/>
			<span className={cn(compact ? "sr-only" : "flex-1 truncate")}>{item.label}</span>
			{item.dot ? (
				<>
					<span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full bg-[var(--ret-amber)]", compact && "absolute right-2 top-2")} />
					<span className={cn("sr-only")}>Needs setup</span>
				</>
			) : null}
			{item.badge === "live" ? (
				<span className={cn("flex shrink-0 items-center gap-1.5 text-xs text-[var(--ret-text-muted)]", compact && "absolute right-2 top-2")}>
					<span
						aria-hidden="true"
						className={cn("size-1 rounded-full bg-[var(--ret-green)]")}
					/>
					<span className={cn(compact && "sr-only")}>Live</span>
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
				"group flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-2 text-sm transition-[color,background-color,border-color] duration-150 ease-[var(--ret-ease-out)]",
				"focus-visible:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none",
				active
					? "border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-transparent text-[var(--ret-text-dim)] hover:bg-[var(--ret-bg-soft)] hover:text-[var(--ret-text)]",
			)}
		>
			<Icon
				aria-hidden="true"
				strokeWidth={1.75}
				className={cn(
					"h-4 w-4 shrink-0",
					active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]",
				)}
			/>
			<span className="truncate">{item.label}</span>
			{item.dot ? (
				<>
					<span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full bg-[var(--ret-amber)]")} />
					<span className={cn("sr-only")}>Needs setup</span>
				</>
			) : null}
			{item.badge === "live" ? (
				<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ret-green)]" aria-label="live" />
			) : null}
		</Link>
	);
}

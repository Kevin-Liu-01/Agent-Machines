"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Dashboard sidebar.
 *
 * Three sections, top-down by frequency of use:
 *
 *   work     -- the surfaces a user opens during a session: overview,
 *               chat, terminal, loadout.
 *   live     -- read-only telemetry that updates while the machine
 *               is awake: logs, sessions, cursor runs, artifacts.
 *   config   -- machines / skills / mcps / setup -- things you tweak
 *               occasionally, not every session.
 *
 * Rows are icon + label only; the chatty per-row hints from the prior
 * design moved into the section headers (one descriptor per group).
 * Active row gets the purple wash, hover swaps the surface, and the
 * "needs setup" dot still rides on Setup until a machine exists.
 */

type NavItem = {
	href: string;
	label: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	dot?: boolean;
	badge?: "live" | "new";
};

type NavSection = {
	id: string;
	label: string;
	hint: string;
	items: ReadonlyArray<NavItem>;
};

import type { PublicMachineRef } from "@/lib/user-config/schema";

type Props = {
	setupComplete: boolean;
	machines: PublicMachineRef[];
};

// Fleet view, top-down: operate the fleet, then what's installed on it,
// then account-level keys + provisioning. "Machines" is the single fleet
// listing (the old "Containers" page folded its analytics in here).
const FLEET_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard", label: "Overview", icon: IconGrid },
	{ href: "/dashboard/machines", label: "Machines", icon: IconStack },
	{ href: "/dashboard/usage", label: "Usage", icon: IconWave },
	{ href: "/dashboard/benchmarks", label: "Benchmarks", icon: IconGauge, badge: "new" },
];

const LIBRARY_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/skills", label: "Skills", icon: IconScroll },
	{ href: "/dashboard/mcps", label: "MCPs", icon: IconPlug },
	{ href: "/dashboard/cron", label: "Cron", icon: IconClock },
	{ href: "/dashboard/registry", label: "Registry", icon: IconStore, badge: "new" },
];

const ACCOUNT_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/settings", label: "Settings", icon: IconSliders },
];

const SETUP_ITEM: NavItem = {
	href: "/dashboard/setup",
	label: "Setup",
	icon: IconKey,
};

function machineWorkItems(base: string): ReadonlyArray<NavItem> {
	return [
		{ href: base, label: "Overview", icon: IconGrid },
		{ href: `${base}/console`, label: "Console", icon: IconConsole, badge: "new" },
		{ href: `${base}/terminal`, label: "Terminal", icon: IconTerminal },
		{ href: `${base}/loadout`, label: "Loadout", icon: IconLoadout },
	];
}

function machineLiveItems(base: string): ReadonlyArray<NavItem> {
	return [
		{ href: `${base}/logs`, label: "Logs", icon: IconWave, badge: "live" },
		{ href: `${base}/sessions`, label: "Sessions", icon: IconRows, badge: "live" },
		{ href: `${base}/cursor`, label: "Cursor runs", icon: IconBolt, badge: "live" },
		{ href: `${base}/artifacts`, label: "Artifacts", icon: IconBox },
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
					<IconBack className="h-3 w-3 shrink-0" />
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
				const active =
					pathname === item.href ||
					(item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
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

/* --------------------------------------------------------------------- */
/* Inline icons                                                          */
/* --------------------------------------------------------------------- */

function IconGrid(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<rect x="2" y="2" width="5" height="5" />
			<rect x="9" y="2" width="5" height="5" />
			<rect x="2" y="9" width="5" height="5" />
			<rect x="9" y="9" width="5" height="5" />
		</svg>
	);
}

function IconSliders(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
			<path d="M3 4 h7 M12.5 4 h0.5 M3 8 h1.5 M7 8 h6 M3 12 h4 M9.5 12 h3.5" />
			<circle cx="11" cy="4" r="1.4" />
			<circle cx="5.5" cy="8" r="1.4" />
			<circle cx="8" cy="12" r="1.4" />
		</svg>
	);
}

function IconTerminal(props: SVGProps<SVGSVGElement>) {
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
			<rect x="1.5" y="2.5" width="13" height="11" />
			<path d="M4 6 l2 2 -2 2 M8 11 h4" />
		</svg>
	);
}

function IconScroll(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<path d="M3 3 h8 v10 h-8 z" />
			<path d="M5 6 h4 M5 8 h4 M5 10 h2" />
		</svg>
	);
}

function IconPlug(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<path d="M6 2 v3 M10 2 v3" />
			<rect x="4" y="5" width="8" height="4" rx="1" />
			<path d="M8 9 v5" />
		</svg>
	);
}

function IconRows(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<path d="M2 4 h12 M2 8 h12 M2 12 h12" />
		</svg>
	);
}

function IconWave(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<path d="M2 8 q2 -4 4 0 t4 0 t4 0" />
		</svg>
	);
}

function IconBolt(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...props}>
			<path d="M9 2 L4 9 h4 l-1 5 l5 -7 h-4 z" />
		</svg>
	);
}

function IconClock(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<circle cx="8" cy="8" r="5.5" />
			<path d="M8 5v3.5l2 1.5" />
		</svg>
	);
}

function IconKey(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<circle cx="11" cy="5" r="2.5" />
			<path d="M9 7 L3 13 M5 11 L7 13 M3 13 L4.5 14.5" />
		</svg>
	);
}

function IconStack(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<rect x="2" y="3" width="12" height="3" />
			<rect x="2" y="7" width="12" height="3" />
			<rect x="2" y="11" width="12" height="3" />
		</svg>
	);
}

function IconBox(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<path d="M2 5 L8 2 L14 5 V11 L8 14 L2 11 Z" />
			<path d="M2 5 L8 8 L14 5 M8 8 V14" />
		</svg>
	);
}

function IconStore(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M2 6 L2 13 H14 V6" />
			<path d="M1 3 H15 V6 H1 Z" />
			<path d="M6 9 H10 V13 H6 Z" />
		</svg>
	);
}

function IconBack(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M10 3 L5 8 L10 13" />
		</svg>
	);
}

function IconConsole(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="1" y="2" width="14" height="12" rx="1" />
			<path d="M1 5 h14" />
			<path d="M4 8 l2 2 -2 2" />
			<path d="M9 12 h4" />
		</svg>
	);
}

function IconGauge(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M2.5 12 a5.5 5.5 0 1 1 11 0" />
			<path d="M8 9.5 L11 6" />
			<circle cx="8" cy="11.5" r="0.6" fill="currentColor" stroke="none" />
		</svg>
	);
}

function IconLoadout(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<rect x="2" y="2" width="4" height="4" />
			<rect x="10" y="2" width="4" height="4" />
			<rect x="2" y="10" width="4" height="4" />
			<rect x="10" y="10" width="4" height="4" />
			<path d="M6 4 H10 M6 12 H10 M4 6 V10 M12 6 V10" />
		</svg>
	);
}

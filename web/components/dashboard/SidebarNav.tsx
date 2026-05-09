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
	id: "work" | "live" | "config";
	label: string;
	hint: string;
	items: ReadonlyArray<NavItem>;
};

type Props = {
	setupComplete: boolean;
};

const WORK_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard", label: "Overview", icon: IconGrid },
	{ href: "/dashboard/chat", label: "Chat", icon: IconChat },
	{ href: "/dashboard/terminal", label: "Terminal", icon: IconTerminal, badge: "new" },
	{ href: "/dashboard/loadout", label: "Loadout", icon: IconLoadout },
];

const LIVE_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/logs", label: "Logs", icon: IconWave, badge: "live" },
	{ href: "/dashboard/sessions", label: "Sessions", icon: IconRows, badge: "live" },
	{ href: "/dashboard/cursor", label: "Cursor runs", icon: IconBolt, badge: "live" },
	{ href: "/dashboard/artifacts", label: "Artifacts", icon: IconBox },
];

const CONFIG_ITEMS: ReadonlyArray<NavItem> = [
	{ href: "/dashboard/machines", label: "Machines", icon: IconStack },
	{ href: "/dashboard/skills", label: "Skills", icon: IconScroll },
	{ href: "/dashboard/mcps", label: "MCPs", icon: IconPlug },
];

const SETUP_ITEM: NavItem = {
	href: "/dashboard/setup",
	label: "Setup",
	icon: IconKey,
};

export function SidebarNav({ setupComplete }: Props) {
	const pathname = usePathname();
	const setupItem: NavItem = { ...SETUP_ITEM, dot: !setupComplete };
	const sections: NavSection[] = [
		{ id: "work", label: "WORK", hint: "what you do", items: WORK_ITEMS },
		{
			id: "live",
			label: "LIVE",
			hint: "what's running",
			items: LIVE_ITEMS,
		},
		{
			id: "config",
			label: "CONFIG",
			hint: "what you've installed",
			items: [...CONFIG_ITEMS, setupItem],
		},
	];

	return (
		<nav
			aria-label="Dashboard"
			className="flex flex-col gap-5 px-3 pb-6 pt-5 font-mono text-[13px]"
		>
			<header className="px-3 pb-1">
				<p className="text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text)]">
					Dashboard
				</p>
				<p className="mt-0.5 text-[10px] text-[var(--ret-text-muted)]">
					machine telemetry + control
				</p>
			</header>
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
				<p className="text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					{section.label}
				</p>
				<p className="text-[9px] text-[var(--ret-text-muted)]">
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

function IconChat(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
			<path d="M2 4 a2 2 0 0 1 2 -2 h8 a2 2 0 0 1 2 2 v5 a2 2 0 0 1 -2 2 H7 l-3 3 v-3 H4 a2 2 0 0 1 -2 -2 z" />
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

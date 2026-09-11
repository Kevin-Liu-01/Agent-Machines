"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { BookOpen, ChevronLeft, ChevronRight, MessageSquare } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { DASHBOARD_SHELL_HEADER_ROW } from "@/lib/dashboard/shell-chrome";
import type { PublicMachineRef } from "@/lib/user-config/schema";

import { MobileDashboardNav, SidebarNav } from "./SidebarNav";
import { StatusHeader } from "./StatusHeader";

/** A compact custom rail; expansion never hides or replaces a destination. */
export function DashboardChrome({ children, machines, setupComplete }: {
	children: ReactNode;
	machines: PublicMachineRef[];
	setupComplete: boolean;
}) {
	const [expanded, setExpanded] = useState(true);
	const ToggleIcon = expanded ? ChevronLeft : ChevronRight;

	return (
		<div data-dashboard-chrome data-sidebar-expanded={expanded} className={cn(
			"dashboard-chrome dashboard-workspace relative grid min-h-[100dvh] grid-cols-1 bg-[var(--ret-bg)] text-sm [--dashboard-gutter:16px] [--ret-border:color-mix(in_srgb,var(--ret-text)_10%,transparent)] sm:[--dashboard-gutter:24px] max-lg:overflow-x-clip",
			expanded ? "lg:grid-cols-[208px_minmax(0,1fr)]" : "lg:grid-cols-[72px_minmax(0,1fr)]",
		)}>
			<aside aria-label="Sidebar" className={cn("sticky top-0 z-30 hidden h-[100dvh] min-w-0 self-start border-r border-[var(--ret-border)]/70 bg-[var(--ret-bg-soft)] lg:flex lg:flex-col")}>
				<div data-sidebar-header className={cn(DASHBOARD_SHELL_HEADER_ROW, "gap-1 px-2")}>
					<Link href="/" aria-label="Agent Machines home" title="Agent Machines home" className={cn("flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>
						<Logo mark="am" size={24} />
						{expanded && <span className={cn("truncate text-sm font-semibold tracking-tight")}>Agent Machines</span>}
					</Link>
					<button type="button" aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"} title={expanded ? "Collapse sidebar" : "Expand sidebar"} aria-expanded={expanded} aria-controls="desktop-dashboard-navigation" onClick={() => setExpanded(value => !value)} className={cn("grid size-7 shrink-0 place-items-center rounded-sm text-[var(--ret-text-muted)] transition-colors duration-150 hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)] motion-reduce:transition-none")}>
						<ToggleIcon className={cn("size-4")} aria-hidden="true" />
					</button>
				</div>
				<div id="desktop-dashboard-navigation" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
					<SidebarNav setupComplete={setupComplete} machines={machines} compact={!expanded} onExpand={() => setExpanded(true)} />
				</div>
				<div className={cn("space-y-1 border-t border-[var(--ret-border)] p-3")}>
					{[{ href: "/docs", label: "Documentation", icon: BookOpen }, { href: "/contact", label: "Help & feedback", icon: MessageSquare }].map(({ href, label, icon: Icon }) => (
						<Link key={href} href={href} title={label} className={cn("flex min-h-9 items-center gap-2.5 rounded-md px-2 text-sm text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-[var(--ret-text)]", !expanded && "justify-center")}>
							<Icon className={cn("size-4 shrink-0")} aria-hidden="true" /><span className={cn(!expanded && "sr-only")}>{label}</span>
						</Link>
					))}
				</div>
			</aside>
			<div className={cn("relative z-10 flex min-h-[100dvh] min-w-0 flex-col bg-[var(--ret-bg)]")}>
				<StatusHeader machines={machines} />
				<MobileDashboardNav setupComplete={setupComplete} machines={machines} />
				<main id="dashboard-content" tabIndex={-1} className={cn("mx-auto w-full min-w-0 max-w-[1440px] flex-1 scroll-mt-32 pb-12 focus:outline-none")}>{children}</main>
			</div>
		</div>
	);
}

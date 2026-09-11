"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
	Activity,
	ArrowUpRight,
	BarChart3,
	Bot,
	Brain,
	Clock3,
	CloudCog,
	FileOutput,
	Gauge,
	History,
	MessagesSquare,
	PackageOpen,
	Plug2,
	Route,
	Search,
	ServerCog,
	KeyRound,
	Settings2,
	Sparkles,
	SquareTerminal,
	type LucideIcon,
} from "@/components/ui/icons";

import { cn } from "@/lib/cn";
import {
	DASHBOARD_CAPABILITIES,
	DASHBOARD_CAPABILITY_GROUPS,
	type DashboardCapabilityGroup,
} from "@/lib/dashboard/capabilities";

const ICONS: Record<string, LucideIcon> = {
	"agent-templates": Bot,
	"provider-routing": CloudCog,
	memory: Brain,
	"model-paths": Settings2,
	machines: ServerCog,
	console: MessagesSquare,
	terminal: SquareTerminal,
	migration: Route,
	logs: Activity,
	sessions: History,
	usage: BarChart3,
	artifacts: FileOutput,
	cron: Clock3,
	loadout: PackageOpen,
	skills: Sparkles,
	mcps: Plug2,
	benchmarks: Gauge,
	registry: Search,
	"api-access": KeyRound,
};

const GROUP_ICONS: Record<DashboardCapabilityGroup, LucideIcon> = {
	build: PackageOpen,
	operate: ServerCog,
	observe: Activity,
	automate: Plug2,
};

export function CapabilityMap({ hasMachine }: { hasMachine: boolean }) {
	const [selectedGroup, setSelectedGroup] = useState<DashboardCapabilityGroup>("build");
	const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const id = useId();

	function onCategoryKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const count = DASHBOARD_CAPABILITY_GROUPS.length;
		let next: number;
		switch (event.key) {
			case "ArrowRight": next = (index + 1) % count; break;
			case "ArrowLeft": next = (index - 1 + count) % count; break;
			case "Home": next = 0; break;
			case "End": next = count - 1; break;
			default: return;
		}
		event.preventDefault();
		setSelectedGroup(DASHBOARD_CAPABILITY_GROUPS[next]!.id);
		tabRefs.current[next]?.focus();
	}

	return (
		<section aria-labelledby={`${id}-title`} className={cn("space-y-4")}>
			<div className={cn("flex flex-wrap items-baseline justify-between gap-3")}>
				<h2 id={`${id}-title`} className={cn("text-2xl font-medium tracking-tight text-[var(--ret-text)]")}>
					Configure, run, and inspect
				</h2>
				<span className={cn("shrink-0 text-[13px] tabular-nums text-[var(--ret-text-muted)]")}>
					{DASHBOARD_CAPABILITIES.length} connected controls
				</span>
			</div>

			<div role="tablist" aria-label="Capability category" aria-orientation="horizontal" className={cn("grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-4")}>
				{DASHBOARD_CAPABILITY_GROUPS.map((group, index) => {
					const selected = group.id === selectedGroup;
					const Icon = GROUP_ICONS[group.id];
					return (
						<button
							key={group.id}
							ref={(element) => { tabRefs.current[index] = element; }}
							type="button"
							role="tab"
							id={`${id}-tab-${group.id}`}
							aria-controls={`${id}-panel-${group.id}`}
							aria-selected={selected}
							tabIndex={selected ? 0 : -1}
							onClick={() => setSelectedGroup(group.id)}
							onKeyDown={(event) => onCategoryKeyDown(event, index)}
							className={cn(
								"flex min-h-14 min-w-0 items-center gap-2 border-b-2 px-3 py-3 text-left text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] sm:px-4",
								selected ? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] text-[var(--ret-text)]" : "border-transparent bg-[var(--ret-bg)] text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)] active:bg-[var(--ret-bg-soft)]",
							)}
						>
							<Icon aria-hidden="true" size={20} className={cn("shrink-0", selected && "text-[var(--ret-purple)]")} />
							<span>{group.label}</span>
							<span aria-hidden="true" className={cn("ml-auto text-[13px] font-normal tabular-nums text-[var(--ret-text-muted)]")}>{DASHBOARD_CAPABILITIES.filter((item) => item.group === group.id).length}</span>
						</button>
					);
				})}
			</div>

			<div>
				{DASHBOARD_CAPABILITY_GROUPS.map((group) => {
					const capabilities = DASHBOARD_CAPABILITIES.filter((item) => item.group === group.id);
					const selected = group.id === selectedGroup;
					return (
						<div key={group.id} role="tabpanel" id={`${id}-panel-${group.id}`} aria-labelledby={`${id}-tab-${group.id}`} hidden={!selected} tabIndex={selected ? 0 : -1} className={cn("space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>
							<p className={cn("text-[14px] leading-relaxed text-[var(--ret-text-muted)]")}>{group.description}</p>
							<div className={cn("grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-2")}>
								{capabilities.map((capability) => {
									const Icon = ICONS[capability.id] ?? PackageOpen;
									const waiting = capability.requiresMachine && !hasMachine;
									return (
										<Link
											key={capability.id}
											href={capability.href}
											className={cn("group grid min-w-0 grid-cols-[24px_minmax(0,1fr)_20px] content-start gap-x-3 gap-y-2 bg-[var(--ret-bg)] p-4 outline-none hover:bg-[var(--ret-surface)] active:bg-[var(--ret-bg-soft)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] sm:p-5 sm:last:odd:col-span-2")}
										>
											<Icon aria-hidden="true" size={24} className={cn("row-span-3 mt-0.5 text-[var(--ret-purple)]")} />
											<h3 className={cn("min-w-0 text-[18px] font-medium leading-snug text-[var(--ret-text)]")}>{capability.label}</h3>
											<ArrowUpRight aria-hidden="true" size={20} className={cn("row-span-3 mt-0.5 text-[var(--ret-text-muted)] group-hover:text-[var(--ret-purple)] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] pointer-fine:motion-safe:[@media(hover:hover)]:group-[:hover:not(:disabled):not(:focus-visible)]:translate-x-0.5 group-focus-visible:transition-none")} />
											<p className={cn("col-start-2 text-[13px] leading-relaxed first-letter:uppercase", waiting ? "text-[var(--ret-amber)]" : "text-[var(--ret-green)]")}>
												{waiting ? "launch a machine first" : capability.proof}
											</p>
											<p className={cn("col-start-2 text-[14px] leading-relaxed text-[var(--ret-text-dim)]")}>{capability.description}</p>
										</Link>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

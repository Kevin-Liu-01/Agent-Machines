"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { buildActivityView } from "@/lib/dashboard/activity/build-activity-view";
import { buildLiveActivityPayload } from "@/lib/dashboard/activity/build-live-activity";
import {
	ACTIVITY_TIME_SCALES,
	DEFAULT_ACTIVITY_TIME_SCALE,
} from "@/lib/dashboard/activity/grid";
import type {
	ActivityDay,
	ActivityEvent,
	ActivityPayload,
	ActivityTimeScale,
	HeatmapCell,
} from "@/lib/dashboard/activity/types";
import type { LogLine } from "@/lib/dashboard/types";
import { fetchLogTail } from "@/lib/fleet/fetch-log-tail";
import { HEATMAP_CELL_PX, HeatmapGridCell, HeatmapGridSlot, heatmapGridStyle } from "@/components/heatmap/HeatmapGridCell";
import { cn } from "@/lib/cn";
import type { AgentKind, ProviderKind } from "@/lib/user-config/schema";

const POLL_MS = 12_000;
const TIME_SCALE_STORAGE_KEY = "am-activity-time-scale";
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CELL_PX = HEATMAP_CELL_PX;

const AGENT_FILTER_MAP: Record<string, { agent?: AgentKind; provider?: ProviderKind }> = {
	nous: { agent: "hermes" },
	openclaw: { agent: "openclaw" },
	"claude-code": { agent: "claude-code" },
	codex: { agent: "codex" },
	dedalus: { provider: "dedalus" },
	e2b: { provider: "e2b" },
	sprites: { provider: "sprites" },
	vercel: { provider: "vercel" },
	cursor: {},
};

type LiveMachine = {
	id: string;
	name: string;
	agentKind: AgentKind;
	providerKind: ProviderKind;
	createdAt: string;
};

function readStoredTimeScale(): ActivityTimeScale {
	if (typeof window === "undefined") return DEFAULT_ACTIVITY_TIME_SCALE;
	const stored = window.localStorage.getItem(TIME_SCALE_STORAGE_KEY);
	if (ACTIVITY_TIME_SCALES.some((entry) => entry.id === stored)) {
		return stored as ActivityTimeScale;
	}
	return DEFAULT_ACTIVITY_TIME_SCALE;
}

function cellMatchesFilters(
	day: ActivityDay,
	agentFilter: string | null,
	serviceFilter: string | null,
): boolean {
	if (agentFilter) {
		const spec = AGENT_FILTER_MAP[agentFilter];
		if (agentFilter === "cursor") {
			if (!day.services.includes("cursor") && !day.events.some((e) => e.title.includes("cursor"))) {
				return false;
			}
		} else if (spec?.agent && !day.agentKinds.includes(spec.agent)) {
			return false;
		} else if (spec?.provider && !day.providers.includes(spec.provider)) {
			return false;
		}
	}
	if (serviceFilter && !day.services.includes(serviceFilter)) return false;
	return true;
}

function formatDayHeading(date: string): string {
	const d = new Date(`${date}T12:00:00`);
	return d.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatShortDate(date: string): string {
	const d = new Date(`${date}T12:00:00`);
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityOverviewPanel() {
	const [payload, setPayload] = useState<ActivityPayload | null>(null);
	const [loading, setLoading] = useState(true);
	const [timeScale, setTimeScale] = useState<ActivityTimeScale>(DEFAULT_ACTIVITY_TIME_SCALE);
	const [agentFilter, setAgentFilter] = useState<string | null>(null);
	const [serviceFilter, setServiceFilter] = useState<string | null>(null);
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [hoverDate, setHoverDate] = useState<string | null>(null);

	useEffect(() => {
		setTimeScale(readStoredTimeScale());
	}, []);

	const setTimeScalePersisted = useCallback((scale: ActivityTimeScale) => {
		setTimeScale(scale);
		window.localStorage.setItem(TIME_SCALE_STORAGE_KEY, scale);
		setSelectedDate(null);
	}, []);

	const refresh = useCallback(async () => {
		try {
			const [activityRes, machinesRes] = await Promise.all([
				fetch("/api/dashboard/activity", { cache: "no-store" }),
				fetch("/api/dashboard/machines", { cache: "no-store" }),
			]);

			let base: ActivityPayload | null = activityRes.ok
				? ((await activityRes.json()) as ActivityPayload)
				: null;

			if (machinesRes.ok && base) {
				const machinesBody = (await machinesRes.json()) as {
					machines: LiveMachine[];
				};
				const pollable = machinesBody.machines.filter((m) => !("archived" in m && m.archived));
				const logPairs = await Promise.all(
					pollable.slice(0, 6).map(async (m) => [m.id, await fetchLogTail(m.id, 80)] as const),
				);
				const logsByMachine = Object.fromEntries(logPairs) as Record<string, LogLine[]>;
				const enriched = buildLiveActivityPayload({
					machines: pollable.map((m) => ({
						id: m.id,
						name: m.name,
						agentKind: m.agentKind,
						providerKind: m.providerKind,
						createdAt: m.createdAt,
					})),
					transitions: [],
					logsByMachine,
					usageDays: [],
				});
				if (enriched.days.length > 0 || enriched.agentFilters.length > 0) {
					base = enriched;
				}
			}

			setPayload(base);
		} catch {
			// retry next poll
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [refresh]);

	const view = useMemo(
		() => (payload ? buildActivityView(payload, timeScale) : null),
		[payload, timeScale],
	);

	const pinnedDate = selectedDate ?? hoverDate;
	const pinnedDay = useMemo(() => {
		if (!payload || !pinnedDate) return null;
		return payload.days.find((day) => day.date === pinnedDate) ?? null;
	}, [payload, pinnedDate]);

	const rangeHint =
		timeScale === "all" && payload?.dataBounds
			? `${formatShortDate(payload.dataBounds.first)} – ${formatShortDate(payload.dataBounds.last)}`
			: null;

	return (
		<section className="overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<div className="grid lg:grid-cols-[minmax(0,1fr)_220px]">
				<div className="min-w-0 border-b border-[var(--ret-border)] lg:border-b-0 lg:border-r">
					<header className="flex flex-wrap items-center gap-2 border-b border-[var(--ret-border)] px-4 py-3">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							Activity
						</h2>
						<span className="text-[var(--ret-text-muted)]">—</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-dim)]">
							{view?.rangeLabel ?? "Week"}
							{rangeHint ? ` · ${rangeHint}` : ""}
						</span>
						{view ? (
							<ReticleBadge variant="accent" className="text-[8px]">
								{view.activeDays} active days
							</ReticleBadge>
						) : null}
						<p className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
							→ tap a cell · click a chip to filter
						</p>
					</header>

					<div className="border-b border-[var(--ret-border)] px-4 py-2.5">
						<p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Time range
						</p>
						<div className="flex flex-wrap gap-1.5">
							{ACTIVITY_TIME_SCALES.map((scale) => (
								<button
									key={scale.id}
									type="button"
									onClick={() => setTimeScalePersisted(scale.id)}
									className={cn(
										"border px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors",
										timeScale === scale.id
											? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
											: "border-[var(--ret-border)] text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)]",
									)}
								>
									{scale.label}
								</button>
							))}
						</div>
					</div>

					<div className="px-4 py-4">
						{loading && !payload ? (
							<div className="h-[120px] animate-pulse bg-[var(--ret-surface)]/40" />
						) : view ? (
							<HeatmapGrid
								weeks={view.grid}
								monthLabels={view.monthLabels}
								agentFilter={agentFilter}
								serviceFilter={serviceFilter}
								selectedDate={selectedDate}
								onSelectDate={setSelectedDate}
								onHoverDate={setHoverDate}
							/>
						) : (
							<p className="text-[12px] text-[var(--ret-text-dim)]">No activity yet.</p>
						)}
					</div>

					{payload ? (
						<>
							<FilterSection
								label="Filter by agent"
								chips={payload.agentFilters.map((c) => ({
									id: c.id,
									label: c.label,
									count: c.count,
									mark: c.mark,
								}))}
								active={agentFilter}
								onToggle={(id) =>
									setAgentFilter((prev) => (prev === id ? null : id))
								}
							/>
							<FilterSection
								label="Filter by service"
								chips={payload.serviceFilters.map((c) => ({
									id: c.slug,
									label: c.label.toUpperCase(),
									count: c.count,
									slug: c.slug,
								}))}
								active={serviceFilter}
								onToggle={(id) =>
									setServiceFilter((prev) => (prev === id ? null : id))
								}
								service
							/>
						</>
					) : null}
				</div>

				<DayDetailSidebar day={pinnedDay} pinned={!!selectedDate} />
			</div>
		</section>
	);
}

function HeatmapGrid({
	weeks,
	monthLabels,
	agentFilter,
	serviceFilter,
	selectedDate,
	onSelectDate,
	onHoverDate,
}: {
	weeks: HeatmapCell[][];
	monthLabels: string[];
	agentFilter: string | null;
	serviceFilter: string | null;
	selectedDate: string | null;
	onSelectDate: (d: string | null) => void;
	onHoverDate: (d: string | null) => void;
}) {
	return (
		<div className="w-full min-w-0">
			<div
				className="mb-1 grid w-full gap-[3px]"
				style={{
					gridTemplateColumns: `24px repeat(${weeks.length}, minmax(0, 1fr))`,
				}}
			>
				<div aria-hidden="true" />
				{monthLabels.map((label, i) => {
					const show = i === 0 || label !== monthLabels[i - 1];
					return (
						<div
							key={`m-${i}`}
							className="min-w-0 truncate font-mono text-[8px] uppercase tracking-wider text-[var(--ret-text-muted)]"
						>
							{show ? label : ""}
						</div>
					);
				})}
			</div>
			<div className="grid w-full gap-[3px]" style={heatmapGridStyle(weeks.length, { labelColumnPx: 24 })}>
				{DAY_LABEL.map((label, dayIdx) => (
					<div
						key={label}
						className="flex min-h-0 items-center self-stretch font-mono text-[8px] uppercase tracking-wider text-[var(--ret-text-muted)]"
						style={{ gridColumn: 1, gridRow: dayIdx + 1 }}
					>
						{label.slice(0, 1)}
					</div>
				))}
				{weeks.flatMap((week, weekIdx) =>
					Array.from({ length: 7 }, (_, dayIdx) => {
						const cell = week[dayIdx] ?? null;
						return (
							<HeatmapGridSlot
								key={`${weekIdx}-${dayIdx}`}
								weekIdx={weekIdx}
								dayIdx={dayIdx}
								columnOffset={1}
							>
								<HeatmapCellButton
									cell={cell}
									agentFilter={agentFilter}
									serviceFilter={serviceFilter}
									selected={cell?.date === selectedDate}
									onSelect={onSelectDate}
									onHover={onHoverDate}
								/>
							</HeatmapGridSlot>
						);
					}),
				)}
			</div>
			<div className="mt-2 flex items-center justify-end gap-1 pl-7 font-mono text-[8px] uppercase tracking-wider text-[var(--ret-text-muted)]">
				<span>less</span>
				{[0.15, 0.35, 0.55, 0.75, 1].map((o) => (
					<span
						key={o}
						className="border border-[var(--ret-border)]"
						style={{
							width: CELL_PX,
							height: CELL_PX,
							background: "var(--ret-purple)",
							opacity: o,
						}}
					/>
				))}
				<span>more</span>
			</div>
		</div>
	);
}

function HeatmapCellButton({
	cell,
	agentFilter,
	serviceFilter,
	selected,
	onSelect,
	onHover,
}: {
	cell: HeatmapCell;
	agentFilter: string | null;
	serviceFilter: string | null;
	selected: boolean;
	onSelect: (d: string | null) => void;
	onHover: (d: string | null) => void;
}) {
	if (!cell) {
		return <HeatmapGridCell empty inert fill />;
	}

	const matches = cellMatchesFilters(cell, agentFilter, serviceFilter);
	const isEmpty = cell.level === 0;
	const opacity = isEmpty ? 1 : 0.15 + (cell.level / 4) * 0.85;

	return (
		<HeatmapGridCell
			empty={isEmpty}
			fill
			selected={selected}
			dimmed={!matches}
			hue={isEmpty ? undefined : cell.hue}
			opacity={matches ? opacity : 0.12}
			title={`${cell.date} — ${cell.events.length} events`}
			onClick={() => onSelect(selected ? null : cell.date)}
			onMouseEnter={() => onHover(cell.date)}
			onMouseLeave={() => onHover(null)}
			className={cn(isEmpty && "bg-[var(--ret-surface)]/25")}
		/>
	);
}

function FilterSection({
	label,
	chips,
	active,
	onToggle,
	service = false,
}: {
	label: string;
	chips: Array<{
		id: string;
		label: string;
		count: number;
		mark?: Mark;
		slug?: string;
	}>;
	active: string | null;
	onToggle: (id: string) => void;
	service?: boolean;
}) {
	return (
		<div className="border-t border-[var(--ret-border)] px-4 py-3">
			<p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<div className="flex flex-wrap gap-1.5">
				{chips.map((chip) => (
					<button
						key={chip.id}
						type="button"
						onClick={() => onToggle(chip.id)}
						className={cn(
							"flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors",
							active === chip.id
								? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
								: "border-[var(--ret-border)] text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)]",
						)}
					>
						<span className="flex h-4 w-4 items-center justify-center">
							{service && chip.slug ? (
								chip.slug === "cursor" ? (
									<Logo mark="cursor" size={11} />
								) : (
									<ServiceIcon
										slug={chip.slug as ServiceSlug}
										size={11}
										tone="mono"
									/>
								)
							) : chip.mark ? (
								<Logo mark={chip.mark} size={11} />
							) : null}
						</span>
						<span>{chip.label}</span>
						<span className="tabular-nums text-[var(--ret-text-muted)]">{chip.count}</span>
					</button>
				))}
			</div>
		</div>
	);
}

function DayDetailSidebar({
	day,
	pinned,
}: {
	day: ActivityDay | null;
	pinned: boolean;
}) {
	return (
		<aside className="flex min-h-[280px] flex-col bg-[var(--ret-surface)]/15 px-4 py-4">
			{day ? (
				<>
					<p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
						{formatDayHeading(day.date)}
					</p>
					<p className="mt-1 font-mono text-[10px] tabular-nums text-[var(--ret-text-dim)]">
						{day.events.length} event{day.events.length === 1 ? "" : "s"}
						{pinned ? " · pinned" : ""}
					</p>
					<ul className="mt-4 flex-1 space-y-3 overflow-y-auto">
						{day.events.slice(0, 8).map((event) => (
							<EventRow key={event.id} event={event} />
						))}
					</ul>
				</>
			) : (
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					Hover or tap a cell to inspect that day.
				</p>
			)}
			<p className="mt-auto pt-4 font-mono text-[9px] leading-relaxed text-[var(--ret-text-muted)]">
				→ each cell is one day this machine was awake. hover to peek, click to pin.
				<br />
				nothing lives in RAM that it can&apos;t rebuild from /home/machine.
			</p>
		</aside>
	);
}

function EventRow({ event }: { event: ActivityEvent }) {
	return (
		<li className="border-l-2 pl-2" style={{ borderColor: event.hue }}>
			<p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ret-text-muted)]">
				{event.kind}
			</p>
			<p className="mt-0.5 text-[11px] font-medium text-[var(--ret-text)]">{event.title}</p>
			{event.subtitle ? (
				<p className="mt-0.5 truncate font-mono text-[9px] text-[var(--ret-text-dim)]">
					{event.subtitle}
				</p>
			) : null}
		</li>
	);
}

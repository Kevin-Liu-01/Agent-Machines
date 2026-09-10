"use client";

import { useMemo, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { Activity, CalendarDays, History, MousePointerClick, Plus, X } from "@/components/ui/icons";
import {
	ServiceIcon,
	SERVICE_LABEL,
	isServiceSlug,
	type ServiceSlug,
} from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { HeatmapGridCell, HeatmapGridSlot, heatmapGridStyle } from "@/components/heatmap/HeatmapGridCell";
import { cn } from "@/lib/cn";
import { LANDING_BODY, LANDING_EYEBROW, LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, LANDING_TITLE } from "@/lib/marketing/layout";
import {
	generateContributionGrid,
	type ContributionDay,
	type ContributionEvent,
	type PartnerKey,
} from "@/lib/contribution-data";

const PARTNER_MARKS = new Set<Mark>(["am", "daytona", "nous", "cursor", "openclaw"]);

const PARTNER_HUE: Record<PartnerKey, string> = {
	am: "var(--ret-purple)",
	daytona: "var(--ret-purple)",
	nous: "#7c8cf8",
	cursor: "#f5c542",
	openclaw: "#e87c4f",
	anthropic: "#d4a574",
	openai: "#a1a1aa",
	e2b: "#FF8800",
	sprites: "#7C3AED",
	vercel: "#ffffff",
	"claude-code": "#d4a574",
	codex: "#a1a1aa",
};

const PARTNER_LABEL: Record<PartnerKey, string> = {
	am: "Agent Machines",
	daytona: "Daytona",
	nous: "Nous",
	cursor: "Cursor",
	openclaw: "OpenClaw",
	anthropic: "Anthropic",
	openai: "OpenAI",
	e2b: "E2B",
	sprites: "Sprites",
	vercel: "Vercel",
	"claude-code": "Claude Code",
	codex: "Codex",
};

const LOGO_PARTNERS = new Set<PartnerKey>([
	"daytona",
	"nous",
	"cursor",
	"openclaw",
	"claude-code",
	"codex",
]);
const LOGO_MARK: Partial<Record<PartnerKey, Mark>> = {
	daytona: "daytona",
	am: "am",
	nous: "nous",
	cursor: "cursor",
	openclaw: "openclaw",
	"claude-code": "claudecode",
	codex: "codex",
};
const SERVICE_PARTNER: Record<string, ServiceSlug> = {};
const COLOR_LOGO_PARTNERS = new Set<PartnerKey>([
	"nous",
	"openclaw",
	"claude-code",
	"codex",
]);

const ALL_PARTNERS: ReadonlyArray<PartnerKey> = [
	"daytona",
	"nous",
	"openclaw",
	"cursor",
	"claude-code",
	"codex",
];

const KIND_LABEL: Record<ContributionEvent["kind"], string> = {
	skill: "skill",
	mcp: "MCP",
	cron: "cron",
	cursor: "cursor",
	wake: "wake",
	sleep: "sleep",
	deploy: "deploy",
	milestone: "milestone",
	compute: "compute",
	browser: "browser",
	codegen: "codegen",
};

function PartnerIcon({ partner, size }: { partner: PartnerKey; size: number }) {
	if (LOGO_PARTNERS.has(partner)) {
		return (
			<Logo
				mark={LOGO_MARK[partner]!}
				size={size}
				tone={COLOR_LOGO_PARTNERS.has(partner) ? "native" : undefined}
			/>
		);
	}
	const slug = SERVICE_PARTNER[partner];
	if (slug) return <ServiceIcon slug={slug} size={size} />;
	return (
		<Activity
			className={cn("shrink-0")}
			size={size}
			style={{ color: PARTNER_HUE[partner] }}
			aria-hidden="true"
		/>
	);
}

function BrandChip({
	slug,
	events,
	active,
	onClick,
}: {
	slug: ServiceSlug;
	days: number;
	events: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"group flex min-h-10 items-center gap-2 rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]",
				active
					? "border-[var(--ret-purple)]/55 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-[var(--ret-border)]/50 bg-[var(--ret-bg-soft)] text-[var(--ret-text-dim)] hover:border-[var(--ret-purple)]/45 hover:text-[var(--ret-text)]",
			)}
		>
			<ServiceIcon slug={slug} size={18} />
			<span className={cn(active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text)]")}>
				{SERVICE_LABEL[slug]}
			</span>
			<span className={cn("tabular-nums", active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]")}>
				{events}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					active
						? "text-[var(--ret-purple)]"
						: "text-[var(--ret-text-muted)]",
				)}
			>
				{active ? <X className={cn("h-3.5 w-3.5")} /> : <Plus className={cn("h-3.5 w-3.5")} />}
			</span>
		</button>
	);
}

function EventRow({ event }: { event: ContributionEvent }) {
	function icon(): React.ReactNode {
		if (event.brand && PARTNER_MARKS.has(event.brand as Mark)) {
			return (
				<Logo
					mark={event.brand as Mark}
					size={18}
					tone={COLOR_LOGO_PARTNERS.has(event.brand as PartnerKey) ? "native" : undefined}
				/>
			);
		}
		if (event.brand && isServiceSlug(event.brand)) {
			return <ServiceIcon slug={event.brand} size={18} />;
		}
		if (event.category) {
			return <ToolIcon name={event.category} size={18} className={cn("text-[var(--ret-text-muted)]")} />;
		}
		return <Activity className={cn("h-[18px] w-[18px] text-[var(--ret-text-muted)]")} aria-hidden="true" />;
	}
	return (
		<li className={cn("space-y-1.5 border-l border-[var(--ret-border)]/50 pl-4")}>
			<p className={cn("flex items-center gap-2 text-sm text-[var(--ret-text-muted)]")}>
				{icon()}
				{KIND_LABEL[event.kind]}
			</p>
			<p className={cn("break-words text-base leading-6 text-[var(--ret-text)]")}>{event.label}</p>
			{event.detail ? (
				<p className={cn("break-words text-sm leading-6 text-[var(--ret-text-dim)]")}>{event.detail}</p>
			) : null}
		</li>
	);
}

const INTENSITY_OPACITY = [0.06, 0.32, 0.55, 0.78, 1] as const;

function CellSwatch({
	day,
	active,
	onSelect,
}: {
	day: ContributionDay;
	active: boolean;
	onSelect: (day: ContributionDay) => void;
}) {
	const hue = PARTNER_HUE[day.partner];
	const opacity = INTENSITY_OPACITY[day.intensity];
	const isEmpty = day.intensity === 0;

	return (
		<HeatmapGridCell
			empty={isEmpty}
			fill
			selected={active}
			hue={isEmpty ? undefined : hue}
			opacity={isEmpty ? 1 : opacity}
			title={`${day.date}, ${day.events.length} events on ${day.partner}`}
			onClick={() => onSelect(day)}
			onMouseEnter={() => onSelect(day)}
			className={cn("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)] focus-visible:transition-none motion-reduce:transition-none", isEmpty && "bg-[var(--ret-surface)]/20")}
		/>
	);
}

function MonthLabels({ weeks }: { weeks: ContributionDay[][] }) {
	const monthsSeen = new Set<string>();
	const labels = weeks.map((week, idx) => {
		const first = week[0];
		if (!first) return null;
		const date = new Date(`${first.date}T00:00:00Z`);
		const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
		const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
		if (monthsSeen.has(key)) return null;
		monthsSeen.add(key);
		return { idx, label: month };
	});
	return (
		<div
			className={cn("grid w-full gap-[3px]")}
			style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
		>
			{weeks.map((_, weekIdx) => {
				const tag = labels.find((l) => l?.idx === weekIdx);
				return (
					<div
						key={weekIdx}
						className={cn("min-w-0 text-xs leading-6 text-[var(--ret-text-muted)]")}
					>
						{tag?.label ?? ""}
					</div>
				);
			})}
		</div>
	);
}

function PartnerSwatch({
	partner,
	count,
	active,
	onClick,
}: {
	partner: PartnerKey;
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"group flex min-h-10 items-center gap-2 rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]",
				active
					? "border-[var(--ret-purple)]/55 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-[var(--ret-border)]/50 text-[var(--ret-text-dim)] hover:border-[var(--ret-purple)]/50 hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
			)}
		>
			<PartnerIcon partner={partner} size={20} />
			<span>{PARTNER_LABEL[partner]}</span>
			<span className={cn("tabular-nums", active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]")}>
				{count}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]",
				)}
			>
				{active ? <X className={cn("h-3.5 w-3.5")} /> : <Plus className={cn("h-3.5 w-3.5")} />}
			</span>
		</button>
	);
}

export function ContributionGrid() {
	const weeks = useMemo(() => generateContributionGrid(182), []);
	const allDays = useMemo(() => weeks.flat(), [weeks]);

	const initial =
		[...allDays].reverse().find((d) => d.events.length > 0) ?? allDays[allDays.length - 1];
	const [selected, setSelected] = useState<ContributionDay>(initial);
	const [filter, setFilter] = useState<PartnerKey | "all">("all");
	const [brandFilter, setBrandFilter] = useState<ServiceSlug | null>(null);

	const partnerCounts = useMemo(() => {
		const counts: Record<PartnerKey, number> = {
			am: 0,
			daytona: 0,
			nous: 0,
			cursor: 0,
			openclaw: 0,
			anthropic: 0,
			openai: 0,
			e2b: 0,
			sprites: 0,
			vercel: 0,
			"claude-code": 0,
			codex: 0,
		};
		for (const day of allDays) {
			if (day.intensity > 0) counts[day.partner] += 1;
		}
		return counts;
	}, [allDays]);

	const brandStats = useMemo(() => {
		const eventCount = new Map<ServiceSlug, number>();
		const dayCount = new Map<ServiceSlug, number>();
		for (const day of allDays) {
			const seen = new Set<ServiceSlug>();
			for (const ev of day.events) {
				if (!ev.brand || !isServiceSlug(ev.brand)) continue;
				eventCount.set(ev.brand, (eventCount.get(ev.brand) ?? 0) + 1);
				if (!seen.has(ev.brand)) {
					seen.add(ev.brand);
					dayCount.set(ev.brand, (dayCount.get(ev.brand) ?? 0) + 1);
				}
			}
		}
		const slugs: ServiceSlug[] = Array.from(eventCount.keys()).sort(
			(a, b) => (eventCount.get(b) ?? 0) - (eventCount.get(a) ?? 0),
		);
		return { slugs, eventCount, dayCount };
	}, [allDays]);

	const totalActive = allDays.filter((d) => d.intensity > 0).length;

	const hasFilter = filter !== "all" || brandFilter !== null;
	const filterLabel = (() => {
		if (filter !== "all") return PARTNER_LABEL[filter];
		if (brandFilter !== null) return SERVICE_LABEL[brandFilter];
		return null;
	})();
	function clearFilters(): void {
		setFilter("all");
		setBrandFilter(null);
	}

	return (
		<section aria-labelledby="contribution-title" className={cn(LANDING_INSET, LANDING_SECTION_SPACE, "space-y-8 bg-[var(--ret-bg)]")}>
			<header className={cn(LANDING_SPLIT, "items-end")}>
				<div>
					<p className={cn(LANDING_EYEBROW)}><History className={cn("h-4 w-4")} aria-hidden="true" />Sample history</p>
					<h2 id="contribution-title" className={cn(LANDING_TITLE)}>A history you can inspect.</h2>
				</div>
				<p className={cn(LANDING_BODY, "max-w-xl")}>
					Explore six months of generated activity. This is sample data, not your Workers’ history, live uptime, or benchmark results.
				</p>
			</header>
			<div className={cn("flex flex-wrap items-center justify-between gap-4")}>
				<div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-sm")}>
					<span className={cn("flex items-center gap-2 font-medium text-[var(--ret-text)]")}><CalendarDays className={cn("h-4 w-4")} aria-hidden="true" />Six-month sample</span>
					<span className={cn("tabular-nums text-[var(--ret-text-muted)]")}>{totalActive} active days</span>
				</div>
				{hasFilter ? (
					<button
						type="button"
						onClick={clearFilters}
						className={cn("flex min-h-10 items-center gap-2 rounded-sm bg-[var(--ret-purple-glow)] px-3 py-2 text-sm text-[var(--ret-purple)] hover:bg-[var(--ret-purple)]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}
						title="Clear filter"
					>
						Clear filter: {filterLabel}
						<X className={cn("h-4 w-4")} aria-hidden="true" />
					</button>
				) : (
					<p className={cn("flex items-center gap-2 text-sm text-[var(--ret-text-muted)]")}>
						<MousePointerClick className={cn("h-4 w-4 shrink-0")} aria-hidden="true" />
						Choose a day, or filter the activity below.
					</p>
				)}
			</div>

			{/* Main body: grid left, day detail right */}
			<div className={cn("grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]")}>
				<div className={cn("min-w-0 space-y-7")}>
					{/* Cell grid */}
					<div role="region" aria-label="Sample activity calendar" tabIndex={0} className={cn("overflow-x-auto pb-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-purple)]")}>
						<div className={cn("min-w-[620px]")}>
						<MonthLabels weeks={weeks} />
						<div className={cn("mt-2 grid w-full gap-[3px]")} style={heatmapGridStyle(weeks.length)}>
							{weeks.flatMap((week, weekIdx) =>
								Array.from({ length: 7 }, (_, dayIdx) => {
									const day = week[dayIdx];
									if (!day) {
										return (
											<HeatmapGridSlot key={`empty-${weekIdx}-${dayIdx}`} weekIdx={weekIdx} dayIdx={dayIdx}>
												<HeatmapGridCell empty inert fill />
											</HeatmapGridSlot>
										);
									}
									const partnerDim = filter !== "all" && day.partner !== filter;
									const brandDim =
										brandFilter !== null &&
										!day.events.some((e) => e.brand === brandFilter);
									const dimmed = partnerDim || brandDim;
									return (
										<HeatmapGridSlot
											key={day.date}
											weekIdx={weekIdx}
											dayIdx={dayIdx}
											className={cn(dimmed && "opacity-20")}
										>
											<CellSwatch
												day={day}
												active={day.date === selected.date}
												onSelect={setSelected}
											/>
										</HeatmapGridSlot>
									);
								}),
							)}
						</div>
						</div>
					</div>

					{/* Agent filter */}
					<div className={cn("space-y-3 border-t border-[var(--ret-border)]/40 pt-5")}>
						<div className={cn("flex flex-wrap items-center justify-between gap-3")}>
							<h3 className={cn("text-base font-semibold text-[var(--ret-text)]")}>Agents and platforms</h3>
							<div className={cn("flex items-center gap-1.5 text-xs text-[var(--ret-text-muted)]")}>
								<span>Less</span>
								{INTENSITY_OPACITY.map((o, idx) => (
									<span
										key={idx}
										className={cn("h-2.5 w-2.5")}
										style={{ background: "var(--ret-text)", opacity: o }}
										aria-hidden="true"
									/>
								))}
								<span>More</span>
							</div>
						</div>
						<div className={cn("flex flex-wrap gap-2")}>
							{ALL_PARTNERS.map((partner) => (
								<PartnerSwatch
									key={partner}
									partner={partner}
									count={partnerCounts[partner]}
									active={filter === partner}
									onClick={() => setFilter(filter === partner ? "all" : partner)}
								/>
							))}
						</div>
					</div>

					{/* Service filter */}
					{brandStats.slugs.length > 0 ? (
						<div className={cn("space-y-3")}>
							<div className={cn("flex items-center justify-between gap-3")}>
								<h3 className={cn("text-base font-semibold text-[var(--ret-text)]")}>Services and tools</h3>
								{brandFilter ? (
									<button
										type="button"
										onClick={() => setBrandFilter(null)}
										className={cn("flex min-h-10 items-center gap-2 rounded-sm px-2 text-sm text-[var(--ret-purple)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}
									>
										Clear service filter <X className={cn("h-4 w-4")} aria-hidden="true" />
									</button>
								) : null}
							</div>
							<div className={cn("flex flex-wrap gap-2")}>
								{brandStats.slugs.map((slug) => (
									<BrandChip
										key={slug}
										slug={slug}
										days={brandStats.dayCount.get(slug) ?? 0}
										events={brandStats.eventCount.get(slug) ?? 0}
										active={brandFilter === slug}
										onClick={() => setBrandFilter((cur) => (cur === slug ? null : slug))}
									/>
								))}
							</div>
						</div>
					) : null}
				</div>

				<DayDetail day={selected} />
			</div>
		</section>
	);
}

function DayDetail({ day }: { day: ContributionDay }) {
	const date = new Date(`${day.date}T00:00:00Z`);
	const formatted = date.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	return (
		<aside aria-label="Selected sample day" className={cn("flex min-w-0 flex-col gap-5 rounded-sm border border-[var(--ret-border)]/40 bg-[var(--ret-surface)]/40 p-5")}>
			<div className={cn("flex items-center justify-between gap-3")}>
				<p className={cn("text-sm leading-6 text-[var(--ret-text-dim)]")}>
					{formatted}
				</p>
				<PartnerIcon partner={day.partner} size={24} />
			</div>
			<div className={cn("flex items-baseline gap-2")}>
				<p className={cn("text-3xl font-semibold tabular-nums text-[var(--ret-text)]")}>
					{day.events.length}
				</p>
				<p className={cn("text-sm text-[var(--ret-text-muted)]")}>
					{day.events.length === 1 ? "event" : "events"}
				</p>
			</div>
			{day.events.length === 0 ? (
				<p className={cn("text-base leading-7 text-[var(--ret-text-dim)]")}>
					No activity in this sample day.
				</p>
			) : (
				<ul className={cn("flex flex-col gap-5")}>
					{day.events.map((event, idx) => (
						<EventRow key={`${day.date}-${idx}`} event={event} />
					))}
				</ul>
			)}
			<p className={cn("mt-auto border-t border-[var(--ret-border)]/40 pt-4 text-sm leading-6 text-[var(--ret-text-muted)]")}>
				Hover to preview a sample day, or select one to inspect its events.
			</p>
		</aside>
	);
}

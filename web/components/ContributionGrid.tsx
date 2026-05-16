"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import {
	ServiceIcon,
	SERVICE_LABEL,
	isServiceSlug,
	type ServiceSlug,
} from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { cn } from "@/lib/cn";
import {
	generateContributionGrid,
	type ContributionDay,
	type ContributionEvent,
	type PartnerKey,
} from "@/lib/contribution-data";

const PARTNER_MARKS = new Set<Mark>(["dedalus", "nous", "cursor", "openclaw"]);

const PARTNER_HUE: Record<PartnerKey, string> = {
	dedalus: "var(--ret-purple)",
	nous: "#7c8cf8",
	cursor: "#f5c542",
	openclaw: "#e87c4f",
	anthropic: "#d4a574",
	openai: "#4ae0a0",
	"claude-code": "#d4a574",
	codex: "#4ae0a0",
};

const PARTNER_LABEL: Record<PartnerKey, string> = {
	dedalus: "dedalus",
	nous: "nous",
	cursor: "cursor",
	openclaw: "openclaw",
	anthropic: "anthropic",
	openai: "openai",
	"claude-code": "claude code",
	codex: "codex cli",
};

const LOGO_PARTNERS = new Set<PartnerKey>(["dedalus", "nous", "cursor", "openclaw"]);
const LOGO_MARK: Record<string, Mark> = {
	dedalus: "dedalus",
	nous: "nous",
	cursor: "cursor",
	openclaw: "openclaw",
};
const SERVICE_PARTNER: Record<string, ServiceSlug> = {
	"claude-code": "anthropic",
	codex: "openai",
};

const ALL_PARTNERS: ReadonlyArray<PartnerKey> = [
	"dedalus",
	"nous",
	"openclaw",
	"cursor",
	"claude-code",
	"codex",
];

const KIND_LABEL: Record<ContributionEvent["kind"], string> = {
	skill: "skill",
	mcp: "mcp",
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
		return <Logo mark={LOGO_MARK[partner]!} size={size} />;
	}
	const slug = SERVICE_PARTNER[partner];
	if (slug) return <ServiceIcon slug={slug} size={size} />;
	return (
		<span
			className="shrink-0"
			style={{ width: size, height: size, background: PARTNER_HUE[partner] }}
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
				"group flex items-center gap-1 border px-1.5 py-0.5 text-[10px] transition-all",
				active
					? "border-[var(--ret-purple)]/55 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)] shadow-[0_0_10px_var(--ret-purple-glow)]"
					: "border-dashed border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text-dim)] hover:border-solid hover:border-[var(--ret-purple)]/45 hover:text-[var(--ret-text)]",
			)}
		>
			<ServiceIcon slug={slug} size={11} />
			<span className={active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text)]"}>
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
						: "text-[var(--ret-text-muted)] opacity-0 transition-opacity group-hover:opacity-100",
				)}
			>
				{active ? "x" : "+"}
			</span>
		</button>
	);
}

function EventRow({ event }: { event: ContributionEvent }) {
	function icon(): React.ReactNode {
		if (event.brand && PARTNER_MARKS.has(event.brand as Mark)) {
			return <Logo mark={event.brand as Mark} size={12} />;
		}
		if (event.brand && isServiceSlug(event.brand)) {
			return <ServiceIcon slug={event.brand} size={12} />;
		}
		if (event.category) {
			return <ToolIcon name={event.category} size={12} className="text-[var(--ret-text-muted)]" />;
		}
		return <span className="h-2 w-2 border border-[var(--ret-border)]" aria-hidden="true" />;
	}
	return (
		<li className="border-l border-[var(--ret-border)] pl-2">
			<p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{icon()}
				{KIND_LABEL[event.kind]}
			</p>
			<p className="text-[12px] text-[var(--ret-text)]">{event.label}</p>
			{event.detail ? (
				<p className="font-mono text-[10px] text-[var(--ret-text-dim)]">{event.detail}</p>
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
	return (
		<button
			type="button"
			onClick={() => onSelect(day)}
			onMouseEnter={() => onSelect(day)}
			onFocus={() => onSelect(day)}
			aria-label={`${day.date}, ${day.events.length} events on ${day.partner}`}
			className={cn(
				"relative box-border h-full min-h-0 w-full shrink-0 cursor-pointer border p-0 leading-none transition-all duration-100",
				active
					? "z-20 scale-[1.1] border-[var(--ret-text)] outline outline-2 outline-offset-1 outline-[var(--ret-purple)]/70 shadow-[0_0_0_1px_var(--ret-bg)]"
					: "border-[var(--ret-border)]/50 hover:z-10 hover:scale-[1.1] hover:border-[var(--ret-text)]",
			)}
			style={{ background: hue, opacity }}
		/>
	);
}

function MonthLabels({ weeks }: { weeks: ContributionDay[][] }) {
	const monthsSeen = new Set<string>();
	const labels = weeks.map((week, idx) => {
		const first = week[0];
		if (!first) return null;
		const date = new Date(`${first.date}T00:00:00Z`);
		const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
		const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
		if (monthsSeen.has(key)) return null;
		monthsSeen.add(key);
		return { idx, label: month };
	});
	return (
		<div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
			{weeks.map((_, weekIdx) => {
				const tag = labels.find((l) => l?.idx === weekIdx);
				return (
					<div key={weekIdx} className="text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
				"group flex items-center gap-2 border px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-all",
				active
					? "border-[var(--ret-purple)]/55 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)] shadow-[0_0_12px_var(--ret-purple-glow)]"
					: "border-dashed border-[var(--ret-border)] text-[var(--ret-text-dim)] hover:border-solid hover:border-[var(--ret-purple)]/50 hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
			)}
		>
			<PartnerIcon partner={partner} size={12} />
			<span>{PARTNER_LABEL[partner]}</span>
			<span className={cn("tabular-nums", active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)]")}>
				{count}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text-muted)] opacity-0 transition-opacity group-hover:opacity-100",
				)}
			>
				{active ? "x" : "+"}
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
			dedalus: 0,
			nous: 0,
			cursor: 0,
			openclaw: 0,
			anthropic: 0,
			openai: 0,
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
		<div className="flex h-full flex-col bg-[var(--ret-bg)]">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex items-center gap-2">
					<ReticleLabel>ACTIVITY -- 6 MONTHS</ReticleLabel>
					<ReticleBadge>{totalActive} active days</ReticleBadge>
				</div>
				{hasFilter ? (
					<button
						type="button"
						onClick={clearFilters}
						className="group flex items-center gap-1.5 bg-[var(--ret-purple-glow)] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/15"
						title="Clear filter"
					>
						<span className="h-1.5 w-1.5 animate-pulse bg-[var(--ret-purple)]" />
						filtered: {filterLabel}
						<span aria-hidden="true">x</span>
					</button>
				) : (
					<p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						<span aria-hidden="true" className="text-[var(--ret-purple)]">{"->"}
						</span>
						tap a cell . click a chip to filter
					</p>
				)}
			</div>

			{/* Main body: grid left, day detail right */}
			<div className="grid flex-1 gap-px bg-[var(--ret-border)] md:grid-cols-[1fr_minmax(0,200px)]">
				<div className="flex flex-col bg-[var(--ret-bg)]">
					{/* Cell grid */}
					<div className="border-b border-[var(--ret-border)] px-3 py-3">
						<MonthLabels weeks={weeks} />
						<div
							className="mt-1 grid gap-[3px]"
							style={{
								gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
								gridTemplateRows: "repeat(7, minmax(0, auto))",
							}}
						>
							{weeks.flatMap((week, weekIdx) =>
								Array.from({ length: 7 }, (_, dayIdx) => {
									const placement: CSSProperties = {
										gridColumn: weekIdx + 1,
										gridRow: dayIdx + 1,
									};
									const day = week[dayIdx];
									if (!day) {
										return (
											<div
												key={`empty-${weekIdx}-${dayIdx}`}
												style={placement}
												className="aspect-square min-h-0 min-w-0 "
												aria-hidden="true"
											>
												<div className="mt-[0.21rem] aspect-square h-full w-full border border-dashed border-[var(--ret-border)]/30"/>
											</div>
										);
									}
									const partnerDim = filter !== "all" && day.partner !== filter;
									const brandDim = brandFilter !== null && !day.events.some((e) => e.brand === brandFilter);
									const dimmed = partnerDim || brandDim;
									return (
										<div key={day.date} style={placement} className={cn("aspect-square min-h-0 min-w-0", dimmed && "opacity-20")}>
											<CellSwatch day={day} active={day.date === selected.date} onSelect={setSelected} />
										</div>
									);
								}),
							)}
						</div>
					</div>

					{/* Agent filter */}
					<div className="border-b border-[var(--ret-border)] px-3 py-2.5">
						<div className="flex items-baseline justify-between gap-2">
							<p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
								<span aria-hidden="true" className="text-[var(--ret-purple)]">{"->"}
								</span>
								filter by agent . {ALL_PARTNERS.length}
							</p>
							<div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								<span>less</span>
								{INTENSITY_OPACITY.map((o, idx) => (
									<span
										key={idx}
										className="h-2 w-2"
										style={{ background: "var(--ret-text)", opacity: o }}
										aria-hidden="true"
									/>
								))}
								<span>more</span>
							</div>
						</div>
						<div className="mt-2 flex flex-wrap gap-1.5">
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
						<div className="px-3 py-2.5">
							<div className="flex items-baseline justify-between gap-2">
								<p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
									<span aria-hidden="true" className="text-[var(--ret-purple)]">{"->"}
									</span>
									filter by service . {brandStats.slugs.length}
								</p>
								{brandFilter ? (
									<button
										type="button"
										onClick={() => setBrandFilter(null)}
										className="text-[9px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:underline"
									>
										clear filter x
									</button>
								) : null}
							</div>
							<div className="mt-2 flex flex-wrap gap-1">
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

					{/* Hatch fill: fills remaining vertical space */}
					<div
						className="min-h-[12px] flex-1"
						style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--ret-rail) 0 1px, transparent 1px 5px)" }}
						aria-hidden="true"
					/>
				</div>

				<DayDetail day={selected} />
			</div>
		</div>
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
		<aside className="flex flex-col gap-3 bg-[var(--ret-bg)] px-3 py-3">
			<div className="flex items-baseline justify-between gap-2">
				<p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{formatted}
				</p>
				<PartnerIcon partner={day.partner} size={14} />
			</div>
			<div className="flex items-baseline gap-2">
				<p className="text-base tabular-nums text-[var(--ret-text)]">
					{day.events.length}
				</p>
				<p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{day.events.length === 1 ? "event" : "events"}
				</p>
			</div>
			{day.events.length === 0 ? (
				<p className="text-[11px] text-[var(--ret-text-dim)]">
					no recorded activity. machine likely asleep.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{day.events.map((event, idx) => (
						<EventRow key={`${day.date}-${idx}`} event={event} />
					))}
				</ul>
			)}
			<p className="mt-auto pt-3 text-[10px] leading-relaxed text-[var(--ret-text-muted)]">
				<span className="text-[var(--ret-purple)]">{"->"}</span> each cell is
				one day this machine was awake. hover to peek, click to pin. nothing
				lives in RAM that it can&rsquo;t rebuild from{" "}
				<code className="font-mono text-[var(--ret-text-dim)]">/home/machine</code>.
			</p>
		</aside>
	);
}

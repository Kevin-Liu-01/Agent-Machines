"use client";

import { useMemo, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";
import {
	generateContributionGrid,
	type ContributionDay,
	type ContributionEvent,
} from "@/lib/contribution-data";

/**
 * GitHub-contribution-style activity grid for the rig.
 *
 * Each cell is one day in the 6-month window; the color hue maps to
 * the partner attributed for that day's dominant activity (Dedalus
 * runtime / Nous agent / Cursor codework / rig itself). Intensity
 * 0..4 maps to opacity steps. Click a cell to pin it; the right-side
 * panel shows the day's events with kind, label, and detail.
 *
 * Data comes from a deterministic seeded PRNG -- looks real, stays
 * stable across renders. The dashboard variant of this component
 * (forthcoming) will swap in live machine data via the same shape.
 */

const PARTNER_HUE: Record<ContributionDay["partner"], string> = {
	dedalus: "var(--ret-purple)",
	nous: "#9aa6c4",
	cursor: "#e8e6dc",
	openclaw: "#c9b48a",
	rig: "var(--ret-amber)",
};

const PARTNER_LABEL: Record<ContributionDay["partner"], string> = {
	dedalus: "dedalus",
	nous: "nous",
	cursor: "cursor",
	openclaw: "openclaw",
	rig: "rig",
};

// Map partner -> Logo Mark. "rig" has no Logo so we render an inline
// glyph in the legend instead.
const PARTNER_MARK: Record<Exclude<ContributionDay["partner"], "rig">, Mark> = {
	dedalus: "dedalus",
	nous: "nous",
	cursor: "cursor",
	openclaw: "openclaw",
};

const KIND_LABEL: Record<ContributionEvent["kind"], string> = {
	skill: "skill",
	mcp: "mcp",
	cron: "cron",
	cursor: "cursor",
	wake: "wake",
	sleep: "sleep",
	deploy: "deploy",
	milestone: "milestone",
};

const INTENSITY_OPACITY = [0.06, 0.3, 0.55, 0.78, 1] as const;

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
				"h-3 w-3 cursor-pointer border border-[var(--ret-border)] transition-transform duration-100",
				active ? "scale-[1.4] z-10 border-[var(--ret-text)]" : "hover:scale-[1.25]",
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
		const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
		const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
		if (monthsSeen.has(key)) return null;
		monthsSeen.add(key);
		return { idx, label: month.toLowerCase() };
	});
	return (
		<div
			className="grid"
			style={{
				gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
			}}
		>
			{weeks.map((_, weekIdx) => {
				const tag = labels.find((l) => l?.idx === weekIdx);
				return (
					<div
						key={weekIdx}
						className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]"
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
	partner: ContributionDay["partner"];
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
				active
					? "border-[var(--ret-text)] text-[var(--ret-text)]"
					: "border-[var(--ret-border)] text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)]",
			)}
		>
			{partner === "rig" ? (
				<span
					className="h-2 w-2"
					style={{ background: PARTNER_HUE.rig }}
					aria-hidden="true"
				/>
			) : (
				<Logo mark={PARTNER_MARK[partner]} size={12} />
			)}
			<span>{PARTNER_LABEL[partner]}</span>
			<span className="text-[var(--ret-text-muted)] tabular-nums">{count}</span>
		</button>
	);
}

export function ContributionGrid() {
	const weeks = useMemo(() => generateContributionGrid(182), []);
	const allDays = useMemo(() => weeks.flat(), [weeks]);

	// Default selected = the most recent day with at least one event.
	const initial =
		[...allDays].reverse().find((d) => d.events.length > 0) ?? allDays[allDays.length - 1];
	const [selected, setSelected] = useState<ContributionDay>(initial);
	const [filter, setFilter] = useState<ContributionDay["partner"] | "all">("all");

	const partnerCounts = useMemo(() => {
		const counts: Record<ContributionDay["partner"], number> = {
			dedalus: 0,
			nous: 0,
			cursor: 0,
			openclaw: 0,
			rig: 0,
		};
		for (const day of allDays) {
			if (day.intensity > 0) counts[day.partner] += 1;
		}
		return counts;
	}, [allDays]);

	const totalActive = allDays.filter((d) => d.intensity > 0).length;

	return (
		<div className="flex h-full flex-col border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex items-center gap-2">
					<ReticleLabel>ACTIVITY -- 6 MONTHS</ReticleLabel>
					<ReticleBadge>
						{totalActive} active days
					</ReticleBadge>
				</div>
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					hover or click a cell
				</p>
			</div>

			<div className="grid flex-1 gap-px bg-[var(--ret-border)] md:grid-cols-[1fr_minmax(0,200px)]">
				<div className="flex flex-col gap-3 bg-[var(--ret-bg)] px-3 py-3">
					<MonthLabels weeks={weeks} />
					<div
						className="grid gap-px"
						style={{
							gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
						}}
					>
						{weeks.map((week, weekIdx) => (
							<div key={`week-${weekIdx}`} className="grid grid-rows-7 gap-px">
								{Array.from({ length: 7 }).map((_, dayIdx) => {
									const day = week[dayIdx];
									if (!day) {
										return (
											<div
												key={`empty-${weekIdx}-${dayIdx}`}
												className="h-3 w-3"
												aria-hidden="true"
											/>
										);
									}
									const dimmed =
										filter !== "all" && day.partner !== filter;
									return (
										<div
											key={day.date}
											className={cn(
												dimmed && "opacity-25",
											)}
										>
											<CellSwatch
												day={day}
												active={day.date === selected.date}
												onSelect={setSelected}
											/>
										</div>
									);
								})}
							</div>
						))}
					</div>
					<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
						<div className="flex flex-wrap gap-1.5">
							<PartnerSwatch
								partner="dedalus"
								count={partnerCounts.dedalus}
								active={filter === "dedalus"}
								onClick={() =>
									setFilter(filter === "dedalus" ? "all" : "dedalus")
								}
							/>
							<PartnerSwatch
								partner="nous"
								count={partnerCounts.nous}
								active={filter === "nous"}
								onClick={() => setFilter(filter === "nous" ? "all" : "nous")}
							/>
							<PartnerSwatch
								partner="cursor"
								count={partnerCounts.cursor}
								active={filter === "cursor"}
								onClick={() =>
									setFilter(filter === "cursor" ? "all" : "cursor")
								}
							/>
							<PartnerSwatch
								partner="rig"
								count={partnerCounts.rig}
								active={filter === "rig"}
								onClick={() => setFilter(filter === "rig" ? "all" : "rig")}
							/>
						</div>
						<div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<span>less</span>
							{INTENSITY_OPACITY.map((o, idx) => (
								<span
									key={idx}
									className="h-2 w-2 border border-[var(--ret-border)]"
									style={{ background: "var(--ret-text)", opacity: o }}
									aria-hidden="true"
								/>
							))}
							<span>more</span>
						</div>
					</div>
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
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{formatted}
				</p>
				{day.partner === "rig" ? (
					<span
						className="h-3 w-3"
						style={{ background: PARTNER_HUE.rig }}
						aria-hidden="true"
					/>
				) : (
					<Logo mark={PARTNER_MARK[day.partner]} size={14} />
				)}
			</div>
			<div className="flex items-baseline gap-2">
				<p className="font-mono text-base tabular-nums text-[var(--ret-text)]">
					{day.events.length}
				</p>
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{day.events.length === 1 ? "event" : "events"}
				</p>
			</div>
			{day.events.length === 0 ? (
				<p className="font-mono text-[11px] text-[var(--ret-text-dim)]">
					no recorded activity. machine likely asleep.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{day.events.map((event, idx) => (
						<li
							key={`${day.date}-${idx}`}
							className="border-l border-[var(--ret-border)] pl-2"
						>
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{KIND_LABEL[event.kind]}
							</p>
							<p className="text-[12px] text-[var(--ret-text)]">{event.label}</p>
							{event.detail ? (
								<p className="font-mono text-[10px] text-[var(--ret-text-dim)]">
									{event.detail}
								</p>
							) : null}
						</li>
					))}
				</ul>
			)}
		</aside>
	);
}

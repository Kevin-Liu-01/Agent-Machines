import type {
	ActivityDataBounds,
	ActivityDay,
	ActivityTimeScale,
	HeatmapCell,
} from "./types";

export const DEFAULT_ACTIVITY_TIME_SCALE: ActivityTimeScale = "week";

export const ACTIVITY_TIME_SCALES: ReadonlyArray<{
	id: ActivityTimeScale;
	label: string;
	shortLabel: string;
	days?: number;
}> = [
	{ id: "week", label: "Week", shortLabel: "7d", days: 7 },
	{ id: "month", label: "Month", shortLabel: "30d", days: 30 },
	{ id: "quarter", label: "3 months", shortLabel: "90d", days: 90 },
	{ id: "halfYear", label: "6 months", shortLabel: "6mo", days: 183 },
	{ id: "all", label: "All", shortLabel: "all" },
];

export function activityTimeScaleLabel(scale: ActivityTimeScale): string {
	return ACTIVITY_TIME_SCALES.find((entry) => entry.id === scale)?.label ?? "Week";
}

export function dateKey(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function startOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

export function startOfWeek(d: Date): Date {
	const x = startOfDay(d);
	x.setDate(x.getDate() - x.getDay());
	return x;
}

export function resolveActivityWindow(
	scale: ActivityTimeScale,
	bounds: ActivityDataBounds | null,
	now = new Date(),
): { start: Date; end: Date } {
	const end = startOfDay(now);

	if (scale === "all") {
		if (bounds) {
			return {
				start: startOfWeek(startOfDay(new Date(`${bounds.first}T12:00:00`))),
				end: startOfDay(new Date(`${bounds.last}T12:00:00`)),
			};
		}
		return resolveActivityWindow("week", bounds, now);
	}

	const preset = ACTIVITY_TIME_SCALES.find((entry) => entry.id === scale);
	const spanDays = preset?.days ?? 7;
	const rawStart = new Date(end);
	rawStart.setDate(rawStart.getDate() - (spanDays - 1));

	return { start: startOfWeek(rawStart), end };
}

export function dataBoundsFromDays(days: ActivityDay[]): ActivityDataBounds | null {
	const active = days
		.filter((day) => day.level > 0 || day.events.length > 0)
		.sort((a, b) => a.date.localeCompare(b.date));
	if (active.length === 0) return null;
	return { first: active[0]!.date, last: active[active.length - 1]!.date };
}

export function daysToMap(days: ActivityDay[]): Map<string, ActivityDay> {
	return new Map(days.map((day) => [day.date, day]));
}

export function monthLabelsForRange(start: Date, end: Date): string[] {
	const labels: string[] = [];
	const cursor = new Date(start);
	cursor.setDate(1);
	while (cursor <= end) {
		labels.push(
			cursor.toLocaleString(undefined, { month: "short" }).toUpperCase(),
		);
		cursor.setMonth(cursor.getMonth() + 1);
	}
	return [...new Set(labels)];
}

export function emptyActivityDay(date: string): ActivityDay {
	return {
		date,
		level: 0,
		hue: "var(--ret-border)",
		agentKinds: [],
		providers: [],
		services: [],
		events: [],
	};
}

/** Week columns (Sun–Sat). Null = outside the visible range. */
export function buildHeatmapGrid(
	dayMap: Map<string, ActivityDay>,
	range: { start: Date; end: Date },
): HeatmapCell[][] {
	const weeks: HeatmapCell[][] = [];
	const rangeStart = startOfDay(range.start);
	const rangeEnd = startOfDay(range.end);
	let weekStart = startOfWeek(rangeStart);

	while (weekStart <= rangeEnd) {
		const week: HeatmapCell[] = [];
		for (let dow = 0; dow < 7; dow++) {
			const cursor = new Date(weekStart);
			cursor.setDate(weekStart.getDate() + dow);
			if (cursor < rangeStart || cursor > rangeEnd) {
				week.push(null);
				continue;
			}
			const key = dateKey(cursor);
			week.push(dayMap.get(key) ?? emptyActivityDay(key));
		}
		weeks.push(week);
		weekStart.setDate(weekStart.getDate() + 7);
	}

	return weeks;
}

export function monthLabelByWeek(weeks: HeatmapCell[][]): string[] {
	return weeks.map((week) => {
		const first = week.find((cell) => cell?.date);
		if (!first?.date) return "";
		return new Date(`${first.date}T12:00:00`)
			.toLocaleString(undefined, { month: "short" })
			.toUpperCase();
	});
}

export function countActiveDays(dayMap: Map<string, ActivityDay>): number {
	let n = 0;
	for (const day of dayMap.values()) {
		if (day.level > 0) n += 1;
	}
	return n;
}

export function countActiveDaysInRange(
	dayMap: Map<string, ActivityDay>,
	range: { start: Date; end: Date },
): number {
	const startKey = dateKey(range.start);
	const endKey = dateKey(range.end);
	let n = 0;
	for (const day of dayMap.values()) {
		if (day.level <= 0) continue;
		if (day.date >= startKey && day.date <= endKey) n += 1;
	}
	return n;
}

/** @deprecated Use resolveActivityWindow("halfYear", bounds) instead. */
export function activityRange(now = new Date()): { start: Date; end: Date } {
	return resolveActivityWindow("halfYear", null, now);
}

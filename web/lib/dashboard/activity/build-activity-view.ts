import {
	activityTimeScaleLabel,
	buildHeatmapGrid,
	countActiveDaysInRange,
	daysToMap,
	monthLabelByWeek,
	resolveActivityWindow,
} from "./grid";
import type { ActivityPayload, ActivityTimeScale, HeatmapCell } from "./types";

export type ActivityView = {
	grid: HeatmapCell[][];
	monthLabels: string[];
	activeDays: number;
	rangeLabel: string;
	window: { start: Date; end: Date };
};

export function buildActivityView(
	payload: ActivityPayload,
	scale: ActivityTimeScale,
): ActivityView {
	const dayMap = daysToMap(payload.days);
	const window = resolveActivityWindow(scale, payload.dataBounds);
	const grid = buildHeatmapGrid(dayMap, window);

	return {
		grid,
		monthLabels: monthLabelByWeek(grid),
		activeDays: countActiveDaysInRange(dayMap, window),
		rangeLabel: activityTimeScaleLabel(scale),
		window,
	};
}

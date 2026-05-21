import { dataBoundsFromDays } from "./grid";
import type {
	ActivityDay,
	ActivityPayload,
	AgentFilterChip,
	ServiceFilterChip,
} from "./types";

export function finalizeActivityPayload(
	dayMap: Map<string, ActivityDay>,
	agentFilters: AgentFilterChip[],
	serviceFilters: ServiceFilterChip[],
): ActivityPayload {
	const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
	return {
		ok: true,
		days,
		dataBounds: dataBoundsFromDays(days),
		agentFilters,
		serviceFilters,
		fetchedAt: new Date().toISOString(),
	};
}

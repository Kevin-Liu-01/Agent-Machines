import type { Mark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";
import type { AgentKind } from "@/lib/user-config/schema";

export type ActivityEventKind =
	| "deploy"
	| "cron"
	| "agent"
	| "gateway"
	| "audit"
	| "review"
	| "research"
	| "health";

export type ActivityEvent = {
	id: string;
	at: string;
	kind: ActivityEventKind;
	title: string;
	subtitle: string;
	agentKind?: AgentKind;
	service?: string;
	hue: string;
};

export type ActivityDay = {
	date: string;
	level: number;
	hue: string;
	agentKinds: AgentKind[];
	providers: string[];
	services: string[];
	events: ActivityEvent[];
};

export type HeatmapCell = ActivityDay | null;

export type AgentFilterChip = {
	id: string;
	label: string;
	mark: Mark;
	count: number;
};

export type ServiceFilterChip = {
	slug: ServiceSlug | string;
	label: string;
	count: number;
};

export type ActivityDataBounds = {
	first: string;
	last: string;
};

export type ActivityTimeScale = "week" | "month" | "quarter" | "halfYear" | "all";

export type ActivityPayload = {
	ok: true;
	days: ActivityDay[];
	dataBounds: ActivityDataBounds | null;
	agentFilters: AgentFilterChip[];
	serviceFilters: ServiceFilterChip[];
	fetchedAt: string;
};

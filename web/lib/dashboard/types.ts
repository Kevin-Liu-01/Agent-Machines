/**
 * Shared shapes for the dashboard's `/api/dashboard/*` routes.
 *
 * These are the wire formats the client UI consumes. They are deliberately
 * smaller than the upstream Dedalus / Hermes payloads -- the routes do the
 * shaping server-side so the browser never sees raw infra fields like host
 * IPs or revision tokens.
 */

export type MachinePhase =
	| "running"
	| "sleeping"
	| "starting"
	| "wake_pending"
	| "sleep_pending"
	| "placement_pending"
	| "accepted"
	| "failed"
	| "destroyed"
	| "destroying"
	| "unknown";

export type MachineSummary = {
	machineId: string;
	phase: MachinePhase;
	desired: "running" | "sleeping" | "destroyed" | "unknown";
	vcpu: number;
	memoryMib: number;
	storageGib: number;
	createdAt: string;
	configuredAt: string | null;
	reason: string | null;
};

export type GatewaySummary = {
	ok: boolean;
	status: number;
	model: string;
	apiHost: string;
	latencyMs: number;
	modelCount: number | null;
	error?: string;
};

export type SkillSummary = {
	slug: string;
	name: string;
	description: string;
	version: string;
	category: string;
	tags: string[];
	related: string[];
	bytes: number;
};

export type SkillDetail = SkillSummary & {
	body: string;
};

export type McpToolSummary = {
	name: string;
	title: string;
	description: string;
};

export type McpServerSummary = {
	name: string;
	transport: "stdio" | "http";
	source: string;
	tools: McpToolSummary[];
};

export type CronSummary = {
	name: string;
	schedule: string;
	prompt: string;
	skills: string[];
};

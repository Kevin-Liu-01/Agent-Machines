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
	/**
	 * Dedalus controlplane progress markers. Surface them on the
	 * onboarding boot step + the dashboard wake banner so operators
	 * see meaningful "machine is doing work" signals instead of just
	 * a phase label that hasn't changed for 90 seconds.
	 */
	statusReason: string | null;
	lastTransitionAt: string | null;
	lastProgressAt: string | null;
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

/**
 * Either a successful read of on-VM data, or a typed reason we couldn't
 * read it. Routes return one of these so the UI can render a helpful
 * empty state instead of a generic 502. The dashboard PR2 pages
 * (sessions / logs / cursor) all share this envelope.
 */
export type LiveDataEnvelope<T> =
	| { ok: true; data: T; fetchedAt: string }
	| {
			ok: false;
			reason: "machine_offline" | "config_missing" | "exec_failed";
			message: string;
	  };

export type SessionRecord = {
	id: string;
	preview: string;
	updatedAt: string | null;
	bytes: number;
};

export type SessionsPayload = {
	sessions: SessionRecord[];
	totalSessions: number;
	totalBytes: number;
	dbPath: string;
};

export type LogLine = {
	at: string | null;
	level: "info" | "warn" | "error" | "debug" | "other";
	source: string;
	message: string;
};

export type LogsPayload = {
	lines: LogLine[];
	files: Array<{ path: string; bytes: number }>;
	tailLines: number;
};

export type CursorRun = {
	loggedAt: string;
	kind: "one_shot" | "resume";
	agentId: string;
	runId: string;
	status: string;
	durationMs: number | null;
	model: string;
	workingDir: string;
	loadedSkills: string[];
	prompt: string;
	finalText: string;
};

export type CursorRunsPayload = {
	runs: CursorRun[];
	totalRuns: number;
	logPath: string;
};

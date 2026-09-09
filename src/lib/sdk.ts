/**
 * Client for the hosted control plane: provision -> bootstrap -> run over
 * HTTP. The direct-to-substrate path with no control plane is the mux
 * (`createMux`, src/mux/index.ts); this class is the other surface, and the
 * two do not yet share a router (docs/ROADMAP.md item 0).
 */

import {
	type AgentCreateInput,
	type AgentKind,
	type AgentRoute,
	type MachineSpec,
	type NativeUpstream,
	type SandboxKind,
	resolveAgentRoute,
} from "./routing.js";

export type {
	AgentCreateInput,
	AgentKind,
	AgentRoute,
	MachineSpec,
	NativeUpstream,
	SandboxKind,
};

export type AgentMachinesOptions = {
	baseUrl?: string;
	apiKey?: string;
	fetch?: typeof fetch;
	/** Request separate bootstrap on legacy servers. Default: true.
	 * Current hosted launches always include bootstrap; false does not disable it. */
	bootstrap?: boolean;
	/** Total time for each create/run, including HTTP and journal waits. Default: 5 minutes. */
	timeoutMs?: number;
	/** Delay between journal reads while work is pending. Default: 1 second. */
	pollIntervalMs?: number;
};

export type AgentCallOptions = {
	/** Stop waiting locally; this does not cancel work already accepted by the server. */
	signal?: AbortSignal;
	/** Override the client's total create/run deadline. */
	timeoutMs?: number;
};

export type AgentRunOptions = AgentCallOptions;

export type AgentRunResult = {
	text: string;
	machineId: string;
	agent: AgentKind;
	model: string;
};

export type CreatedAgent = {
	id: string;
	machineId: string;
	route: AgentRoute;
	run(prompt: string, options?: AgentRunOptions): Promise<AgentRunResult>;
};

type Payload = Record<string, unknown>;
type Operation = {
	id: string;
	workerId?: string;
	status: "queued" | "running" | "succeeded" | "failed";
	result?: unknown;
	error?: unknown;
};
type HttpResult = { status: number; payload: Payload };

const DEFAULT_BASE_URL = "http://localhost:3210";
const DEFAULT_TIMEOUT_MS = 300_000;

export class AgentMachines {
	private readonly baseUrl: string;
	private readonly apiKey: string | null;
	private readonly fetcher: typeof fetch;
	private readonly shouldBootstrap: boolean;
	private readonly timeoutMs: number;
	private readonly pollIntervalMs: number;

	constructor(options: AgentMachinesOptions = {}) {
		this.baseUrl = normalizeBaseUrl(
			options.baseUrl ??
				process.env.AGENT_MACHINES_URL ??
				process.env.AM_URL ??
				DEFAULT_BASE_URL,
		);
		this.apiKey =
			options.apiKey ??
			process.env.AGENT_MACHINES_API_KEY ??
			process.env.AM_API_KEY ??
			null;
		this.fetcher = options.fetch ?? fetch;
		this.shouldBootstrap = options.bootstrap ?? true;
		this.timeoutMs = validDuration(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
		this.pollIntervalMs = validDuration(options.pollIntervalMs ?? 1_000, "pollIntervalMs");
	}

	async create(
		input: AgentCreateInput,
		options: AgentCallOptions = {},
	): Promise<CreatedAgent> {
		const route = resolveAgentRoute(input);
		return this.withDeadline("create", options, async (signal) => {
			const submitted = await this.request(
				"/api/dashboard/admin/provision-machine",
				{
					method: "POST",
					body: {
						providerKind: route.sandbox,
						agentKind: route.agent,
						model: route.model,
						spec: route.spec,
						name: route.name,
						persistent: route.persistent,
						force: true,
						startBootstrap: false,
						gatewayProfileId: route.gatewayProfileId,
						environmentProfileId: route.environmentProfileId,
					},
					signal,
				},
			);
			// Current servers journal provision AND bootstrap together. There is
			// no machine ID yet at acceptance, and failover may replace an early
			// placement. Pin the logical Worker and use only the settled placement.
			const provision = await this.settle(submitted, signal);
			const placedWorker = asRecord(provision.payload.worker);
			const placement = asRecord(asRecord(placedWorker?.status)?.placement);
			const machineId = provision.payload.machineId ?? placement?.sandboxId;
			if (typeof machineId !== "string" || !machineId.trim()) {
				throw new Error(messageFor(provision.payload, "provision response is missing a confirmed machine ID / placement"));
			}
			const currentPhase = asRecord(placedWorker?.status)?.phase;
			const provisionPhase = currentPhase ?? asRecord(provision.operation?.result)?.phase;
			// The journal is historical; the current Worker may already be
			// migrating or reconciling another update. Never submit another
			// bootstrap or return that concurrent transition as ready.
			if ((provision.operation && currentPhase !== undefined && currentPhase !== "running")
				|| (typeof provisionPhase === "string" && ["sleeping", "deleting", "deleted", "error"].includes(provisionPhase))) {
				throw new Error(`Launch operation completed, but the Worker is ${provisionPhase}, not running.`);
			}
			const bootstrapped = Boolean(provision.operation) && provisionPhase === "running";

			if (this.shouldBootstrap && !bootstrapped) {
				const bootstrap = await this.request(
					"/api/dashboard/admin/bootstrap",
					{
						method: "POST",
						body: { machineId },
						signal,
					},
				);
				const completed = await this.settle(bootstrap, signal, machineId);
				if (!completed.operation && completed.payload.ok !== true) {
					throw new Error("Malformed bootstrap response: readiness was not confirmed.");
				}
				const result = asRecord(completed.operation?.result);
				const worker = asRecord(completed.payload.worker);
				const phase = asRecord(worker?.status)?.phase ?? result?.phase;
				if (typeof phase === "string" && phase !== "running") {
					throw new Error(`Bootstrap operation completed, but the Worker is ${phase}, not running.`);
				}
			}

			return new AgentMachinesAgent(this, machineId, route);
		});
	}

	async run(
		machineId: string,
		route: AgentRoute,
		prompt: string,
		options: AgentRunOptions = {},
	): Promise<AgentRunResult> {
		return this.withDeadline("run", options, async (signal) => {
			const submitted = await this.request("/api/agents/run", {
				method: "POST",
				body: {
					machineId,
					prompt,
					timeoutMs: options.timeoutMs,
				},
				signal,
			});
			const completed = await this.settle(submitted, signal, machineId);
			const result = completed.operation ? asRecord(completed.operation.result) : completed.payload;
			assertRunResult(result, Boolean(completed.operation));
			return {
				text: result.text,
				machineId,
				// The acceptance captures the executing runtime/model. Do not use a
				// later Worker spec: it may have changed while this operation ran.
				agent: isAgentKind(submitted.payload.agent) ? submitted.payload.agent : route.agent,
				model: typeof submitted.payload.model === "string" ? submitted.payload.model : route.model,
			};
		});
	}

	/** Read the journal only. Never retry a mutation or trust a supplied statusUrl. */
	private async settle(
		response: HttpResult,
		signal: AbortSignal,
		machineId?: string,
	): Promise<{ payload: Payload; operation?: Operation }> {
		let payload = response.payload;
		const pending = response.status === 202 || payload.status === "queued"
			|| payload.status === "running" || payload.background === true;
		if (!pending && payload.operation === undefined) return { payload };
		let operation = parseOperation(payload.operation);
		const operationId = operation.id;
		const workerId = typeof payload.workerId === "string" ? payload.workerId : operation.workerId;
		for (;;) {
			signal.throwIfAborted();
			const returnedWorkerId = asRecord(payload.worker)?.id;
			if (workerId && (operation.workerId !== workerId
				|| (returnedWorkerId !== undefined && returnedWorkerId !== workerId))) {
				throw new Error(`Operation ${operationId} journal refers to a different Worker.`);
			}
			if (operation.status === "failed") {
				throw new Error(typeof operation.error === "string" ? operation.error : `Operation ${operationId} failed.`);
			}
			if (machineId !== undefined && typeof payload.machineId === "string" && payload.machineId !== machineId) {
				throw new Error(`Operation ${operationId} now refers to a different machine. Inspect the Worker before running again.`);
			}
			if (operation.status === "succeeded") return { payload, operation };
			({ payload } = await this.request(
				`/api/dashboard/control-plane/operations/${encodeURIComponent(operationId)}`,
				{ method: "GET", signal },
			));
			operation = parseOperation(payload.operation, operationId);
			if (operation.status === "queued" || operation.status === "running") {
				await pause(this.pollIntervalMs, signal);
			}
		}
	}

	private async request(
		path: string,
		options: { method: "POST" | "GET"; body?: unknown; signal: AbortSignal },
	): Promise<HttpResult> {
		options.signal.throwIfAborted();
		const response = await abortable(this.fetcher(urlFor(this.baseUrl, path), {
			method: options.method,
			headers: this.headers(),
			...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
			signal: options.signal,
			redirect: "error",
		}), options.signal);
		const decoded: unknown = await abortable(response.json().catch(() => null), options.signal);
		options.signal.throwIfAborted();
		const payload = asRecord(decoded);
		if (!response.ok) {
			if (response.status === 401 && !this.apiKey) {
				throw new Error(
					"Agent Machines API key required. Create one in Dashboard -> Settings -> Developer API, then set AGENT_MACHINES_API_KEY.",
				);
			}
			throw new Error(messageFor(payload, `HTTP ${response.status}`));
		}
		if (!payload) throw new Error("Malformed response: expected a JSON object.");
		if (payload.ok === false) throw new Error(messageFor(payload, "Agent Machines request failed."));
		return { status: response.status, payload };
	}

	private async withDeadline<T>(
		action: string,
		options: AgentCallOptions,
		work: (signal: AbortSignal) => Promise<T>,
	): Promise<T> {
		const timeoutMs = validDuration(options.timeoutMs ?? this.timeoutMs, "timeoutMs");
		options.signal?.throwIfAborted();
		const controller = new AbortController();
		const onAbort = () => controller.abort(options.signal?.reason);
		options.signal?.addEventListener("abort", onAbort, { once: true });
		const timer = setTimeout(() => {
			const error = new Error(`Agent Machines ${action} timed out; submitted work may still be running. No request was replayed.`);
			error.name = "TimeoutError";
			controller.abort(error);
		}, timeoutMs);
		try {
			return await abortable(work(controller.signal), controller.signal);
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", onAbort);
		}
	}

	private headers(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
		};
	}
}

export class AgentMachinesAgent implements CreatedAgent {
	readonly id: string;
	readonly machineId: string;
	readonly route: AgentRoute;

	constructor(
		private readonly client: AgentMachines,
		machineId: string,
		route: AgentRoute,
	) {
		this.id = machineId;
		this.machineId = machineId;
		this.route = route;
	}

	run(prompt: string, options?: AgentRunOptions): Promise<AgentRunResult> {
		return this.client.run(this.machineId, this.route, prompt, options);
	}
}

/** Lowercase constructor requested by the public API snippet. */
export class am extends AgentMachines {}

function normalizeBaseUrl(value: string): string {
	return value.trim().replace(/\/$/, "");
}

function urlFor(baseUrl: string, path: string): string {
	return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function validDuration(value: number, name: string): number {
	if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
		throw new Error(`${name} must be a positive integer no greater than 2147483647.`);
	}
	return value;
}

function asRecord(value: unknown): Payload | null {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Payload : null;
}

function messageFor(payload: Payload | null, fallback: string): string {
	return typeof payload?.message === "string" ? payload.message : typeof payload?.error === "string" ? payload.error : fallback;
}

function parseOperation(value: unknown, expectedId?: string): Operation {
	const operation = asRecord(value);
	if (!operation || typeof operation.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(operation.id)
		|| (expectedId !== undefined && operation.id !== expectedId)
		|| typeof operation.status !== "string"
		|| !["queued", "running", "succeeded", "failed"].includes(operation.status)) {
		throw new Error("Malformed operation journal response: a matching operation ID and recognized status are required.");
	}
	return operation as Operation;
}

function assertRunResult(result: Payload | null, journal: boolean): asserts result is Payload & { text: string } {
	if (!result || typeof result.text !== "string") throw new Error("Agent run result is missing text.");
	if ((journal || result.exitCode !== undefined) && result.exitCode !== 0) {
		throw new Error(`Agent run exited with ${result.exitCode ?? "an unknown status"}.`);
	}
	if (result.ok === false) throw new Error(messageFor(result, "Agent run failed."));
	for (const value of Array.isArray(result.events) ? result.events : []) {
		const event = asRecord(value);
		if (event?.type === "error") throw new Error(messageFor(event, "Agent reported failure."));
		if (event?.type === "result" && event.isError === true) {
			throw new Error(typeof event.text === "string" && event.text ? event.text : "Agent reported failure.");
		}
	}
}

function isAgentKind(value: unknown): value is AgentKind {
	return typeof value === "string" && ["claude-code", "codex", "openclaw", "hermes"].includes(value);
}

/** Also bounds injected fetch implementations that ignore AbortSignal. */
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
	});
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
	});
}

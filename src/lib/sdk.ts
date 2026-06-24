import {
	type AgentCreateInput,
	type AgentKind,
	type AgentRoute,
	type MachineSpec,
	type SandboxKind,
	resolveAgentRoute,
} from "./routing.js";

export type {
	AgentCreateInput,
	AgentKind,
	AgentRoute,
	MachineSpec,
	SandboxKind,
};

export type AgentMachinesOptions = {
	baseUrl?: string;
	apiKey?: string;
	fetch?: typeof fetch;
	/** Run bootstrap after provision. Defaults to true. */
	bootstrap?: boolean;
};

export type AgentRunOptions = {
	signal?: AbortSignal;
	timeoutMs?: number;
};

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

type ProvisionResponse = {
	ok?: boolean;
	machineId?: string;
	error?: string;
	message?: string;
};

type BootstrapResponse = {
	ok?: boolean;
	error?: string;
	message?: string;
};

type RunResponse = {
	ok?: boolean;
	text?: string;
	error?: string;
	message?: string;
};

const DEFAULT_BASE_URL = "http://localhost:3210";

export class AgentMachines {
	private readonly baseUrl: string;
	private readonly apiKey: string | null;
	private readonly fetcher: typeof fetch;
	private readonly shouldBootstrap: boolean;

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
	}

	async create(input: AgentCreateInput): Promise<CreatedAgent> {
		const route = resolveAgentRoute(input);
		const provision = await this.request<ProvisionResponse>(
			"/api/dashboard/admin/provision-machine",
			{
				method: "POST",
				body: {
					providerKind: route.sandbox,
					agentKind: route.agent,
					model: route.model,
					spec: route.spec,
					name: route.name,
					force: true,
					gatewayProfileId: route.gatewayProfileId,
					environmentProfileId: route.environmentProfileId,
				},
			},
		);
		if (!provision.machineId) {
			throw new Error(provision.message ?? provision.error ?? "provision failed");
		}

		if (this.shouldBootstrap) {
			const bootstrap = await this.request<BootstrapResponse>(
				"/api/dashboard/admin/bootstrap",
				{
					method: "POST",
					body: { machineId: provision.machineId },
				},
			);
			if (bootstrap.ok === false) {
				throw new Error(
					bootstrap.message ?? bootstrap.error ?? "bootstrap failed",
				);
			}
		}

		return new AgentMachinesAgent(this, provision.machineId, route);
	}

	async run(
		machineId: string,
		route: AgentRoute,
		prompt: string,
		options: AgentRunOptions = {},
	): Promise<AgentRunResult> {
		const result = await this.request<RunResponse>("/api/agents/run", {
			method: "POST",
			body: {
				machineId,
				prompt,
				timeoutMs: options.timeoutMs,
			},
			signal: options.signal,
		});
		if (result.ok === false) {
			throw new Error(result.message ?? result.error ?? "agent run failed");
		}
		return {
			text: result.text ?? "",
			machineId,
			agent: route.agent,
			model: route.model,
		};
	}

	private async request<T>(
		path: string,
		options: { method: "POST"; body: unknown; signal?: AbortSignal },
	): Promise<T> {
		const response = await this.fetcher(urlFor(this.baseUrl, path), {
			method: options.method,
			headers: this.headers(),
			body: JSON.stringify(options.body),
			signal: options.signal,
		});
		const payload = (await response.json().catch(() => ({}))) as T & {
			error?: string;
			message?: string;
		};
		if (!response.ok) {
			throw new Error(
				payload.message ?? payload.error ?? `HTTP ${response.status}`,
			);
		}
		return payload;
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

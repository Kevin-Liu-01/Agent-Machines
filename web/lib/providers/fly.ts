/**
 * Fly Machines provider.
 *
 * Fly's API is app-scoped: machines live under an app, and volumes are
 * separate resources. The Agent Machines `MachineRef.id` only has one
 * string slot, so this adapter stores Fly machine IDs as
 * `<appName>:<machineId>`. New provisioned machines use that encoded
 * form; legacy raw machine IDs fail closed with a clear message because
 * there is no safe way to infer the app name from the machine ID alone.
 */

import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type MachineProvider,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

export type FlyCreds = {
	apiKey: string;
	orgSlug?: string;
};

const NOT_YET = (op: string): MachineProviderError =>
	new MachineProviderError(
		"fly",
		"not_supported",
		`Fly Machines ${op} is not available through this provider yet.`,
	);

const API = "https://api.machines.dev/v1";
const DEFAULT_REGION = "sjc";
const DEFAULT_IMAGE = "ubuntu:24.04";

type FlyMachine = {
	id: string;
	name?: string;
	state?: string;
	created_at?: string;
	region?: string;
	config?: {
		guest?: {
			cpus?: number;
			memory_mb?: number;
		};
	};
};

type FlyVolume = {
	id: string;
};

function splitId(encoded: string): { appName: string; machineId: string } {
	const idx = encoded.indexOf(":");
	if (idx <= 0 || idx === encoded.length - 1) {
		throw new MachineProviderError(
			"fly",
			"fatal",
			`Fly machine id '${encoded}' must be encoded as <appName>:<machineId>.`,
		);
	}
	return { appName: encoded.slice(0, idx), machineId: encoded.slice(idx + 1) };
}

function mapState(state: string | undefined): ProviderMachineSummary["state"] {
	switch (state) {
		case "started":
			return "ready";
		case "starting":
		case "created":
		case "replacing":
			return "starting";
		case "stopped":
		case "suspended":
			return "sleeping";
		case "destroying":
			return "destroying";
		case "destroyed":
			return "destroyed";
		case "failed":
			return "error";
		default:
			return "unknown";
	}
}

export class FlyProvider implements MachineProvider {
	readonly kind = "fly" as const;
	readonly capabilities: ProviderCapabilities = {
		runtime: "persistent-machine",
		canProvision: true,
		canWake: true,
		canSleep: true,
		canDestroy: true,
		canExec: true,
		hasPersistentDisk: true,
		usesExternalStorage: false,
	};
	private readonly apiKey: string;
	private readonly orgSlug: string | null;

	constructor(creds: FlyCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"fly",
				"missing_credentials",
				"Fly.io API token is required for the Fly provider.",
			);
		}
		this.apiKey = creds.apiKey;
		this.orgSlug = creds.orgSlug ?? null;
	}

	get hasCredentials(): boolean {
		return Boolean(this.apiKey);
	}

	async provision(input: ProvisionInput): Promise<ProvisionResult> {
		const appName = appNameFor(input.name);
		await this.ensureApp(appName);
		const volume = await this.createVolume(appName, input.spec.storageGib);
		const response = await this.fetch(`/apps/${appName}/machines`, {
			method: "POST",
			body: JSON.stringify({
				name: input.name ?? appName,
				region: DEFAULT_REGION,
				config: {
					image: DEFAULT_IMAGE,
					guest: {
						cpus: input.spec.vcpu,
						memory_mb: input.spec.memoryMib,
					},
					env: {
						AGENT_KIND: input.agentKind ?? "hermes",
						AGENT_MODEL: input.model ?? "",
						...(input.env ?? {}),
					},
					mounts: [{ volume: volume.id, path: "/home/machine" }],
					services: [
						{
							ports: [
								{ port: 443, handlers: ["tls", "http"] },
								{ port: 80, handlers: ["http"] },
							],
							internal_port: 8642,
							protocol: "tcp",
						},
					],
					auto_destroy: false,
				},
			}),
		});
		if (!response.ok) {
			throw await this.error("provision", response);
		}
		const machine = (await response.json()) as FlyMachine;

		try {
			await this.fetch(`/apps/${appName}/ips`, {
				method: "POST",
				body: JSON.stringify({ type: "shared_v4" }),
			});
			await this.fetch(`/apps/${appName}/ips`, {
				method: "POST",
				body: JSON.stringify({ type: "v6" }),
			});
		} catch {
			// IP allocation failure is non-fatal -- machine still works via exec
		}

		return {
			id: `${appName}:${machine.id}`,
			state: mapState(machine.state),
			rawPhase: machine.state ?? "unknown",
		};
	}

	async state(machineId: string): Promise<ProviderMachineSummary> {
		const { appName, machineId: flyMachineId } = splitId(machineId);
		const response = await this.fetch(`/apps/${appName}/machines/${flyMachineId}`);
		if (!response.ok) {
			throw await this.error("state", response);
		}
		const machine = (await response.json()) as FlyMachine;
		return this.summary(`${appName}:${machine.id}`, machine);
	}

	async wake(machineId: string): Promise<ProviderMachineSummary> {
		const { appName, machineId: flyMachineId } = splitId(machineId);
		const response = await this.fetch(
			`/apps/${appName}/machines/${flyMachineId}/start`,
			{ method: "POST" },
		);
		if (!response.ok && response.status !== 409) {
			throw await this.error("wake", response);
		}
		return this.state(machineId);
	}

	async sleep(machineId: string): Promise<ProviderMachineSummary> {
		const { appName, machineId: flyMachineId } = splitId(machineId);
		const response = await this.fetch(
			`/apps/${appName}/machines/${flyMachineId}/stop`,
			{ method: "POST" },
		);
		if (!response.ok && response.status !== 409) {
			throw await this.error("sleep", response);
		}
		return this.state(machineId);
	}

	async destroy(machineId: string): Promise<void> {
		const { appName, machineId: flyMachineId } = splitId(machineId);
		const response = await this.fetch(
			`/apps/${appName}/machines/${flyMachineId}?force=true`,
			{ method: "DELETE" },
		);
		if (!response.ok && response.status !== 404) {
			throw await this.error("destroy", response);
		}
	}
	async exec(
		compositeId: string,
		command: string,
		options?: ExecOptions,
	): Promise<ExecResult> {
		const { appName, machineId } = splitId(compositeId);
		const timeoutSec = Math.ceil((options?.timeoutMs ?? 30_000) / 1000);

		const summary = await this.state(compositeId);
		if (summary.state === "sleeping" || summary.state === "destroyed") {
			await this.wake(compositeId);
			for (let i = 0; i < 30; i++) {
				await new Promise((r) => setTimeout(r, 2_000));
				const s = await this.state(compositeId);
				if (s.state === "ready") break;
			}
		}

		const response = await this.fetch(
			`/apps/${appName}/machines/${machineId}/exec`,
			{
				method: "POST",
				body: JSON.stringify({
					cmd: ["/bin/bash", "-c", command],
					timeout: timeoutSec,
				}),
			},
		);

		if (!response.ok) {
			const text = await response.text();
			throw new MachineProviderError(
				"fly",
				response.status >= 500 ? "transient" : "fatal",
				`fly exec ${response.status}: ${text.slice(0, 200)}`,
			);
		}

		const body = await response.json();
		const stdout =
			typeof body.stdout === "string"
				? body.stdout.length > 0
					? Buffer.from(body.stdout, "base64").toString()
					: ""
				: (body.output ?? "");
		const stderr =
			typeof body.stderr === "string"
				? body.stderr.length > 0
					? Buffer.from(body.stderr, "base64").toString()
					: ""
				: "";
		const exitCode =
			typeof body.exit_code === "number"
				? body.exit_code
				: typeof body.exitCode === "number"
					? body.exitCode
					: 0;

		return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
	}

	async getPublicUrl(compositeId: string, _port: number): Promise<string | null> {
		const { appName } = splitId(compositeId);
		return `https://${appName}.fly.dev`;
	}

	private async ensureApp(appName: string): Promise<void> {
		const response = await this.fetch("/apps", {
			method: "POST",
			body: JSON.stringify({
				app_name: appName,
				org_slug: this.orgSlug ?? "personal",
			}),
		});
		if (!response.ok && response.status !== 409) {
			throw await this.error("create app", response);
		}
	}

	private async createVolume(appName: string, sizeGb: number): Promise<FlyVolume> {
		const response = await this.fetch(`/apps/${appName}/volumes`, {
			method: "POST",
			body: JSON.stringify({
				name: "agent_machines_state",
				size_gb: sizeGb,
				region: DEFAULT_REGION,
				encrypted: true,
			}),
		});
		if (!response.ok) {
			throw await this.error("create volume", response);
		}
		return (await response.json()) as FlyVolume;
	}

	private async fetch(path: string, init?: RequestInit): Promise<Response> {
		return fetch(`${API}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
				...(init?.headers ?? {}),
			},
			cache: "no-store",
		});
	}

	private summary(id: string, machine: FlyMachine): ProviderMachineSummary {
		return {
			id,
			state: mapState(machine.state),
			rawPhase: machine.state ?? "unknown",
			spec: {
				vcpu: machine.config?.guest?.cpus ?? 1,
				memoryMib: machine.config?.guest?.memory_mb ?? 2048,
				storageGib: 10,
			},
			createdAt: machine.created_at ?? null,
			lastError: null,
		};
	}

	private async error(op: string, response: Response): Promise<MachineProviderError> {
		const text = await response.text().catch(() => "");
		return new MachineProviderError(
			"fly",
			response.status === 429 ? "rate_limited" : "transient",
			`Fly ${op} ${response.status}: ${text.slice(0, 240)}`,
		);
	}
}

function appNameFor(name: string | undefined): string {
	const suffix = Math.random().toString(36).slice(2, 10);
	const base = (name ?? "agent-machine")
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
	return `${base || "agent-machine"}-${suffix}`;
}

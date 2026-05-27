/**
 * Vercel Sandbox provider.
 *
 * Wraps `@vercel/sandbox` for persistent Firecracker microVMs on Vercel.
 * Sandboxes are persistent by default — filesystem state auto-saves on stop
 * and resumes on the next command via `Sandbox.get()` / `getOrCreate()`.
 *
 * Auth: VERCEL_OIDC_TOKEN (automatic on Vercel) or token + teamId + projectId.
 *
 * State mapping:
 *   running     -> ready
 *   stopped     -> sleeping
 *   pending / stopping / snapshotting -> starting
 *   failed / aborted -> error
 */

import { randomUUID } from "node:crypto";

import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type MachineProvider,
	type MachineState,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

const HERMES_PORT = 8642;
const OPENCLAW_PORT = 18789;
const GATEWAY_PORTS = [HERMES_PORT, OPENCLAW_PORT] as const;
const DEFAULT_SESSION_TIMEOUT_MS = 3_600_000;

export type VercelCreds = {
	token: string;
	teamId: string;
	projectId: string;
};

type SandboxCredentials = {
	token?: string;
	teamId?: string;
	projectId?: string;
};

type VercelSandboxStatus =
	| "aborted"
	| "pending"
	| "running"
	| "stopping"
	| "stopped"
	| "failed"
	| "snapshotting";

async function getSandboxClass() {
	const { Sandbox } = await import("@vercel/sandbox");
	return Sandbox;
}

function mapStatus(status: string | undefined): MachineState {
	switch (status as VercelSandboxStatus) {
		case "running":
			return "ready";
		case "stopped":
			return "sleeping";
		case "pending":
		case "stopping":
		case "snapshotting":
			return "starting";
		case "failed":
		case "aborted":
			return "error";
		default:
			return "unknown";
	}
}

function classifyError(err: unknown): "missing_credentials" | "transient" | "fatal" {
	const msg = err instanceof Error ? err.message : String(err);
	if (
		msg.includes("401") ||
		msg.includes("403") ||
		msg.includes("Unauthorized") ||
		msg.includes("authentication")
	) {
		return "missing_credentials";
	}
	if (
		msg.includes("404") ||
		msg.includes("not found") ||
		msg.includes("Not Found") ||
		msg.includes("not_found")
	) {
		return "fatal";
	}
	return "transient";
}

function bashViaBase64(command: string): string {
	const b64 = Buffer.from(command, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

function sanitizeSandboxName(raw: string): string {
	const cleaned = raw
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 63);
	return cleaned.length > 0 ? cleaned : `am-${randomUUID().slice(0, 12)}`;
}

function readEnvCredentials(): VercelCreds | null {
	const token = process.env.VERCEL_TOKEN?.trim();
	const teamId = process.env.VERCEL_TEAM_ID?.trim();
	const projectId = process.env.VERCEL_PROJECT_ID?.trim();
	if (token && teamId && projectId) {
		return { token, teamId, projectId };
	}
	return null;
}

function hasOidcCredentials(): boolean {
	return Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
}

function toCredentialParams(creds: VercelCreds | null): SandboxCredentials {
	if (!creds) return {};
	return {
		token: creds.token,
		teamId: creds.teamId,
		projectId: creds.projectId,
	};
}

export class VercelProvider implements MachineProvider {
	readonly kind = "vercel" as const;
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

	private readonly creds: VercelCreds | null;

	constructor(creds?: VercelCreds | null) {
		this.creds = creds ?? readEnvCredentials();
		if (!this.creds && !hasOidcCredentials()) {
			throw new MachineProviderError(
				"vercel",
				"missing_credentials",
				"Vercel Sandbox credentials required: set token + teamId + projectId, or run on Vercel with OIDC.",
			);
		}
	}

	get hasCredentials(): boolean {
		return Boolean(this.creds) || hasOidcCredentials();
	}

	private authParams(): SandboxCredentials {
		return toCredentialParams(this.creds);
	}

	private async connect(name: string, resume = true) {
		const Sandbox = await getSandboxClass();
		return Sandbox.get({
			...this.authParams(),
			name,
			resume,
		});
	}

	private async lookupSummary(name: string): Promise<{
		status: string;
		vcpus?: number;
		memory?: number;
		createdAt?: number;
	}> {
		const Sandbox = await getSandboxClass();
		const auth = this.authParams();
		try {
			const sandbox = await Sandbox.get({
				...auth,
				name,
				resume: false,
			});
			return {
				status: sandbox.status,
				vcpus: sandbox.vcpus,
				memory: sandbox.memory,
				createdAt: sandbox.createdAt.getTime(),
			};
		} catch {
			const projectId = this.creds?.projectId ?? process.env.VERCEL_PROJECT_ID?.trim();
			if (!projectId) {
				throw new MachineProviderError(
					"vercel",
					"fatal",
					`vercel state lookup failed for ${name}: missing projectId`,
				);
			}
			const paginator = await Sandbox.list({
				...auth,
				projectId,
				namePrefix: name,
				limit: 20,
			});
			for await (const entry of paginator) {
				if (entry.name === name) {
					return {
						status: entry.status,
						vcpus: entry.vcpus,
						memory: entry.memory,
						createdAt: entry.createdAt,
					};
				}
			}
			throw new MachineProviderError(
				"vercel",
				"fatal",
				`vercel sandbox not found: ${name}`,
			);
		}
	}

	async provision(input: ProvisionInput): Promise<ProvisionResult> {
		const name = sanitizeSandboxName(input.name ?? `am-${randomUUID().slice(0, 12)}`);
		const vcpus = Math.min(Math.max(input.spec?.vcpu ?? 1, 1), 8);
		try {
			const Sandbox = await getSandboxClass();
			const sandbox = await Sandbox.getOrCreate({
				...this.authParams(),
				name,
				persistent: true,
				runtime: "node24",
				resources: { vcpus },
				ports: [...GATEWAY_PORTS],
				timeout: DEFAULT_SESSION_TIMEOUT_MS,
				tags: {
					"agent-machines": "true",
					"agent-kind": input.agentKind ?? "hermes",
				},
				env: {
					HOME: "/vercel/sandbox",
					AGENT_KIND: input.agentKind ?? "hermes",
					AGENT_MODEL: input.model ?? "",
					...(input.env ?? {}),
				},
			});
			return {
				id: sandbox.name,
				state: mapStatus(sandbox.status),
				rawPhase: sandbox.status,
			};
		} catch (err) {
			throw new MachineProviderError(
				"vercel",
				classifyError(err),
				`vercel provision failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async state(machineId: string): Promise<ProviderMachineSummary> {
		try {
			const info = await this.lookupSummary(machineId);
			return {
				id: machineId,
				state: mapStatus(info.status),
				rawPhase: info.status,
				spec: {
					vcpu: info.vcpus ?? 1,
					memoryMib: info.memory ?? 2048,
					storageGib: 0,
				},
				createdAt: info.createdAt ? new Date(info.createdAt).toISOString() : null,
				lastError: null,
			};
		} catch (err) {
			if (err instanceof MachineProviderError) throw err;
			throw new MachineProviderError(
				"vercel",
				classifyError(err),
				`vercel state lookup failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async wake(machineId: string): Promise<ProviderMachineSummary> {
		try {
			await this.connect(machineId, true);
			return this.state(machineId);
		} catch (err) {
			throw new MachineProviderError(
				"vercel",
				classifyError(err),
				`vercel wake failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async sleep(machineId: string): Promise<ProviderMachineSummary> {
		try {
			const sandbox = await this.connect(machineId, true);
			await sandbox.stop();
			return this.state(machineId);
		} catch (err) {
			throw new MachineProviderError(
				"vercel",
				classifyError(err),
				`vercel sleep (stop) failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async destroy(machineId: string): Promise<void> {
		try {
			const sandbox = await this.connect(machineId, false);
			await sandbox.delete();
		} catch (err) {
			const kind = classifyError(err);
			if (kind === "fatal") return;
			throw new MachineProviderError(
				"vercel",
				kind,
				`vercel destroy failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async exec(
		machineId: string,
		command: string,
		options?: ExecOptions,
	): Promise<ExecResult> {
		try {
			const sandbox = await this.connect(machineId, true);
			const signal =
				options?.timeoutMs && options.timeoutMs > 0
					? AbortSignal.timeout(options.timeoutMs)
					: undefined;
			const result = await sandbox.runCommand("bash", ["-lc", bashViaBase64(command)], {
				signal,
			});
			return {
				stdout: await result.stdout(),
				stderr: await result.stderr(),
				exitCode: result.exitCode,
			};
		} catch (err) {
			if (err && typeof err === "object" && "exitCode" in err) {
				const cmdErr = err as {
					exitCode: number;
					stdout?: () => Promise<string>;
					stderr?: () => Promise<string>;
				};
				return {
					stdout: cmdErr.stdout ? await cmdErr.stdout() : "",
					stderr: cmdErr.stderr ? await cmdErr.stderr() : "",
					exitCode: cmdErr.exitCode,
				};
			}
			throw new MachineProviderError(
				"vercel",
				classifyError(err),
				`vercel exec failed on ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async execBackground(machineId: string, command: string): Promise<void> {
		try {
			const sandbox = await this.connect(machineId, true);
			await sandbox.runCommand({
				cmd: "bash",
				args: ["-lc", bashViaBase64(command)],
				detached: true,
			});
		} catch (err) {
			throw new MachineProviderError(
				"vercel",
				classifyError(err),
				`vercel execBackground failed on ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async getPublicUrl(machineId: string, port: number): Promise<string> {
		try {
			const sandbox = await this.connect(machineId, true);
			return sandbox.domain(port);
		} catch (err) {
			throw new MachineProviderError(
				"vercel",
				classifyError(err),
				`vercel getPublicUrl failed for ${machineId}:${port}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}

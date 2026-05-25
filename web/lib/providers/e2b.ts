/**
 * E2B Sandbox provider.
 *
 * Wraps the E2B SDK (`e2b` package) to provision, pause/resume, and
 * exec against E2B cloud sandboxes. These are persistent across
 * pause/resume cycles and support snapshots for cross-session
 * restoration.
 *
 * State mapping:
 *   "running"  -> ready
 *   "paused"   -> sleeping
 *   anything else -> unknown
 */

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

async function getSandbox() {
	const { Sandbox } = await import("e2b");
	return Sandbox;
}

export type E2BCreds = {
	apiKey: string;
};

function mapState(state: string): MachineState {
	switch (state) {
		case "running":
			return "ready";
		case "paused":
			return "sleeping";
		default:
			return "unknown";
	}
}

function classifyError(err: unknown): "missing_credentials" | "transient" | "fatal" {
	const msg = err instanceof Error ? err.message : String(err);
	if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
		return "missing_credentials";
	}
	if (msg.includes("404") || msg.includes("not found") || msg.includes("Not Found")) {
		return "fatal";
	}
	return "transient";
}

/**
 * E2B commands.run accepts a single shell string. Wrapping multiline bootstrap
 * scripts in JSON.stringify for bash -lc turns real newlines into literal `\n`,
 * which breaks heredocs (seed-knowledge, gateway launchers, etc.).
 */
function bashViaBase64(command: string): string {
	const b64 = Buffer.from(command, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

export class E2BProvider implements MachineProvider {
	readonly kind = "e2b" as const;
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

	constructor(creds: E2BCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"e2b",
				"missing_credentials",
				"E2B_API_KEY is required for the E2B provider.",
			);
		}
		this.apiKey = creds.apiKey;
	}

	get hasCredentials(): boolean {
		return Boolean(this.apiKey);
	}

	async provision(input: ProvisionInput): Promise<ProvisionResult> {
		try {
			const Sandbox = await getSandbox();
			const sandbox = await Sandbox.create({
				apiKey: this.apiKey,
				timeoutMs: 3_600_000,
				metadata: {
					agentKind: input.agentKind ?? "hermes",
					model: input.model ?? "unknown",
					name: input.name ?? "agent-machine",
				},
				envs: {
					HOME: "/home/user",
					AGENT_KIND: input.agentKind ?? "hermes",
					AGENT_MODEL: input.model ?? "",
					...(input.env ?? {}),
				},
			});
			return {
				id: sandbox.sandboxId,
				state: "ready",
				rawPhase: "running",
			};
		} catch (err) {
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b provision failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async state(machineId: string): Promise<ProviderMachineSummary> {
		try {
			const Sandbox = await getSandbox();
			const info = await Sandbox.getFullInfo(machineId, { apiKey: this.apiKey });
			return {
				id: machineId,
				state: mapState(info.state),
				rawPhase: info.state,
				spec: {
					vcpu: info.cpuCount ?? 1,
					memoryMib: info.memoryMB ?? 512,
					storageGib: 0,
				},
				createdAt: info.startedAt ? info.startedAt.toISOString() : null,
				lastError: null,
			};
		} catch (err) {
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b state lookup failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async wake(machineId: string): Promise<ProviderMachineSummary> {
		try {
			const Sandbox = await getSandbox();
			await Sandbox.connect(machineId, { apiKey: this.apiKey });
			return this.state(machineId);
		} catch (err) {
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b wake failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async sleep(machineId: string): Promise<ProviderMachineSummary> {
		try {
			const Sandbox = await getSandbox();
			await Sandbox.betaPause(machineId, { apiKey: this.apiKey });
			return this.state(machineId);
		} catch (err) {
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b sleep (pause) failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async destroy(machineId: string): Promise<void> {
		try {
			const Sandbox = await getSandbox();
			await Sandbox.kill(machineId, { apiKey: this.apiKey });
		} catch (err) {
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b destroy (kill) failed for ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async exec(
		machineId: string,
		command: string,
		options?: ExecOptions,
	): Promise<ExecResult> {
		try {
			const Sandbox = await getSandbox();
			const sandbox = await Sandbox.connect(machineId, { apiKey: this.apiKey });
			const result = await sandbox.commands.run(bashViaBase64(command), {
				timeoutMs: options?.timeoutMs ?? 30_000,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			};
		} catch (err) {
			// E2B SDK throws CommandExitError on non-zero exit codes.
			// Return the result so the bootstrap runner can inspect
			// exitCode/stderr instead of getting a generic error.
			if (err && typeof err === "object" && "exitCode" in err) {
				const cmdErr = err as { exitCode: number; stdout?: string; stderr?: string };
				return {
					stdout: cmdErr.stdout ?? "",
					stderr: cmdErr.stderr ?? "",
					exitCode: cmdErr.exitCode,
				};
			}
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b exec failed on ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async execBackground(machineId: string, command: string): Promise<void> {
		try {
			const Sandbox = await getSandbox();
			const sandbox = await Sandbox.connect(machineId, { apiKey: this.apiKey });
			await sandbox.commands.run(bashViaBase64(command), {
				background: true,
			});
		} catch (err) {
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b execBackground failed on ${machineId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async getPublicUrl(sandboxId: string, port: number): Promise<string> {
		try {
			const Sandbox = await getSandbox();
			const sandbox = await Sandbox.connect(sandboxId, { apiKey: this.apiKey });
			return `https://${sandbox.getHost(port)}`;
		} catch (err) {
			throw new MachineProviderError(
				"e2b",
				classifyError(err),
				`e2b getPublicUrl failed for ${sandboxId}:${port}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}

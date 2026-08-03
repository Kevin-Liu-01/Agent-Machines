/**
 * E2B substrate, expressed as a mux `MuxSubstrate` (ROADMAP 0.2).
 *
 * The vendor calls below are unchanged from the pre-facade adapter -- same SDK
 * entry points, same base64 bash wrapper, same error taxonomy, same connect
 * cache. What changed is the shape: this module now hands the facade a mux
 * substrate (create/connect returning a handle) and `E2BProvider` is produced
 * by `createMuxBackedProvider`, so the state and error vocabularies are mapped
 * in exactly one place. When `src/mux/providers/e2b.ts` becomes reachable from
 * the bundler (see the mux-facade header), this file's vendor half is deleted
 * and `createE2bSubstrate` is replaced by the mux provider.
 *
 * State mapping:
 *   "running"  -> ready
 *   "paused"   -> sleeping
 *   anything else -> unknown
 */

import { bridgeExecStream } from "./stream-util";
import {
	credentialScope,
	createMuxBackedProvider,
	type MuxDescription,
	type MuxExecOptions,
	type MuxExecResult,
	type MuxExecStreamEvent,
	type MuxExecStreamOptions,
	type MuxMachineState,
	type MuxSandbox,
	type MuxSubstrate,
	type MuxSubstrateBinding,
} from "./mux-facade";
import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type MachineProvider,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

const DEFAULT_STREAM_TIMEOUT_MS = 120_000;
/** Reuse sandbox handles across exec/input within a warm serverless instance. */
const CONNECT_CACHE_MS = 45_000;
/** Sandbox lifetime requested at provision; bootstrap alone runs ~150s. */
const PROVISION_TIMEOUT_MS = 3_600_000;

type ConnectCacheEntry = {
	sandbox: Awaited<ReturnType<Awaited<ReturnType<typeof getSandbox>>["connect"]>>;
	expiresAt: number;
};

const connectCache = new Map<string, ConnectCacheEntry>();

function invalidateConnectCache(machineId: string): void {
	connectCache.delete(machineId);
}

async function connectSandbox(
	machineId: string,
	apiKey: string,
): Promise<ConnectCacheEntry["sandbox"]> {
	const now = Date.now();
	const hit = connectCache.get(machineId);
	if (hit && hit.expiresAt > now) {
		return hit.sandbox;
	}
	const Sandbox = await getSandbox();
	const sandbox = await Sandbox.connect(machineId, { apiKey });
	connectCache.set(machineId, { sandbox, expiresAt: now + CONNECT_CACHE_MS });
	return sandbox;
}

async function getSandbox() {
	const { Sandbox } = await import("e2b");
	return Sandbox;
}

export type E2BCreds = {
	apiKey: string;
};

function mapState(state: string): MuxMachineState {
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

/** Vendor failure -> MachineProviderError; the facade re-reads the kind. */
function e2bError(operation: string, err: unknown): MachineProviderError {
	return new MachineProviderError(
		"e2b",
		classifyError(err),
		`e2b ${operation}: ${err instanceof Error ? err.message : String(err)}`,
	);
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

/**
 * A handle bound to one sandbox id. Nothing is dialed here: the E2B SDK
 * resumes a paused sandbox on `connect`, so binding lazily is what keeps a
 * state poll or a destroy from waking (and billing) a parked sandbox.
 */
function e2bSandbox(machineId: string, apiKey: string): MuxSandbox {
	return {
		id: machineId,

		async exec(command: string, options?: MuxExecOptions): Promise<MuxExecResult> {
			const startedAt = Date.now();
			try {
				const sandbox = await connectSandbox(machineId, apiKey);
				const result = await sandbox.commands.run(bashViaBase64(command), {
					timeoutMs: options?.timeoutMs ?? 30_000,
					envs: options?.env,
					cwd: options?.cwd,
				});
				return {
					stdout: result.stdout,
					stderr: result.stderr,
					exitCode: result.exitCode,
					durationMs: Date.now() - startedAt,
				};
			} catch (err) {
				invalidateConnectCache(machineId);
				// E2B throws CommandExitError on non-zero exit codes. Return the
				// result so the bootstrap runner can inspect exitCode/stderr
				// instead of getting a generic error.
				if (err && typeof err === "object" && "exitCode" in err) {
					const cmdErr = err as { exitCode: number; stdout?: string; stderr?: string };
					return {
						stdout: cmdErr.stdout ?? "",
						stderr: cmdErr.stderr ?? "",
						exitCode: cmdErr.exitCode,
						durationMs: Date.now() - startedAt,
					};
				}
				throw e2bError(`exec failed on ${machineId}`, err);
			}
		},

		/**
		 * Native streaming via E2B's `onStdout`/`onStderr` callbacks. The SDK
		 * fires them as bytes arrive on the foreground command, then resolves
		 * (or throws `CommandExitError` carrying the non-zero exit code -- the
		 * callbacks have already delivered the output by then).
		 */
		execStream(
			command: string,
			options?: MuxExecStreamOptions,
		): AsyncGenerator<MuxExecStreamEvent, void, void> {
			return bridgeExecStream(async (emit) => {
				let sandbox: ConnectCacheEntry["sandbox"];
				try {
					sandbox = await connectSandbox(machineId, apiKey);
				} catch (err) {
					invalidateConnectCache(machineId);
					throw e2bError(`streamExec connect failed on ${machineId}`, err);
				}
				try {
					const result = await sandbox.commands.run(bashViaBase64(command), {
						timeoutMs: options?.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
						envs: options?.env,
						cwd: options?.cwd,
						onStdout: (data: string) => emit.stdout(data),
						onStderr: (data: string) => emit.stderr(data),
					});
					return result.exitCode;
				} catch (err) {
					invalidateConnectCache(machineId);
					if (err && typeof err === "object" && "exitCode" in err) {
						return (err as { exitCode: number }).exitCode;
					}
					throw e2bError(`streamExec failed on ${machineId}`, err);
				}
			});
		},

		async execBackground(command: string): Promise<void> {
			try {
				const sandbox = await connectSandbox(machineId, apiKey);
				await sandbox.commands.run(bashViaBase64(command), { background: true });
			} catch (err) {
				invalidateConnectCache(machineId);
				throw e2bError(`execBackground failed on ${machineId}`, err);
			}
		},

		async publicUrl(port: number): Promise<string | null> {
			try {
				const sandbox = await connectSandbox(machineId, apiKey);
				return `https://${sandbox.getHost(port)}`;
			} catch (err) {
				invalidateConnectCache(machineId);
				throw e2bError(`getPublicUrl failed for ${machineId}:${port}`, err);
			}
		},

		async state(): Promise<MuxMachineState> {
			return (await describeE2b(machineId, apiKey)).state;
		},

		async sleep(): Promise<void> {
			await parkE2b(machineId, apiKey);
		},

		/** `connect` auto-resumes a paused sandbox; that is the wake. */
		async wake(): Promise<void> {
			invalidateConnectCache(machineId);
			try {
				await connectSandbox(machineId, apiKey);
			} catch (err) {
				throw e2bError(`wake failed for ${machineId}`, err);
			}
		},

		async destroy(): Promise<void> {
			await removeE2b(machineId, apiKey);
		},
	};
}

async function describeE2b(machineId: string, apiKey: string): Promise<MuxDescription> {
	try {
		const Sandbox = await getSandbox();
		const info = await Sandbox.getFullInfo(machineId, { apiKey });
		return {
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
		throw e2bError(`state lookup failed for ${machineId}`, err);
	}
}

async function parkE2b(machineId: string, apiKey: string): Promise<void> {
	try {
		const Sandbox = await getSandbox();
		await Sandbox.betaPause(machineId, { apiKey });
	} catch (err) {
		throw e2bError(`sleep (pause) failed for ${machineId}`, err);
	} finally {
		invalidateConnectCache(machineId);
	}
}

async function removeE2b(machineId: string, apiKey: string): Promise<void> {
	try {
		const Sandbox = await getSandbox();
		await Sandbox.kill(machineId, { apiKey });
	} catch (err) {
		throw e2bError(`destroy (kill) failed for ${machineId}`, err);
	} finally {
		invalidateConnectCache(machineId);
	}
}

/** The mux substrate contract, credential-gated the mux way (`ready()`). */
export function createE2bSubstrate(creds: { apiKey?: string }): MuxSubstrate {
	const apiKey = creds.apiKey?.trim() || undefined;

	function requireApiKey(): string {
		if (!apiKey) {
			throw new MachineProviderError(
				"e2b",
				"missing_credentials",
				"E2B_API_KEY is required for the E2B provider.",
			);
		}
		return apiKey;
	}

	return {
		kind: "e2b",
		capabilities: {
			pty: "native",
			persistence: "memory-snapshot",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			detachedWork: "reliable",
		},
		ready() {
			return apiKey ? { ok: true, missing: [] } : { ok: false, missing: ["E2B_API_KEY"] };
		},
		async create(options): Promise<MuxSandbox> {
			const key = requireApiKey();
			try {
				const Sandbox = await getSandbox();
				const sandbox = await Sandbox.create({
					apiKey: key,
					timeoutMs: options?.timeoutMs ?? PROVISION_TIMEOUT_MS,
					metadata: options?.name ? { name: options.name } : undefined,
					envs: options?.env,
					...(options?.resources?.vcpu ? { cpuCount: options.resources.vcpu } : {}),
				});
				return e2bSandbox(sandbox.sandboxId, key);
			} catch (err) {
				throw e2bError("provision failed", err);
			}
		},
		async connect(id: string): Promise<MuxSandbox> {
			return e2bSandbox(id, requireApiKey());
		},
	};
}

function e2bBinding(creds: E2BCreds): MuxSubstrateBinding {
	const substrate = createE2bSubstrate(creds);
	const apiKey = creds.apiKey;
	return {
		kind: "e2b",
		substrate,
		cacheScope: credentialScope([apiKey]),
		describe: (machineId) => describeE2b(machineId, apiKey),
		park: (machineId) => parkE2b(machineId, apiKey),
		remove: (machineId) => removeE2b(machineId, apiKey),
		createOptions: (input: ProvisionInput) => ({
			name: input.name ?? "agent-machine",
			timeoutMs: PROVISION_TIMEOUT_MS,
			// HOME is pinned because the bootstrap runner writes its whole tree
			// under $HOME; this is E2B's own default user home, kept explicit so
			// a sandbox image change cannot silently relocate the bootstrap.
			env: {
				HOME: "/home/user",
				AGENT_KIND: input.agentKind ?? "hermes",
				AGENT_MODEL: input.model ?? "",
				...(input.env ?? {}),
			},
			resources: { vcpu: input.spec?.vcpu, memoryMib: input.spec?.memoryMib },
		}),
		// e2b has never trimmed exec output; keep it byte-exact.
		trimOutput: false,
	};
}

/**
 * `MachineProvider` for E2B: a facade over the substrate above. Kept as a
 * class with the same constructor and `getPublicUrl(): Promise<string>`
 * signature because `lib/bootstrap/runner.ts` casts to this type.
 */
export class E2BProvider implements MachineProvider {
	readonly kind = "e2b" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;

	constructor(creds: E2BCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"e2b",
				"missing_credentials",
				"E2B_API_KEY is required for the E2B provider.",
			);
		}
		this.facade = createMuxBackedProvider(e2bBinding(creds));
		this.capabilities = this.facade.capabilities;
	}

	get hasCredentials(): boolean {
		return this.facade.hasCredentials;
	}

	provision(input: ProvisionInput): Promise<ProvisionResult> {
		return this.facade.provision(input);
	}

	state(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.state(machineId);
	}

	wake(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.wake(machineId);
	}

	sleep(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.sleep(machineId);
	}

	destroy(machineId: string): Promise<void> {
		return this.facade.destroy(machineId);
	}

	exec(machineId: string, command: string, options?: ExecOptions): Promise<ExecResult> {
		return this.facade.exec(machineId, command, options);
	}

	execBackground(machineId: string, command: string): Promise<void> {
		return this.facade.execBackground!(machineId, command);
	}

	streamExec(
		machineId: string,
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		return this.facade.streamExec!(machineId, command, options);
	}

	/** Never null on E2B: the host is derived from the sandbox id. */
	async getPublicUrl(machineId: string, port: number): Promise<string> {
		const url = await this.facade.getPublicUrl!(machineId, port);
		if (url === null) {
			throw new MachineProviderError(
				"e2b",
				"transient",
				`e2b returned no public URL for ${machineId}:${port}`,
			);
		}
		return url;
	}
}

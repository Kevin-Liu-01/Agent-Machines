/**
 * Sprites.dev substrate, expressed as a mux `MuxSubstrate` (ROADMAP 0.2).
 *
 * Vendor calls are unchanged from the pre-facade adapter: same REST endpoints,
 * same `execFileHTTP` fast path with the WebSocket fallback, same state
 * mapping, same output trimming. Only the shape changed -- `SpritesProvider`
 * is now produced by `createMuxBackedProvider`, so state and error vocabulary
 * live in one place.
 *
 * Sprites.dev persistent sandboxes (Fly.io infrastructure). Each gets a
 * persistent ext4 filesystem, auto-sleeps when idle (no compute charges), and
 * auto-wakes on exec or HTTP request. The sprite URL proxies to port 8080
 * inside the sandbox by default.
 *
 * Auth: `Authorization: Bearer $SPRITE_TOKEN`
 * REST API: https://api.sprites.dev/v1
 */

import type {
	Sprite as SpriteHandle,
	SpritesClient as SpritesClientType,
} from "@fly/sprites";

import { bridgeExecStream } from "./stream-util";
import {
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

// Memoize the dynamic import so we pay the module-resolution cost once per
// process rather than on every exec call.
let spritesModulePromise: Promise<typeof import("@fly/sprites")> | null = null;
function loadSprites(): Promise<typeof import("@fly/sprites")> {
	if (!spritesModulePromise) spritesModulePromise = import("@fly/sprites");
	return spritesModulePromise;
}

export type SpritesCreds = {
	apiKey: string;
};

const API = "https://api.sprites.dev/v1";

type SpriteInfo = {
	id: string;
	name: string;
	url: string;
	status: string;
};

function mapState(status: string | undefined): MuxMachineState {
	switch (status) {
		case "running":
		case "warm":
		case "cold":
			// Sprites auto-wake on exec/HTTP, so warm and cold are effectively
			// "ready" from the dashboard's perspective. Mapping them to "ready"
			// prevents isMachineRunning from blocking exec calls that would
			// auto-wake the sprite.
			return "ready";
		default:
			return "unknown";
	}
}

/** Shared REST client. Kept private to this module -- one auth path. */
class SpritesRest {
	constructor(private readonly apiKey: string) {}

	fetch(path: string, init?: RequestInit): Promise<Response> {
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

	async error(op: string, response: Response): Promise<MachineProviderError> {
		const text = await response.text().catch(() => "");
		return new MachineProviderError(
			"sprites",
			response.status === 429 ? "rate_limited" : "transient",
			`Sprites ${op} ${response.status}: ${text.slice(0, 240)}`,
		);
	}

	async info(spriteName: string): Promise<SpriteInfo> {
		const response = await this.fetch(`/sprites/${spriteName}`);
		if (!response.ok) throw await this.error("state", response);
		return (await response.json()) as SpriteInfo;
	}
}

/**
 * Client and per-name sprite handles are cached for the instance's lifetime:
 * the dashboard recreates the provider per request, but a benchmark trial
 * reuses one instance for all 12 exec iterations.
 */
class SpritesSession {
	private clientPromise: Promise<SpritesClientType> | null = null;
	private readonly handles = new Map<string, SpriteHandle>();

	constructor(private readonly apiKey: string) {}

	private client(): Promise<SpritesClientType> {
		if (!this.clientPromise) {
			this.clientPromise = loadSprites().then(
				({ SpritesClient }) => new SpritesClient(this.apiKey),
			);
		}
		return this.clientPromise;
	}

	async handle(name: string): Promise<SpriteHandle> {
		const cached = this.handles.get(name);
		if (cached) return cached;
		const handle = (await this.client()).sprite(name);
		this.handles.set(name, handle);
		return handle;
	}
}

function spritesSandbox(
	spriteName: string,
	rest: SpritesRest,
	session: SpritesSession,
): MuxSandbox {
	return {
		id: spriteName,

		async exec(command: string, options?: MuxExecOptions): Promise<MuxExecResult> {
			const startedAt = Date.now();
			const timeoutMs = options?.timeoutMs ?? 30_000;
			// Fast path: execFileHTTP runs the command over plain HTTP (measured
			// 87-296ms) instead of paying a WebSocket handshake per exec (the
			// ~5s floor the 2026-05 benchmarks flagged). Fall back to the WS
			// execFile once if the HTTP transport rejects the command.
			try {
				const sprite = await session.handle(spriteName);
				// sprite.exec() splits on whitespace, breaking shell operators
				// like && and |. Use bash -c via execFileHTTP/execFile instead.
				const execPromise = sprite
					.execFileHTTP("/bin/bash", ["-c", command])
					.catch((httpError: unknown) => {
						const message =
							httpError instanceof Error ? httpError.message : String(httpError);
						// Non-zero exits arrive as ExecError with a result attached:
						// rethrow those so the shared extraction below handles them.
						if ((httpError as { result?: unknown }).result) throw httpError;
						if (!/frame|chunk|transport|body|network|fetch/i.test(message)) {
							throw httpError;
						}
						return sprite.execFile("/bin/bash", ["-c", command]);
					});
				const result = await withTimeout(execPromise, timeoutMs, "sprites exec timed out");
				const stdout = result.stdout ? String(result.stdout) : "";
				const stderr = result.stderr ? String(result.stderr) : "";
				return {
					stdout,
					stderr,
					exitCode: result.exitCode ?? 0,
					durationMs: Date.now() - startedAt,
				};
			} catch (err: unknown) {
				// The SDK throws ExecError on non-zero exit codes, but
				// error.result still contains stdout/stderr/exitCode. Extract it
				// so callers get the actual command output.
				const execResult = (
					err as {
						result?: { stdout?: unknown; stderr?: unknown; exitCode?: number };
					}
				).result;
				if (execResult && typeof execResult.exitCode === "number") {
					return {
						stdout: execResult.stdout ? String(execResult.stdout) : "",
						stderr: execResult.stderr ? String(execResult.stderr) : "",
						exitCode: execResult.exitCode,
						durationMs: Date.now() - startedAt,
					};
				}
				const message = err instanceof Error ? err.message : String(err);
				throw new MachineProviderError(
					"sprites",
					message.includes("404") ? "fatal" : "transient",
					`sprites exec failed: ${message.slice(0, 200)}`,
				);
			}
		},

		/**
		 * Native streaming via the Sprites WebSocket process API. `spawn` opens
		 * a WS-backed process whose stdout/stderr are Node `Readable` streams;
		 * we relay each chunk as it arrives and resolve the exit code from
		 * `proc.wait()`. A timeout guard kills the process so the bridge can
		 * never hang on a stuck command.
		 */
		execStream(
			command: string,
			options?: MuxExecStreamOptions,
		): AsyncGenerator<MuxExecStreamEvent, void, void> {
			const timeoutMs = options?.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
			return bridgeExecStream(async (emit) => {
				const sprite = await session.handle(spriteName);
				const proc = sprite.spawn("/bin/bash", ["-lc", command], {});
				proc.stdout.on("data", (chunk: Buffer | string) => {
					emit.stdout(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
				});
				proc.stderr.on("data", (chunk: Buffer | string) => {
					emit.stderr(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
				});

				let timer: ReturnType<typeof setTimeout> | undefined;
				const timeout = new Promise<number>((_, reject) => {
					timer = setTimeout(() => {
						try {
							proc.kill();
						} catch {
							// best-effort
						}
						reject(
							new MachineProviderError(
								"sprites",
								"transient",
								`sprites streamExec timed out after ${timeoutMs}ms`,
							),
						);
					}, timeoutMs);
				});

				try {
					return await Promise.race([proc.wait(), timeout]);
				} finally {
					if (timer) clearTimeout(timer);
				}
			});
		},

		async execBackground(command: string): Promise<void> {
			try {
				const sprite = await session.handle(spriteName);
				const proc = sprite.spawn("/bin/bash", ["-lc", command], {});
				proc.stdout.on("data", () => {
					// Drain output so a chatty gateway cannot block on a full pipe.
				});
				proc.stderr.on("data", () => {
					// Drain output so a chatty gateway cannot block on a full pipe.
				});
				void proc.wait().catch(() => {
					// Background process failures are surfaced by gateway log probes.
				});
			} catch (err: unknown) {
				throw new MachineProviderError(
					"sprites",
					"transient",
					`sprites execBackground failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},

		/** The sprite URL proxies one port (8080); `port` has no effect here. */
		async publicUrl(_port: number): Promise<string | null> {
			const response = await rest.fetch(`/sprites/${spriteName}`);
			if (!response.ok) return null;
			const sprite = (await response.json()) as SpriteInfo;
			return sprite.url ?? null;
		},

		async state(): Promise<MuxMachineState> {
			return mapState((await rest.info(spriteName)).status);
		},

		/** Sprites auto-sleep when idle; there is no manual sleep API. */
		async sleep(): Promise<void> {
			await rest.info(spriteName);
		},

		/**
		 * Sprites auto-wake on the next exec or HTTP request, so this confirms
		 * the sprite exists rather than forcing a wake. NOTE: `src/mux` wakes
		 * for real here (an exec probe). Adopting that needs a timeout above
		 * the measured 17-31s cold start (docs/MUX-RESULTS.md), otherwise the
		 * 30s exec default turns a cold sprite into a wake failure.
		 */
		async wake(): Promise<void> {
			await rest.info(spriteName);
		},

		async destroy(): Promise<void> {
			const response = await rest.fetch(`/sprites/${spriteName}`, {
				method: "DELETE",
			});
			if (!response.ok && response.status !== 404) {
				throw await rest.error("destroy", response);
			}
		},
	};
}

async function describeSprites(
	spriteName: string,
	rest: SpritesRest,
): Promise<MuxDescription> {
	const sprite = await rest.info(spriteName);
	return {
		state: mapState(sprite.status),
		rawPhase: sprite.status ?? "unknown",
		// Sprites does not report per-sprite sizing; these are the platform
		// defaults the dashboard has always displayed for this substrate.
		spec: { vcpu: 2, memoryMib: 4096, storageGib: 100 },
		createdAt: null,
		lastError: null,
	};
}

export function createSpritesSubstrate(creds: { apiKey?: string }): MuxSubstrate {
	const apiKey = creds.apiKey?.trim() || undefined;
	const rest = apiKey ? new SpritesRest(apiKey) : null;
	const session = apiKey ? new SpritesSession(apiKey) : null;

	function requireSession(): { rest: SpritesRest; session: SpritesSession } {
		if (!rest || !session) {
			throw new MachineProviderError(
				"sprites",
				"missing_credentials",
				"Sprites token is required for the Sprites provider.",
			);
		}
		return { rest, session };
	}

	return {
		kind: "sprites",
		capabilities: {
			pty: "native",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			// Measured 2026-08-01: an install that takes 17s in the foreground
			// does not finish in 15 minutes detached (docs/MUX-RESULTS.md).
			detachedWork: "throttled",
		},
		ready() {
			return apiKey ? { ok: true, missing: [] } : { ok: false, missing: ["SPRITES_TOKEN"] };
		},
		async create(options): Promise<MuxSandbox> {
			const ctx = requireSession();
			const name = spriteNameFor(options?.name);
			const response = await ctx.rest.fetch("/sprites", {
				method: "POST",
				body: JSON.stringify({ name, url_settings: { auth: "public" } }),
			});
			if (!response.ok) throw await ctx.rest.error("provision", response);
			const sprite = (await response.json()) as SpriteInfo;
			return spritesSandbox(sprite.name, ctx.rest, ctx.session);
		},
		async connect(id: string): Promise<MuxSandbox> {
			const ctx = requireSession();
			return spritesSandbox(id, ctx.rest, ctx.session);
		},
	};
}

function spritesBinding(creds: SpritesCreds): MuxSubstrateBinding {
	const rest = new SpritesRest(creds.apiKey);
	return {
		kind: "sprites",
		substrate: createSpritesSubstrate(creds),
		describe: (machineId) => describeSprites(machineId, rest),
		createOptions: (input: ProvisionInput) => ({
			name: input.name,
			env: input.env,
		}),
		// This adapter has always trimmed sprites output, and
		// `lib/storage/machine-fs.ts` compares stdout to the exact string
		// `__MISSING__` -- dropping the trim would break missing-file
		// detection on this substrate (it is already broken on e2b/vercel,
		// which never trimmed; fix that in machine-fs, not here).
		trimOutput: true,
	};
}

export class SpritesProvider implements MachineProvider {
	readonly kind = "sprites" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;

	constructor(creds: SpritesCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"sprites",
				"missing_credentials",
				"Sprites token is required for the Sprites provider.",
			);
		}
		this.facade = createMuxBackedProvider(spritesBinding(creds));
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

	getPublicUrl(machineId: string, port: number): Promise<string | null> {
		return this.facade.getPublicUrl!(machineId, port);
	}
}

/**
 * Unique per provision. NOTE: `src/mux` derives a deterministic
 * `am-mux-<name>` and adopts an existing sprite on conflict, which would make
 * two dashboard machines with the same name the same sprite -- and
 * docs/MUX-RESULTS.md records a live failure from exactly that ("sprite not
 * found -- a concurrent run destroyed the same deterministically-named
 * sprite"). Keep the random suffix here so the control plane cannot collide.
 */
function spriteNameFor(name: string | undefined): string {
	const suffix = Math.random().toString(36).slice(2, 10);
	const base = (name ?? "agent")
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
	return `am-${base || "agent"}-${suffix}`;
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

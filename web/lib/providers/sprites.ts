/**
 * Sprites.dev provider.
 *
 * Sprites.dev persistent sandboxes (Fly.io infrastructure).
 * gets a persistent ext4 filesystem, auto-sleeps when idle (no compute
 * charges), and auto-wakes on exec or HTTP request. The sprite URL
 * proxies to port 8080 inside the sandbox by default.
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

type ExecResponse = {
	stdout?: string;
	stderr?: string;
	exit_code?: number;
	exitCode?: number;
	output?: string;
};

function mapState(status: string | undefined): ProviderMachineSummary["state"] {
	switch (status) {
		case "running":
		case "warm":
		case "cold":
			// Sprites auto-wake on exec/HTTP, so warm and cold are
			// effectively "ready" from the dashboard's perspective.
			// Mapping them to "ready" prevents isMachineRunning from
			// blocking exec calls that would auto-wake the sprite.
			return "ready";
		default:
			return "unknown";
	}
}

export class SpritesProvider implements MachineProvider {
	readonly kind = "sprites" as const;
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
	// A single SpritesClient is reused for the instance's lifetime, and
	// sprite handles are cached per name — the dashboard recreates the
	// provider per request, but a benchmark trial reuses one instance for
	// all 12 exec iterations, so this removes redundant client/import work.
	private clientPromise: Promise<SpritesClientType> | null = null;
	private readonly spriteHandles = new Map<string, SpriteHandle>();

	constructor(creds: SpritesCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"sprites",
				"missing_credentials",
				"Sprites token is required for the Sprites provider.",
			);
		}
		this.apiKey = creds.apiKey;
	}

	get hasCredentials(): boolean {
		return Boolean(this.apiKey);
	}

	private client(): Promise<SpritesClientType> {
		if (!this.clientPromise) {
			this.clientPromise = loadSprites().then(
				({ SpritesClient }) => new SpritesClient(this.apiKey),
			);
		}
		return this.clientPromise;
	}

	private async spriteHandle(name: string): Promise<SpriteHandle> {
		const cached = this.spriteHandles.get(name);
		if (cached) return cached;
		const handle = (await this.client()).sprite(name);
		this.spriteHandles.set(name, handle);
		return handle;
	}

	async provision(input: ProvisionInput): Promise<ProvisionResult> {
		const name = spriteNameFor(input.name);
		const response = await this.fetch("/sprites", {
			method: "POST",
			body: JSON.stringify({
				name,
				url_settings: { auth: "public" },
			}),
		});
		if (!response.ok) {
			throw await this.error("provision", response);
		}
		const sprite = (await response.json()) as SpriteInfo;
		return {
			id: sprite.name,
			state: mapState(sprite.status),
			rawPhase: sprite.status ?? "unknown",
		};
	}

	async state(spriteName: string): Promise<ProviderMachineSummary> {
		const response = await this.fetch(`/sprites/${spriteName}`);
		if (!response.ok) {
			throw await this.error("state", response);
		}
		const sprite = (await response.json()) as SpriteInfo;
		return this.summary(sprite);
	}

	async wake(spriteName: string): Promise<ProviderMachineSummary> {
		// Sprites auto-wake on exec. Return current state -- the next exec
		// will trigger a wake automatically if the sprite is cold/warm.
		return this.state(spriteName);
	}

	async sleep(spriteName: string): Promise<ProviderMachineSummary> {
		// Sprites auto-sleep when idle. There is no manual sleep API;
		// returning current state is correct behavior.
		return this.state(spriteName);
	}

	async destroy(spriteName: string): Promise<void> {
		const response = await this.fetch(`/sprites/${spriteName}`, {
			method: "DELETE",
		});
		if (!response.ok && response.status !== 404) {
			throw await this.error("destroy", response);
		}
	}

	async exec(
		spriteName: string,
		command: string,
		options?: ExecOptions,
	): Promise<ExecResult> {
		const timeoutMs = options?.timeoutMs ?? 30_000;
		// Sprites exec is WebSocket-based, not REST. Use the @fly/sprites
		// SDK which handles the binary WS protocol automatically.
		try {
			const sprite = await this.spriteHandle(spriteName);
			// sprite.exec() splits on whitespace, breaking shell operators
			// like && and |. Use execFile with /bin/bash -c instead.
			const execPromise = sprite.execFile("/bin/bash", ["-c", command]);
			const result = await withTimeout(execPromise, timeoutMs, "sprites exec timed out");
			const stdout = result.stdout ? String(result.stdout) : "";
			const stderr = result.stderr ? String(result.stderr) : "";
			return {
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				exitCode: result.exitCode ?? 0,
			};
		} catch (err: unknown) {
			// The SDK throws ExecError on non-zero exit codes, but the
			// error.result still contains stdout/stderr/exitCode. Extract
			// it so callers get the actual command output.
			const execResult = (err as { result?: { stdout?: unknown; stderr?: unknown; exitCode?: number } }).result;
			if (execResult && typeof execResult.exitCode === "number") {
				return {
					stdout: execResult.stdout ? String(execResult.stdout).trim() : "",
					stderr: execResult.stderr ? String(execResult.stderr).trim() : "",
					exitCode: execResult.exitCode,
				};
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new MachineProviderError(
				"sprites",
				message.includes("404") ? "fatal" : "transient",
				`sprites exec failed: ${message.slice(0, 200)}`,
			);
		}
	}

	async execBackground(spriteName: string, command: string): Promise<void> {
		try {
			const sprite = await this.spriteHandle(spriteName);
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
	}

	/**
	 * Native streaming via the Sprites WebSocket process API. `spawn` opens a
	 * WS-backed process whose stdout/stderr are Node `Readable` streams; we
	 * relay each chunk as it arrives and resolve the exit code from
	 * `proc.wait()`. A timeout guard kills the process so the bridge can
	 * never hang on a stuck command.
	 */
	async *streamExec(
		spriteName: string,
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		const sprite = await this.spriteHandle(spriteName);
		const timeoutMs = options?.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;

		yield* bridgeExecStream(async (emit) => {
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
	}

	async getPublicUrl(spriteName: string, _port: number): Promise<string | null> {
		const response = await this.fetch(`/sprites/${spriteName}`);
		if (!response.ok) return null;
		const sprite = (await response.json()) as SpriteInfo;
		return sprite.url ?? null;
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

	private summary(sprite: SpriteInfo): ProviderMachineSummary {
		return {
			id: sprite.name,
			state: mapState(sprite.status),
			rawPhase: sprite.status ?? "unknown",
			spec: {
				vcpu: 2,
				memoryMib: 4096,
				storageGib: 100,
			},
			createdAt: null,
			lastError: null,
		};
	}

	private async error(op: string, response: Response): Promise<MachineProviderError> {
		const text = await response.text().catch(() => "");
		return new MachineProviderError(
			"sprites",
			response.status === 429 ? "rate_limited" : "transient",
			`Sprites ${op} ${response.status}: ${text.slice(0, 240)}`,
		);
	}
}

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

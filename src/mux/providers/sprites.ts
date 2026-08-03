/**
 * Sprites.dev substrate adapter (Fly.io persistent machines).
 *
 * Fast path first: lifecycle rides the SDK's REST surface and one-shot
 * exec rides `execFileHTTP` -- no WebSocket per command. (The 0.0.1 SDK
 * opened a fresh WS for every exec and cost ~5.3s; HTTP exec measures
 * ~90-300ms.) WebSockets are reserved for the two things that actually
 * need them: streaming exec (`spawn`) and interactive PTYs (detachable
 * tmux sessions with reattach).
 *
 * Sprites keep a persistent ext4 filesystem, auto-suspend when idle and
 * auto-wake on the next exec or HTTP request, so persistence is
 * "always-on" and sleep() only resolves current state. wake() is real
 * work: it sends the request that starts a parked sprite and waits for it
 * to answer.
 *
 * Named PTY sessions: the Sprites server assigns session ids (announced
 * in a session_info message on the exec WebSocket). We persist that id
 * in a well-known file on the sprite (/tmp/am-mux-pty-<name>.sid) so a
 * later openPty -- possibly from a different process -- can validate it
 * against listSessions and reattach via attachSession.
 *
 * Surviving the control plane: of four consecutive live failures on this
 * substrate only one was our code -- the rest were "sprite not found",
 * "fetch failed" and "exec timed out" (docs/MUX-RESULTS.md). So every
 * control-plane and one-shot-exec call rides a bounded transport retry
 * with a deterministic backoff (no Math.random), and an adopted sprite is
 * woken before its first use because auto-suspend means a cold sprite can
 * spend the whole 60s exec budget just booting. Classification is what
 * the router keys off: timeout / fetch failed / 5xx -> "transient" so the
 * route can fail over, 404 and auth -> "fatal".
 */

import type { Sprite, SpriteCommand, SpritesClient } from "@fly/sprites";

import {
	MuxError,
	type CreateSandboxOptions,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type MachineState,
	type PtyHandle,
	type PtyOptions,
	type SandboxCapabilities,
	type SandboxDescription,
	type SandboxHandle,
	type SandboxInfo,
	type SandboxProvider,
} from "../types.js";

const SCOPE = { substrate: "sprites" as const };
const NAME_PREFIX = "am-mux-";
/** Same-substrate retries for the flaky create endpoint. */
const CREATE_ATTEMPTS = 4;
/** One-shot exec: the usual first failure is a suspended sprite. */
const EXEC_ATTEMPTS = 3;
/** REST control-plane calls: get, list, check, destroy, file writes. */
const CONTROL_ATTEMPTS = 3;
const RETRY_BASE_MS = 700;
const RETRY_CAP_MS = 8_000;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
/** The sprite public URL proxies to this port inside the sandbox. */
const SPRITE_PROXY_PORT = 8080;
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
/**
 * Budget for a wake probe and for the one retry that follows it. A cold
 * sprite measured ~31s to accept its first exec (docs/MUX-RESULTS.md) and
 * a wake under load is slower than a boot, so this has to outlast a boot
 * rather than track the caller's warm-path timeout.
 */
const WAKE_TIMEOUT_MS = 180_000;
/** A wake is one cheap request; a second covers a parked sprite's 502. */
const WAKE_ATTEMPTS = 2;
/**
 * Sprite-record statuses that mean the machine is already serving.
 *
 * Measured live 2026-08-01: a responsive sprite's record reads "warm" and
 * answers an exec in ~60ms, while a sprite left untouched for ten minutes
 * reads "cold" -- and its first exec then failed with a 502. Anything not
 * on this list, including an absent status, is treated as needing a wake:
 * one cheap request is much less than the 60s an unwoken exec can burn.
 *
 * Deliberately not gated on the /check endpoint. It answered "healthy"
 * (reason "machine is running") for the same ten-minute-idle sprite whose
 * record said "cold", so health does not tell us whether the machine is up.
 */
const LIVE_STATUS = /^(?:warm|running|ready|started|healthy)$/i;
// Launch-only budget, but a cold sprite can take tens of seconds to
// accept its first exec (create measured at ~31s), so this must cover
// boot, not just the fork.
const BACKGROUND_TIMEOUT_MS = 90_000;
const PTY_OPEN_TIMEOUT_MS = 30_000;
/**
 * Exec argv rides in URL query params on both the HTTP and WS paths;
 * commands whose base64 form exceeds this are staged as a file instead
 * of inlined, keeping URLs comfortably under proxy limits.
 */
const MAX_INLINE_B64 = 6_000;
/** Cap for the WS fallback collector, mirroring the SDK's own default. */
const MAX_FALLBACK_OUTPUT_BYTES = 10 * 1024 * 1024;

/**
 * Declared capabilities. Fly publishes far less about Sprites than the other
 * substrates document, so most quantities below are "unknown" with the pages
 * that were checked named -- an unknown rejects a constraint that needs it,
 * which is the honest outcome for a fact no vendor page states.
 */
const CAPABILITIES: SandboxCapabilities = {
	pty: "native",
	persistence: "always-on",
	reattach: true,
	publicUrl: true,
	streamingExec: true,
	detachedWork: "throttled",
	// Lillian (Fly staff) on
	// https://community.fly.io/t/where-do-sprites-dev-sprites-live-as-in-which-fly-io-region-is-it/26775
	// (2026-01-09): "sprites are created in a Fly.io region close to you. it's
	// not currently possible to specify a region when creating a sprite."
	// Proximity placement means there is no single default region to declare,
	// so a region constraint cannot be satisfied on this lane at all.
	region: { default: "unknown", available: "unknown", select: "unsupported" },
	// No Fly-owned Sprites page mentions accelerators: checked
	// https://fly.io/sprites, https://fly.io/blog/design-and-implementation/
	// and the Sprites community category on 2026-08-01. Fly does sell GPU
	// Machines, but that is a different product and says nothing about what a
	// sprite gets, so this stays unknown.
	gpu: { available: "unknown", models: "unknown", request: "unsupported" },
	// Measured, not published: every harness install on this substrate fetches
	// from the public internet (npm, curl, apt) and succeeds
	// (docs/MUX-RESULTS.md, 2026-08-01), so egress is open. No Fly page
	// documents an egress policy or a way to restrict it for a sprite (checked
	// 2026-08-01), hence control "unsupported". The sprite URL auth setting
	// this adapter uses in publicUrl() is INBOUND access, not egress.
	network: { egress: "open", control: "unsupported" },
	// flyio-support on https://community.fly.io/t/sprites-forking-functionality/27838
	// (2026-05-19): "right now, there isn't a forking functionality in general
	// that is available" -- it exists in the admin console only, with no REST
	// API and no timeline. The mux drives the REST API, so a fork is
	// unreachable here from either side.
	fork: { vendor: false, exposed: false },
	// jfent (Fly staff) on
	// https://community.fly.io/t/how-do-i-expose-my-sprite-as-a-url/26908
	// (2026-01-21): "Yeh I think you need to be serving on 8080 right now.
	// We're looking at ways to expose other ports soon, but haven't shipped
	// anything for that yet." That is the same single port publicUrl() below
	// returns a URL for; every other port resolves to null.
	publicPorts: {
		model: "single-fixed",
		vendorMax: 1,
		muxMax: 1,
		fixed: [SPRITE_PROXY_PORT],
	},
	limits: {
		// Fly publishes a memory ceiling but no baseline: flyio-support on
		// https://community.fly.io/t/16gb-ram-advertised-for-sprites-but-not-actually-available/28123
		// (2026-06-17) says "Currently the default is up to 8GB of memory, and
		// you can write in to support to request up to 16GB" -- an upper bound,
		// not a guaranteed allocation, so the baseline stays unknown and the
		// ceiling is the un-requested 8GB. GB is read as decimal and converted
		// down: 8 GB is 7,629 MiB (8e9 / 1048576), because rounding a ceiling up
		// is how a floor gets satisfied by a machine that cannot hold it. No
		// Fly-owned page states a vCPU ceiling (checked 2026-08-01).
		baseVcpu: "unknown",
		baseMemoryMib: "unknown",
		maxVcpu: "unknown",
		maxMemoryMib: 7629,
		// https://fly.io/blog/design-and-implementation/ (read 2026-08-01):
		// "Sprites all have a 100GB durable root filesystem", billed only for
		// "storage blocks you actually write". 100 GB is 93.13 GiB, floored to
		// 93; there is no request to make it larger or smaller.
		baseDiskGib: 93,
		maxDiskGib: 93,
		// No Fly-owned page states a maximum sprite run duration (checked
		// 2026-08-01), and sprites auto-suspend on idle
		// (docs/MUX-RESULTS.md finding 9), which is a further reason not to
		// read the silence as "unbounded".
		maxRuntimeMs: "unknown",
		// A concurrency limit demonstrably exists -- the API returns
		// errorCode "concurrent_sprite_limit_exceeded", which mapVendorError
		// below classifies -- but no Fly page states the number (checked
		// 2026-08-01), so the value is unknown rather than inferred.
		maxConcurrentSandboxes: "unknown",
		// create() never forwards options.resources on this substrate.
		resourceRequest: "ignored",
	},
};

// Memoize the dynamic import so module resolution is paid once per
// process. The SDK is loaded lazily so unused substrates cost nothing.
let spritesModulePromise: Promise<typeof import("@fly/sprites")> | null = null;
function loadSprites(): Promise<typeof import("@fly/sprites")> {
	const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
	if (major < 24) {
		return Promise.reject(
			new MuxError(
				"fatal",
				`@fly/sprites requires Node >= 24 (running ${process.versions.node}).`,
				SCOPE,
			),
		);
	}
	if (!spritesModulePromise) {
		spritesModulePromise = import("@fly/sprites").catch((error: unknown) => {
			spritesModulePromise = null;
			// Only a resolution failure means "not installed". Discarding the
			// error (this used to be `void error`) is how the e2b lane told the
			// deployed dashboard to reinstall a dependency that was already
			// installed, while the real ERR_REQUIRE_ESM went in the bin -- the
			// 2026-08-02 incident, see the loadSdk note in ./e2b.ts.
			const code =
				error && typeof error === "object" && "code" in error
					? String((error as { code?: unknown }).code)
					: "";
			if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
				throw new MuxError(
					"fatal",
					"@fly/sprites is not installed; npm i @fly/sprites",
					SCOPE,
				);
			}
			throw new MuxError(
				"fatal",
				`@fly/sprites failed to load on node ${process.versions.node}: ${
					code ? `${code}: ` : ""
				}${error instanceof Error ? error.message : String(error)}`,
				SCOPE,
			);
		});
	}
	return spritesModulePromise;
}

/**
 * Backoff before retry N, derived from the attempt index alone.
 *
 * Deliberately jitter-free: Math.random is not available in every context
 * this module runs in, and a deterministic schedule is the only kind a
 * test can assert. The cap keeps a four-attempt create under ~5s of
 * waiting instead of growing without bound.
 */
export function retryDelayMs(attempt: number): number {
	const index = attempt > 0 ? Math.floor(attempt) : 0;
	return Math.min(RETRY_BASE_MS * 2 ** index, RETRY_CAP_MS);
}

export type RetryPolicy = {
	/** Total attempts including the first. Always bounded. */
	attempts: number;
	/**
	 * Retry rate limits in place. True only for create, where the vendor
	 * clears its per-minute creation limit in seconds; elsewhere the
	 * router's failover to another substrate is the better answer, so the
	 * error is surfaced instead of slept on.
	 */
	retryRateLimited?: boolean;
	/** Overridable so the policy suite runs without wall-clock waits. */
	delayFor?: (attempt: number) => number;
	/** Runs after the backoff, before the next attempt (wake, re-adopt). */
	beforeRetry?: (attempt: number, error: MuxError) => Promise<void>;
};

/** Retry only what another attempt against this same substrate could fix. */
function isRetryable(error: MuxError, policy: RetryPolicy): boolean {
	if (error.kind === "transient") return true;
	return policy.retryRateLimited === true && error.kind === "rate_limited";
}

/**
 * Run an operation under a bounded transport retry.
 *
 * Errors are normalized through mapVendorError first, so the retry
 * decision is made on the house taxonomy rather than on vendor error
 * shapes: transport-class failures (timeout, fetch failed, 5xx,
 * ECONNRESET) retry, 404 and auth do not.
 *
 * Only pass work that is safe to run twice. A timeout can arrive after
 * the remote command already ran, so a retried exec may repeat it; the
 * router's exec call sites are read-only probes or idempotent by
 * sentinel, and the one launcher that is neither (execBackground) runs
 * with a single attempt.
 */
export async function withTransportRetry<T>(
	operation: string,
	policy: RetryPolicy,
	attemptFn: (attempt: number) => Promise<T>,
): Promise<T> {
	const attempts = policy.attempts > 1 ? Math.floor(policy.attempts) : 1;
	const delayFor = policy.delayFor ?? retryDelayMs;
	let attempt = 0;
	for (;;) {
		try {
			return await attemptFn(attempt);
		} catch (error) {
			const mapped = mapVendorError(error, operation);
			if (attempt >= attempts - 1 || !isRetryable(mapped, policy)) throw mapped;
			await delay(delayFor(attempt));
			await policy.beforeRetry?.(attempt, mapped);
			attempt += 1;
		}
	}
}

/** The subset of the client that provisioning needs, so tests can fake it. */
export type SpriteProvisioner = Pick<SpritesClient, "createSprite" | "getSprite">;

/**
 * Get-or-create a sprite by name under the transport retry.
 *
 * Two measured vendor behaviors shape this (docs/MUX-RESULTS.md finding
 * 5): create returns intermittent 500s -- 2 of 3 identical requests
 * failed -- and a 500 can still have created the sprite, so the retry
 * then sees 409 "already exists". Retrying here is much cheaper than
 * failing the machine over to another substrate, and adopting an existing
 * sprite of the same name makes named creates idempotent, matching how
 * the router reuses names across processes.
 */
export async function createOrAdoptSprite(
	provisioner: SpriteProvisioner,
	name: string,
	env?: Record<string, string>,
	policy: Partial<RetryPolicy> = {},
): Promise<{ sprite: Sprite; adopted: boolean }> {
	return withTransportRetry(
		"create",
		{ attempts: CREATE_ATTEMPTS, retryRateLimited: true, ...policy },
		async () => {
			try {
				// `environment` rides in the POST body, not the URL, so create
				// is the one place env may be handed to the SDK directly.
				const sprite = await provisioner.createSprite(
					name,
					env ? { environment: env } : undefined,
				);
				return { sprite, adopted: false };
			} catch (error) {
				if (!isAlreadyExists(error)) throw error;
				return { sprite: await provisioner.getSprite(name), adopted: true };
			}
		},
	);
}

/**
 * Test seam: createSpritesProvider takes a client override so a suite can
 * prove describe()/remove() touch only the control-plane REST surface and
 * never exec against the sprite -- an exec is what wakes a suspended one.
 * The credential gate stays in front of the override, so an uncredentialed
 * provider still fails closed.
 */
export function createSpritesProvider(
	creds: { token?: string },
	clientOverride?: SpritesClient,
): SandboxProvider {
	const token = creds.token || undefined;
	let clientPromise: Promise<SpritesClient> | null = null;

	const client = (): Promise<SpritesClient> => {
		if (!token) {
			return Promise.reject(
				new MuxError(
					"missing_credentials",
					"Sprites token is missing (providers.sprites.token / SPRITES_TOKEN).",
					SCOPE,
				),
			);
		}
		if (clientOverride) return Promise.resolve(clientOverride);
		if (!clientPromise) {
			clientPromise = loadSprites()
				.then((mod) => new mod.SpritesClient(token))
				.catch((error) => {
					clientPromise = null;
					throw error;
				});
		}
		return clientPromise;
	};

	return {
		kind: "sprites",
		capabilities: CAPABILITIES,

		ready(): { ok: boolean; missing: string[] } {
			return token ? { ok: true, missing: [] } : { ok: false, missing: ["SPRITES_TOKEN"] };
		},

		async create(options: CreateSandboxOptions = {}): Promise<SandboxHandle> {
			// Note: options.timeoutMs (idle park timeout) has no Sprites
			// equivalent -- sprites auto-suspend on their own schedule.
			const spritesClient = await client();
			// "unique" only changes the NAME. The adopt-on-409 below still
			// applies, because with a unique name a 409 can only mean our own
			// retried create already succeeded -- the measured vendor behavior
			// (a 500 that created the sprite anyway, MUX-RESULTS finding 5) --
			// never another caller's sandbox.
			const name = spriteNameFor(options.name, options.onNameConflict === "unique");
			const { sprite, adopted } = await createOrAdoptSprite(
				spritesClient,
				name,
				options.env,
			);
			// An adopted sprite has been idle for an unknown time and may have
			// auto-suspended since; a freshly created one is already up.
			return new SpritesSandbox(spritesClient, sprite, { adopted });
		},

		async connect(id: string): Promise<SandboxHandle> {
			const spritesClient = await client();
			try {
				const sprite = await withTransportRetry(
					"connect",
					{ attempts: CONTROL_ATTEMPTS },
					() => spritesClient.getSprite(id),
				);
				// Adopted: an existing sprite may have auto-suspended since it was
				// last used, so its first use has to wake it.
				return new SpritesSandbox(spritesClient, sprite, { adopted: true });
			} catch (error) {
				if (isNotFound(error)) {
					throw new MuxError(
						"fatal",
						`Sprite "${id}" was not found (sprites connect 404).`,
						SCOPE,
					);
				}
				throw mapVendorError(error, "connect");
			}
		},

		/**
		 * GET /v1/sprites/<name> (SDK dist/client.js getSprite) -- a record
		 * read on the control plane. Sprites wake on a request to the SPRITE
		 * (an exec, or its proxy URL), not on this, which is how a sprite left
		 * idle for ten minutes still reads "cold" here rather than being woken
		 * by the question (measured 2026-08-01, see LIVE_STATUS above).
		 *
		 * check() is deliberately not consulted. The same measurement had it
		 * answer "healthy" (reason "machine is running") for that cold sprite,
		 * so it cannot refine the phase and would only add a round trip.
		 */
		async describe(id: string): Promise<SandboxDescription> {
			const spritesClient = await client();
			try {
				const sprite = await withTransportRetry(
					"describe",
					{ attempts: CONTROL_ATTEMPTS },
					() => spritesClient.getSprite(id),
				);
				const phase = sprite.status ?? null;
				const description: SandboxDescription = {
					state: mapState(sprite.status),
					rawPhase: phase,
				};
				const createdAt = toIso(sprite.createdAt);
				if (createdAt) description.createdAt = createdAt;
				// cpus only. SpriteConfig calls its other axes "RAM in megabytes"
				// and "Storage in gigabytes" (SDK dist/types.d.ts, read
				// 2026-08-01) and no Fly page states whether those are decimal or
				// binary, so the MiB/GiB axes stay absent rather than carrying a
				// converted guess. The mux never sends a config, so in practice
				// the vendor returns none of this.
				if (typeof sprite.config?.cpus === "number") {
					description.resources = { vcpu: sprite.config.cpus };
				}
				return description;
			} catch (error) {
				if (isNotFound(error)) return { state: "destroyed", rawPhase: null };
				throw mapVendorError(error, "describe");
			}
		},

		/**
		 * DELETE /v1/sprites/<name>. No exec and no proxy request, so a
		 * suspended sprite is deleted while suspended.
		 *
		 * connect() happens to be non-waking on this substrate too -- it reads
		 * the record and defers the wake to first use -- but this exists so a
		 * caller gets one no-wake path that is the same shape on every
		 * substrate, including the two where connect() does resume.
		 */
		async remove(id: string): Promise<void> {
			const spritesClient = await client();
			try {
				await withTransportRetry("remove", { attempts: CONTROL_ATTEMPTS }, () =>
					spritesClient.deleteSprite(id),
				);
			} catch (error) {
				if (isNotFound(error)) return;
				throw mapVendorError(error, "remove");
			}
		},

		// No park(): the SDK's whole Sprite surface is create / get / list /
		// watch / delete / upgrade / restart / check / updateURLSettings /
		// update (dist/client.d.ts and dist/sprite.d.ts, read 2026-08-01) --
		// there is no suspend or pause, and sprites auto-suspend on their own
		// schedule. restart() replaces the machine, which kills the detached
		// tmux work installs and background payloads live in, so it is not a
		// park either. Omitted rather than stubbed: a park() that resolved
		// without parking would be a false claim.

		async list(): Promise<SandboxInfo[]> {
			const spritesClient = await client();
			try {
				// Sprite names are global per org; only surface the ones this
				// mux created (they all carry the am-mux- prefix).
				const sprites = await withTransportRetry(
					"list",
					{ attempts: CONTROL_ATTEMPTS },
					() => spritesClient.listAllSprites(NAME_PREFIX),
				);
				return sprites.map((sprite) => ({
					id: sprite.name,
					name: sprite.name,
					state: mapState(sprite.status),
					substrate: "sprites" as const,
					createdAt: toIso(sprite.createdAt),
				}));
			} catch (error) {
				throw mapVendorError(error, "list");
			}
		},
	};
}

/** Internal knobs. Not part of the SandboxHandle contract. */
export type SpritesSandboxOptions = {
	/**
	 * The sprite already existed (connect, or create adopting a name).
	 * Sprites auto-suspend when idle, so an adopted one may be cold and can
	 * spend a whole exec timeout booting before it answers.
	 */
	adopted?: boolean;
	/** Overridable backoff so the policy suite runs without real waits. */
	delayFor?: (attempt: number) => number;
};

export class SpritesSandbox implements SandboxHandle {
	readonly id: string;
	readonly substrate = "sprites" as const;
	readonly capabilities = CAPABILITIES;
	private readonly client: SpritesClient;
	private readonly handle: Sprite;
	private readonly delayFor?: (attempt: number) => number;
	/** Cleared for good once this handle has seen the sprite answer. */
	private wakePending: boolean;

	constructor(
		client: SpritesClient,
		handle: Sprite,
		options: SpritesSandboxOptions = {},
	) {
		this.client = client;
		this.handle = handle;
		this.id = handle.name;
		this.wakePending = options.adopted === true;
		this.delayFor = options.delayFor;
	}

	/** Bounded transport-retry policy for this handle's calls. */
	private policy(
		attempts: number,
		beforeRetry?: RetryPolicy["beforeRetry"],
	): RetryPolicy {
		return { attempts, delayFor: this.delayFor, beforeRetry };
	}

	/**
	 * One-shot exec over HTTP (no WebSocket), under the transport retry.
	 *
	 * Non-zero exits are returned as results, not thrown, so a command that
	 * merely failed is never re-run. Two transport shapes are handled: a
	 * timeout is the signature of a suspended sprite, so the first retry
	 * wakes it and widens the budget past a cold boot; a framing defect (the
	 * HTTP exec protocol needs preserved chunk boundaries) falls back once
	 * to the WS spawn path, which no re-chunking proxy can break.
	 *
	 * Caveat the retry does not remove: a timeout or framing error can
	 * surface after the command already ran, so a retried exec may repeat a
	 * side-effectful command. Every router call site here is a read-only
	 * probe or idempotent by sentinel, and the one launcher that is neither
	 * runs with a single attempt (see execBackground).
	 */
	async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
		return this.execWithPolicy(command, options, EXEC_ATTEMPTS);
	}

	private async execWithPolicy(
		command: string,
		options: ExecOptions | undefined,
		attempts: number,
	): Promise<ExecResult> {
		const startedAt = Date.now();
		const baseTimeoutMs = options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
		// Widened only after a wake, so a healthy sprite keeps the caller's
		// budget and a genuinely hung command is still cut off on schedule.
		// It is a ceiling, not a wait: the wake probe has already blocked
		// until the sprite answers, so the retry normally returns at warm
		// speed and only a still-unresponsive sprite spends the whole budget.
		let timeoutMs = baseTimeoutMs;
		let woke = false;
		await this.wakeIfCold();
		return withTransportRetry(
			"exec",
			this.policy(attempts, async () => {
				if (woke) return;
				woke = true;
				await this.wakeUp();
				timeoutMs = Math.max(baseTimeoutMs, WAKE_TIMEOUT_MS);
			}),
			() => this.execOnce(command, options, timeoutMs, startedAt),
		);
	}

	private async execOnce(
		command: string,
		options: ExecOptions | undefined,
		timeoutMs: number,
		startedAt: number,
	): Promise<ExecResult> {
		try {
			// Re-staged per attempt on purpose: the previous attempt's script may
			// already have sourced and unlinked its env file, and reusing it
			// would run the command with none of its keys.
			const script = await scriptFor(this.handle, command, options?.env);
			const result = await this.handle.execFileHTTP("bash", ["-lc", script], {
				cwd: options?.cwd,
				timeout: timeoutMs,
			});
			this.wakePending = false;
			return {
				stdout: textOf(result.stdout),
				stderr: textOf(result.stderr),
				exitCode: result.exitCode,
				durationMs: Date.now() - startedAt,
			};
		} catch (error) {
			const failed = execResultFrom(error);
			if (failed) {
				this.wakePending = false;
				return { ...failed, durationMs: Date.now() - startedAt };
			}
			if (isFramingError(error)) {
				return this.execViaSpawn(command, options, startedAt);
			}
			throw mapVendorError(error, "exec");
		}
	}

	/**
	 * Wake an adopted sprite before its first use.
	 *
	 * One cheap request up front is far cheaper than discovering a suspended
	 * sprite by spending the caller's entire exec budget on a boot -- "exec
	 * timed out" was one of the four live failures in docs/MUX-RESULTS.md.
	 */
	private async wakeIfCold(): Promise<void> {
		if (!this.wakePending) return;
		this.wakePending = false;
		// The adopted record's own status is free -- it arrived with the sprite
		// -- and it is the only signal measured to be honest about whether the
		// machine is up. No extra round trip is spent confirming it.
		if (!LIVE_STATUS.test(this.handle.status ?? "")) await this.wakeUp();
	}

	/**
	 * Force a parked sprite awake and wait until it answers.
	 *
	 * There is no wake endpoint: a request is what starts a suspended
	 * sprite, and the cheapest one that blocks until the VM is really
	 * serving is a trivial exec. Deliberately not restart() -- that replaces
	 * the machine and would kill detached tmux work, which is where installs
	 * and background payloads live.
	 */
	private async wakeUp(): Promise<void> {
		try {
			// Bounded retry, because the first touch of a parked sprite is
			// exactly where the control plane fails: a sprite left idle for ten
			// minutes answered its next exec with a 502 (measured 2026-08-01).
			await withTransportRetry("wake", this.policy(WAKE_ATTEMPTS), () =>
				this.handle.execFileHTTP("bash", ["-lc", "exit 0"], {
					timeout: WAKE_TIMEOUT_MS,
				}),
			);
			this.wakePending = false;
		} catch (error) {
			const mapped = mapVendorError(error, "wake");
			if (mapped.kind === "fatal") throw mapped;
			// Transport-class: the caller's own attempt reports the real error,
			// and a second wake here would just double the wait.
		}
	}

	/** WS-spawn fallback for exec, used once per call on framing errors. */
	private async execViaSpawn(
		command: string,
		options: ExecOptions | undefined,
		startedAt: number,
	): Promise<ExecResult> {
		const abort = new AbortController();
		let stdout = "";
		let stderr = "";
		let exitCode = -1;
		let sawExit = false;
		let overflowed = false;
		for await (const event of this.streamScripted(command, {
			timeoutMs: options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
			env: options?.env,
			cwd: options?.cwd,
			signal: abort.signal,
		})) {
			if (event.type === "stdout") stdout += event.data;
			if (event.type === "stderr") stderr += event.data;
			if (event.type === "exit") {
				exitCode = event.exitCode;
				sawExit = true;
			}
			if (stdout.length + stderr.length > MAX_FALLBACK_OUTPUT_BYTES) {
				overflowed = true;
				abort.abort();
			}
		}
		if (overflowed) {
			throw new MuxError(
				"fatal",
				`sprites exec output exceeded ${MAX_FALLBACK_OUTPUT_BYTES} bytes on the WS fallback path.`,
				SCOPE,
			);
		}
		if (!sawExit) {
			throw new MuxError(
				"transient",
				"sprites exec WS fallback ended without an exit code.",
				SCOPE,
			);
		}
		return { stdout, stderr, exitCode, durationMs: Date.now() - startedAt };
	}

	/** Native incremental streaming via the WS process API (`spawn`). */
	async *execStream(
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		yield* this.streamScripted(command, options ?? {});
	}

	private async *streamScripted(
		command: string,
		options: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		if (options.signal?.aborted) return;
		await this.wakeIfCold();
		// The staging write retries; the spawn below deliberately does not. A
		// stream may already have emitted output, and re-running it mid-stream
		// would duplicate an agent turn.
		const script = await withTransportRetry(
			"execStream stage",
			this.policy(CONTROL_ATTEMPTS),
			() => scriptFor(this.handle, command, options.env),
		);
		const queue = new PushQueue<ExecStreamEvent>();
		let finished = false;
		// env is inside `script` (sourced from a staged file); passing it
		// here would put secrets in the WebSocket URL's query string.
		const proc = this.handle.spawn("bash", ["-lc", script], {
			cwd: options.cwd,
		});
		const killProc = (signal: string): void => {
			try {
				proc.kill(signal);
			} catch {
				// Process already gone or socket already closed.
			}
		};
		proc.on("error", (error: unknown) => {
			finished = true;
			queue.fail(mapVendorError(error, "execStream"));
		});
		proc.stdout.on("data", (chunk: Buffer | string) => {
			queue.push({ type: "stdout", data: textOf(chunk) });
		});
		proc.stderr.on("data", (chunk: Buffer | string) => {
			queue.push({ type: "stderr", data: textOf(chunk) });
		});
		proc.on("exit", (code: unknown) => {
			finished = true;
			queue.push({ type: "exit", exitCode: typeof code === "number" ? code : -1 });
			queue.end();
		});

		let timer: ReturnType<typeof setTimeout> | undefined;
		if (options.timeoutMs && options.timeoutMs > 0) {
			timer = setTimeout(() => {
				killProc("SIGKILL");
				queue.fail(
					new MuxError(
						"transient",
						`sprites execStream timed out after ${options.timeoutMs}ms`,
						SCOPE,
					),
				);
			}, options.timeoutMs);
		}
		// On abort we end the stream gracefully (no throw) so PTY tails and
		// router consumers can unwind through their own finally blocks.
		const onAbort = (): void => {
			killProc("SIGTERM");
			queue.end();
		};
		options.signal?.addEventListener("abort", onAbort, { once: true });

		try {
			for await (const event of queue) {
				yield event;
				if (event.type === "exit") return;
			}
		} finally {
			if (timer) clearTimeout(timer);
			options.signal?.removeEventListener("abort", onAbort);
			// Consumer bailed early: do not leak the remote process.
			if (!finished) killProc("SIGTERM");
		}
	}

	/** Fire-and-forget: daemonize on the sprite, return after setup. */
	async execBackground(command: string): Promise<void> {
		// The payload deletes its own script as its last act, so the
		// launcher never has to compose a cleanup command around a quoted
		// file reference.
		const selfDeleting = `${command}\nrm -f "$0"\n`;
		const b64 = Buffer.from(selfDeleting, "utf8").toString("base64");
		let script: string;
		try {
			if (b64.length <= MAX_INLINE_B64) {
				script = `f=$(mktemp /tmp/am-mux-bg.XXXXXX) && printf '%s' '${b64}' | base64 -d > "$f" && ${backgroundWrapper('"$f"')}`;
			} else {
				const file = await stageCommandFile(this.handle, selfDeleting);
				script = backgroundWrapper(file);
			}
		} catch (error) {
			throw mapVendorError(error, "execBackground stage");
		}
		// Sprites' HTTP exec waits for the whole process group, so setsid +
		// nohup + closed fds still block until the child exits (measured
		// 2026-07-31: a `sleep 45 &` payload returned in 45.2s). The native
		// primitive for work that outlives the connection is a detachable
		// session, which returns as soon as it is created. Detach without
		// killing by disconnecting the socket -- the server keeps the
		// session running.
		// Route the launcher through the base64-wrapping exec path rather than
		// calling execFileHTTP directly: that path wraps the whole command, and
		// passing this launcher's own quoting (single-quoted base64, `$$`,
		// `$(date)`) as raw argv did not survive the transport -- tmux
		// reported success while the payload never ran (verified
		// 2026-07-31). The launcher itself returns immediately because
		// `tmux new-session -d` hands the work to the tmux server, so this
		// stays fire-and-forget.
		// One attempt only: retrying a launcher can start the payload twice,
		// and two concurrent npm installs are exactly what left a partial
		// node_modules tree that stayed broken across runs (see
		// docs/MUX-RESULTS.md). A cold sprite is covered by the wake inside
		// execWithPolicy, not by a second launch.
		const launch = await this.execWithPolicy(
			script,
			{ timeoutMs: BACKGROUND_TIMEOUT_MS },
			1,
		);
		if (launch.exitCode !== 0) {
			throw new MuxError(
				"transient",
				`sprites execBackground launch exited ${launch.exitCode}: ${
					(launch.stderr || launch.stdout).slice(0, 240)
				}`,
				SCOPE,
			);
		}
	}

	/**
	 * Native PTY. Anonymous PTYs are plain tty spawns that die with the
	 * connection. Named sessions (options.session) are detachable tmux
	 * sessions: close() detaches, and the next openPty with the same name
	 * reattaches with scrollback via listSessions + attachSession.
	 */
	async openPty(options: PtyOptions = {}): Promise<PtyHandle> {
		// A PTY against a suspended sprite would spend its whole open timeout
		// waiting for a boot, so the wake happens before any socket work.
		await this.wakeIfCold();
		const cols = options.cols ?? 100;
		const rows = options.rows ?? 30;
		const named = options.session ? sanitizeName(options.session) : null;
		const sidFile = named ? `/tmp/am-mux-pty-${named}.sid` : null;

		// Secrets stay out of the URL: env is sourced from a staged file
		// inside the PTY's own command rather than passed to the SDK.
		const ptyEnv = options.env ?? {};
		const ptyPrelude =
			Object.keys(ptyEnv).length > 0
				? (await stageEnvFile(this.handle, ptyEnv)).prelude
				: "";
		const ptyScript = `${ptyPrelude}${ttyCommand(options.command)}`;

		let proc: SpriteCommand;
		let attachedSid: string | null = null;
		try {
			if (named && sidFile) {
				attachedSid = await this.findLiveSession(sidFile);
				proc = attachedSid
					? this.handle.attachSession(attachedSid, { cols, rows })
					: this.handle.createSession("bash", ["-lc", ptyScript], {
							cols,
							rows,
						});
			} else {
				proc = this.handle.spawn("bash", ["-lc", ptyScript], {
					tty: true,
					cols,
					rows,
				});
			}
		} catch (error) {
			throw mapVendorError(error, "openPty");
		}

		// The server announces the assigned session id in a session_info
		// message; listen before the WS finishes opening.
		const sessionId: Promise<string | null> = attachedSid
			? Promise.resolve(attachedSid)
			: named
				? sessionInfoId(proc)
				: Promise.resolve(null);

		const queue = new PushQueue<Uint8Array>();
		let exitResolve: (code: number | null) => void = () => {};
		const exited = new Promise<number | null>((resolvePromise) => {
			exitResolve = resolvePromise;
		});
		proc.on("error", (error: unknown) => {
			exitResolve(null);
			queue.fail(mapVendorError(error, "pty"));
		});
		// TTY mode merges output onto stdout; stderr is bridged as well so
		// nothing is lost if the server ever splits streams.
		proc.stdout.on("data", (chunk: Buffer | string) => queue.push(toBytes(chunk)));
		proc.stderr.on("data", (chunk: Buffer | string) => queue.push(toBytes(chunk)));
		proc.on("exit", (code: unknown) => {
			exitResolve(typeof code === "number" ? code : null);
			queue.end();
		});

		await commandStarted(proc);

		if (named && sidFile && !attachedSid) {
			// Persist name -> session id on the sprite so any later process
			// can reattach. Best effort, off the open critical path; a
			// reattach racing this write simply creates a fresh session.
			const fs = this.handle.filesystem("/");
			void sessionId.then((sid) =>
				sid ? fs.writeFile(sidFile, sid).catch(() => undefined) : undefined,
			);
		}

		const persistent = named !== null;

		return {
			output: queue,
			async write(data: string | Uint8Array): Promise<void> {
				const chunk = typeof data === "string" ? data : Buffer.from(data);
				await new Promise<void>((resolvePromise, rejectPromise) => {
					proc.stdin.write(chunk, (error) => {
						if (error) rejectPromise(mapVendorError(error, "pty write"));
						else resolvePromise();
					});
				});
			},
			async resize(nextCols: number, nextRows: number): Promise<void> {
				try {
					proc.resize(nextCols, nextRows);
				} catch (error) {
					throw mapVendorError(error, "pty resize");
				}
			},
			exited,
			async close(): Promise<void> {
				if (persistent) {
					// Detach, do not kill: the server keeps detachable sessions
					// (and their scrollback) alive across WS disconnects, so the
					// next openPty with this session name reattaches.
					await sessionId.catch(() => null);
					closeCommandSocket(proc);
				} else {
					try {
						proc.kill("SIGTERM");
					} catch {
						// Already exited or socket closed.
					}
					closeCommandSocket(proc);
				}
				exitResolve(null);
				queue.end();
			},
		};
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		const data = typeof content === "string" ? content : Buffer.from(content);
		const fs = this.handle.filesystem("/");
		await this.wakeIfCold();
		await withTransportRetry("writeFile", this.policy(CONTROL_ATTEMPTS), async () => {
			try {
				await fs.writeFile(path, data);
			} catch (error) {
				const code = (error as { code?: string }).code;
				const dir = path.split("/").slice(0, -1).join("/");
				// A missing parent is a real ENOENT, not a transport failure: it
				// classifies as fatal, so the wrapper will not retry it.
				if (code === "ENOENT" && dir) {
					await fs.mkdir(dir, { recursive: true });
					await fs.writeFile(path, data);
					return;
				}
				throw error;
			}
		});
	}

	/**
	 * The sprite URL proxies to port 8080 inside the sandbox; other ports
	 * have no public route, so they resolve to null.
	 */
	async publicUrl(port: number): Promise<string | null> {
		if (port !== SPRITE_PROXY_PORT) return null;
		return withTransportRetry("publicUrl", this.policy(CONTROL_ATTEMPTS), async () => {
			await this.handle.updateURLSettings({ auth: "public" });
			const fresh = await this.client.getSprite(this.id);
			return fresh.url ?? null;
		});
	}

	async state(): Promise<MachineState> {
		try {
			const fresh = await withTransportRetry(
				"state",
				this.policy(CONTROL_ATTEMPTS),
				() => this.client.getSprite(this.id),
			);
			return mapState(fresh.status);
		} catch (error) {
			if (isNotFound(error)) return "destroyed";
			throw mapVendorError(error, "state");
		}
	}

	/** Sprites auto-suspend when idle; there is no manual sleep API. */
	async sleep(): Promise<void> {
		await this.state();
	}

	/**
	 * Wake for real rather than reporting status: sprites auto-wake on the
	 * next request, so a caller asking for a wake wants the sprite actually
	 * answering when this resolves.
	 */
	async wake(): Promise<void> {
		this.wakePending = false;
		await this.wakeUp();
	}

	async destroy(): Promise<void> {
		try {
			await withTransportRetry("destroy", this.policy(CONTROL_ATTEMPTS), () =>
				this.handle.destroy(),
			);
		} catch (error) {
			if (isNotFound(error)) return;
			throw mapVendorError(error, "destroy");
		}
	}

	/** Look up a previously recorded tmux session id that is still live. */
	private async findLiveSession(sidFile: string): Promise<string | null> {
		let sid: string | null = null;
		try {
			sid = (await this.handle.filesystem("/").readFile(sidFile, "utf8")).trim() || null;
		} catch {
			return null;
		}
		if (!sid) return null;
		try {
			const sessions = await this.handle.listSessions();
			return sessions.some((session) => session.id === sid) ? sid : null;
		} catch {
			return null;
		}
	}

}

/**
 * Resolve the server-assigned exec session id from the session_info
 * message the Sprites server sends when a (detachable) session opens.
 */
function sessionInfoId(proc: SpriteCommand, timeoutMs = 15_000): Promise<string | null> {
	return new Promise((resolvePromise) => {
		const finish = (value: string | null): void => {
			clearTimeout(timer);
			proc.off("message", onMessage);
			proc.off("exit", onExit);
			resolvePromise(value);
		};
		const onMessage = (message: unknown): void => {
			const info = message as { type?: unknown; session_id?: unknown };
			if (info && info.type === "session_info" && info.session_id != null) {
				finish(String(info.session_id));
			}
		};
		const onExit = (): void => finish(null);
		const timer = setTimeout(() => finish(null), timeoutMs);
		timer.unref?.();
		proc.on("message", onMessage);
		proc.once("exit", onExit);
	});
}

/**
 * Close the underlying exec WebSocket. For detachable sessions this is
 * a detach (the server keeps the session alive); for plain tty spawns
 * the server reaps the process. SpriteCommand does not expose a
 * disconnect, so reach into the private wsCmd defensively -- if the SDK
 * internals change this degrades to leaving the socket for GC.
 */
function closeCommandSocket(proc: SpriteCommand): boolean {
	const ws = (proc as unknown as { wsCmd?: { close?: () => void } }).wsCmd;
	if (!ws || typeof ws.close !== "function") return false;
	try {
		ws.close();
		return true;
	} catch {
		return false;
	}
}

/** Wait for the WS command to open (or fail) before handing out a PTY. */
function commandStarted(proc: SpriteCommand, timeoutMs = PTY_OPEN_TIMEOUT_MS): Promise<void> {
	return new Promise<void>((resolvePromise, rejectPromise) => {
		let settled = false;
		const cleanup = (): void => {
			proc.off("spawn", onSpawn);
			proc.off("exit", onExit);
			proc.off("error", onError);
			clearTimeout(timer);
		};
		const settle = (): void => {
			if (settled) return;
			settled = true;
			cleanup();
			resolvePromise();
		};
		const onSpawn = (): void => settle();
		// An instant exit is a completed command, not an open failure.
		const onExit = (): void => settle();
		const onError = (error: unknown): void => {
			if (settled) return;
			settled = true;
			cleanup();
			rejectPromise(mapVendorError(error, "openPty"));
		};
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			cleanup();
			try {
				proc.kill("SIGKILL");
			} catch {
				// Never started.
			}
			rejectPromise(
				new MuxError("transient", `sprites PTY open timed out after ${timeoutMs}ms`, SCOPE),
			);
		}, timeoutMs);
		proc.once("spawn", onSpawn);
		proc.once("exit", onExit);
		proc.once("error", onError);
	});
}

/**
 * Single-consumer push queue bridging event emitters to async iteration.
 * Buffered items drain before a recorded failure is thrown.
 */
class PushQueue<T> implements AsyncIterable<T> {
	private readonly items: T[] = [];
	private readonly waiters: Array<{
		resolve: (result: IteratorResult<T, undefined>) => void;
		reject: (error: unknown) => void;
	}> = [];
	private done = false;
	private failed = false;
	private failure: unknown = undefined;

	push(value: T): void {
		if (this.done) return;
		const waiter = this.waiters.shift();
		if (waiter) waiter.resolve({ value, done: false });
		else this.items.push(value);
	}

	end(): void {
		if (this.done) return;
		this.done = true;
		for (const waiter of this.waiters.splice(0)) {
			waiter.resolve({ value: undefined, done: true });
		}
	}

	fail(error: unknown): void {
		if (this.done) return;
		this.done = true;
		this.failed = true;
		this.failure = error;
		for (const waiter of this.waiters.splice(0)) {
			waiter.reject(error);
		}
	}

	next(): Promise<IteratorResult<T, undefined>> {
		if (this.items.length > 0) {
			return Promise.resolve({ value: this.items.shift() as T, done: false });
		}
		if (this.failed) return Promise.reject(this.failure);
		if (this.done) return Promise.resolve({ value: undefined, done: true });
		return new Promise((resolve, reject) => {
			this.waiters.push({ resolve, reject });
		});
	}

	[Symbol.asyncIterator](): AsyncIterator<T, undefined> {
		return { next: () => this.next() };
	}
}

/** Proven quoting-safe wrapper (see web/lib/providers/e2b.ts). */
function inlineScript(b64: string): string {
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

async function stageCommandFile(sprite: Sprite, command: string): Promise<string> {
	const file = `/tmp/am-mux-cmd-${uniqueSuffix()}.sh`;
	await sprite.filesystem("/").writeFile(file, command);
	return file;
}

/**
 * Stage environment variables as a sourced file instead of handing them
 * to the SDK's `env` option.
 *
 * The Sprites SDK appends every env pair to the request URL's query
 * string (dist/exec.js `url.searchParams.append("env", ...)` on both the
 * HTTP and WebSocket paths), so model API keys would travel in a real
 * network URL -- the one place secrets must never go, because URLs are
 * logged by proxies, gateways and access logs. The filesystem write is a
 * request body, so the values stay out of the URL; the file is 0600 and
 * removed by the caller's script.
 */
/** POSIX single-quote escaping for values written into a shell file. */
function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function stageEnvFile(
	sprite: Sprite,
	env: Record<string, string>,
): Promise<{ path: string; prelude: string }> {
	const path = `/tmp/am-mux-env-${uniqueSuffix()}.sh`;
	const body = Object.entries(env)
		.map(([key, value]) => `export ${key}=${shq(value)}`)
		.join("\n");
	await sprite.filesystem("/").writeFile(path, `${body}\n`);
	return {
		path,
		// Source then unlink immediately: the values live only in the
		// process environment from that point on.
		prelude: `umask 077; . ${path}; rm -f ${path}; `,
	};
}

async function scriptFor(
	sprite: Sprite,
	command: string,
	env?: Record<string, string>,
): Promise<string> {
	// Secrets must not ride in the URL, so env is staged as a file the
	// script sources rather than passed to the SDK's env option.
	const prelude =
		env && Object.keys(env).length > 0
			? (await stageEnvFile(sprite, env)).prelude
			: "";
	const payload = prelude ? `${prelude}${command}` : command;
	const b64 = Buffer.from(payload, "utf8").toString("base64");
	if (b64.length <= MAX_INLINE_B64) return inlineScript(b64);
	const file = await stageCommandFile(sprite, payload);
	return `bash --noprofile --norc ${file}; am_exit=$?; rm -f ${file}; exit $am_exit`;
}

/**
 * Daemonize a staged script: new session where available (survives
 * process-group cleanup), full fd detachment, self-cleaning.
 */
/**
 * Launch a payload so it outlives the launching connection.
 *
 * Sprites' HTTP exec waits for the whole process group, so setsid/nohup
 * do not help (a `sleep 45 &` payload returned in 45.2s). Handing the
 * work to the tmux server does: `new-session -d` returns as soon as the
 * session is created. Falls back to setsid/nohup when tmux is absent,
 * which at least detaches on substrates that honor it.
 */
function backgroundWrapper(fileRef: string): string {
	// tmux runs the script file as argv, so nothing here needs a nested
	// quoting level (an earlier version embedded the file ref inside a
	// double-quoted tmux argument and silently ran nothing). The payload
	// removes its own script, so no cleanup command has to be composed in.
	const tmux = `tmux new-session -d -s ambg-$$-$(date +%s) bash --noprofile --norc ${fileRef}`;
	const fallback = `( (if command -v setsid >/dev/null 2>&1; then setsid nohup bash --noprofile --norc ${fileRef} >/dev/null 2>&1 </dev/null; else nohup bash --noprofile --norc ${fileRef} >/dev/null 2>&1 </dev/null; fi) & )`;
	return `if command -v tmux >/dev/null 2>&1; then ${tmux}; else ${fallback}; fi`;
}

/**
 * PTY command line. Command substitution (not a pipe) keeps the tty on
 * stdin -- piping base64 into bash would steal stdin from interactive
 * programs.
 */
function ttyCommand(command?: string): string {
	if (!command) return "exec bash -l";
	const b64 = Buffer.from(command, "utf8").toString("base64");
	return `exec bash -lc "$(printf '%s' '${b64}' | base64 -d)"`;
}

/**
 * Sprite name from a caller's name, per `CreateSandboxOptions.onNameConflict`.
 *
 * `unique` appends a suffix even to an already-prefixed name: the whole point is
 * that the result cannot equal another caller's, and a caller passing the
 * derived name straight through would otherwise get the deterministic one back.
 */
function spriteNameFor(name: string | undefined, unique: boolean): string {
	if (name) {
		if (name.startsWith(NAME_PREFIX)) {
			return unique ? `${name}-${uniqueSuffix()}` : name;
		}
		const safe = name
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40);
		const base = safe || uniqueSuffix();
		return unique
			? `${NAME_PREFIX}${base}-${uniqueSuffix()}`
			: `${NAME_PREFIX}${base}`;
	}
	// No name: there is nothing to collide with either way.
	return `${NAME_PREFIX}${uniqueSuffix()}`;
}

function sanitizeName(value: string): string {
	const safe = value
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return safe || "default";
}

/**
 * Unique-enough suffix for staged files and generated sprite names,
 * without Math.random -- it is unavailable in some contexts this module
 * runs in, and the retry policy has to stay deterministic anyway. A
 * timestamp plus pid plus a monotonic counter separates two stagers in
 * the same millisecond, in one process or across processes.
 */
let suffixCounter = 0;
function uniqueSuffix(): string {
	suffixCounter += 1;
	return `${Date.now().toString(36)}${process.pid.toString(36)}${suffixCounter.toString(36)}`;
}

function textOf(value: unknown): string {
	if (typeof value === "string") return value;
	if (Buffer.isBuffer(value)) return value.toString("utf8");
	return value == null ? "" : String(value);
}

function toBytes(chunk: Buffer | string): Uint8Array {
	if (typeof chunk === "string") return new TextEncoder().encode(chunk);
	return chunk;
}

function toIso(value: unknown): string | undefined {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string" && value.length > 0) return value;
	return undefined;
}

function mapState(status: string | undefined): MachineState {
	switch ((status ?? "").toLowerCase()) {
		case "running":
			return "ready";
		case "warm":
		case "cold":
		case "suspended":
		case "stopped":
			// Parked but auto-wakes on the next exec/HTTP request. Measured
			// live 2026-08-01: "warm" is the steady state of a sprite that
			// still answers in ~60ms, while "cold" is what a sprite reports
			// after ten idle minutes -- a distinction this coarse view drops,
			// which is why wakeIfCold reads the raw status instead.
			return "sleeping";
		case "creating":
		case "starting":
		case "warming":
			return "starting";
		case "destroying":
		case "deleting":
			return "destroying";
		case "destroyed":
		case "deleted":
			return "destroyed";
		case "error":
		case "failed":
			return "error";
		default:
			return "unknown";
	}
}

/** Extract a completed-but-nonzero exec result from an SDK ExecError. */
function execResultFrom(
	error: unknown,
): { stdout: string; stderr: string; exitCode: number } | null {
	const result = (
		error as { result?: { stdout?: unknown; stderr?: unknown; exitCode?: unknown } }
	).result;
	if (result && typeof result.exitCode === "number") {
		return {
			stdout: textOf(result.stdout),
			stderr: textOf(result.stderr),
			exitCode: result.exitCode,
		};
	}
	return null;
}

/**
 * HTTP exec framing/transport defects (the protocol relies on preserved
 * chunk boundaries); these are the only errors worth a WS retry.
 */
function isFramingError(error: unknown): boolean {
	const message = messageOf(error);
	return /exec frame|exit frame|chunk boundaries|maxBuffer exceeded|response has no body/i.test(
		message,
	);
}

function isNotFound(error: unknown): boolean {
	const status = statusOf(error);
	if (status === 404) return true;
	return /\b404\b|not found/i.test(messageOf(error));
}

function isAlreadyExists(error: unknown): boolean {
	const status = statusOf(error);
	if (status === 409) return true;
	return /\b409\b|already exists/i.test(messageOf(error));
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function statusOf(error: unknown): number | undefined {
	const carrier = error as { statusCode?: unknown; status?: unknown };
	if (typeof carrier.statusCode === "number") return carrier.statusCode;
	if (typeof carrier.status === "number") return carrier.status;
	// WS handshakes surface as "Unexpected server response: NNN".
	const match = messageOf(error).match(/(?:status|response):?\s*(\d{3})/i);
	return match ? Number.parseInt(match[1] ?? "", 10) : undefined;
}

/**
 * A rejected token is a configuration problem: no retry and no failover
 * can fix it, so it must never be classified as transport.
 */
function isAuthFailure(error: unknown, status: number | undefined): boolean {
	if (status === 401 || status === 403) return true;
	// Trust the wording only when there is no status to trust instead: a 5xx
	// body that happens to mention auth is still a server failure.
	if (status !== undefined) return false;
	return /unauthorized|forbidden|invalid token|invalid api key|authentication (?:failed|required)/i.test(
		messageOf(error),
	);
}

/** Socket-level codes; undici hides them on error.cause of "fetch failed". */
const TRANSPORT_CODES =
	/^(?:ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|UND_ERR_)/;

function transportCodeOf(error: unknown): string {
	const direct = (error as { code?: unknown }).code;
	if (typeof direct === "string") return direct;
	const cause = (error as { cause?: { code?: unknown } }).cause;
	const code = cause?.code;
	return typeof code === "string" ? code : "";
}

/**
 * House taxonomy, and it is load-bearing for routing: "transient"
 * (timeout, fetch failed, 5xx, reset socket) and "rate_limited" let the
 * router fail the machine over to another substrate, while a 404 or a
 * rejected token is "fatal" -- retrying those only burns the caller's
 * time, and the message has to say which one it was.
 */
export function mapVendorError(error: unknown, operation: string): MuxError {
	if (error instanceof MuxError) return error;
	const message = messageOf(error).slice(0, 300);
	const status = statusOf(error);
	const errorCode = (error as { errorCode?: unknown }).errorCode;
	if (
		status === 429 ||
		errorCode === "sprite_creation_rate_limited" ||
		errorCode === "concurrent_sprite_limit_exceeded"
	) {
		return new MuxError("rate_limited", `sprites ${operation}: ${message}`, SCOPE);
	}
	if (isAuthFailure(error, status)) {
		return new MuxError(
			"fatal",
			`sprites ${operation} auth rejected: ${message} -- check providers.sprites.token / SPRITES_TOKEN`,
			SCOPE,
		);
	}
	if (status === 404 || (status === undefined && /sprite not found/i.test(message))) {
		return new MuxError(
			"fatal",
			`sprites ${operation}: sprite not found (404): ${message}`,
			SCOPE,
		);
	}
	if (status !== undefined && status >= 500) {
		return new MuxError("transient", `sprites ${operation} ${status}: ${message}`, SCOPE);
	}
	if (status !== undefined && status >= 400) {
		return new MuxError("fatal", `sprites ${operation} ${status}: ${message}`, SCOPE);
	}
	const name = (error as { name?: unknown }).name;
	if (name === "TimeoutError" || name === "AbortError" || /aborted|timed? ?out/i.test(message)) {
		return new MuxError("transient", `sprites ${operation} timed out: ${message}`, SCOPE);
	}
	if (
		TRANSPORT_CODES.test(transportCodeOf(error)) ||
		/fetch failed|network|socket|websocket|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE/i.test(
			message,
		)
	) {
		return new MuxError("transient", `sprites ${operation}: ${message}`, SCOPE);
	}
	return new MuxError("fatal", `sprites ${operation}: ${message}`, SCOPE);
}

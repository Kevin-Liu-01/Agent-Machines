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
 * "always-on" and sleep()/wake() simply resolve current state.
 *
 * Named PTY sessions: the Sprites server assigns session ids (announced
 * in a session_info message on the exec WebSocket). We persist that id
 * in a well-known file on the sprite (/tmp/am-mux-pty-<name>.sid) so a
 * later openPty -- possibly from a different process -- can validate it
 * against listSessions and reattach via attachSession.
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
	type SandboxHandle,
	type SandboxInfo,
	type SandboxProvider,
} from "../types.js";

const SCOPE = { substrate: "sprites" as const };
const NAME_PREFIX = "am-mux-";
/** Same-substrate retries for the flaky create endpoint. */
const CREATE_ATTEMPTS = 4;
const CREATE_BACKOFF_MS = 700;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
/** The sprite public URL proxies to this port inside the sandbox. */
const SPRITE_PROXY_PORT = 8080;
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
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

const CAPABILITIES: SandboxCapabilities = {
	pty: "native",
	persistence: "always-on",
	reattach: true,
	publicUrl: true,
	streamingExec: true,
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
		spritesModulePromise = import("@fly/sprites").catch((error) => {
			spritesModulePromise = null;
			void error;
			throw new MuxError(
				"fatal",
				"@fly/sprites is not installed; npm i @fly/sprites",
				SCOPE,
			);
		});
	}
	return spritesModulePromise;
}

export function createSpritesProvider(creds: { token?: string }): SandboxProvider {
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
			const name = spriteNameFor(options.name);
			// Two vendor behaviors shape this loop (measured 2026-07-31):
			// (1) create returns intermittent 500s -- 2 of 3 identical
			// requests failed; (2) a 500 can still have created the sprite,
			// so the retry then sees 409 "already exists". Retrying in
			// provider is much cheaper than failing the machine over to
			// another substrate, and adopting an existing sprite of the same
			// name makes named creates idempotent (get-or-create), matching
			// how the router reuses names across processes.
			let lastError: unknown;
			for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
				try {
					const sprite = await spritesClient.createSprite(
						name,
						options.env ? { environment: options.env } : undefined,
					);
					return new SpritesSandbox(spritesClient, sprite);
				} catch (error) {
					lastError = error;
					if (isAlreadyExists(error)) {
						const existing = await spritesClient.getSprite(name);
						return new SpritesSandbox(spritesClient, existing);
					}
					const mapped = mapVendorError(error, "create");
					const retryable =
						mapped.kind === "transient" || mapped.kind === "rate_limited";
					if (!retryable || attempt === CREATE_ATTEMPTS - 1) throw mapped;
					await delay(CREATE_BACKOFF_MS * 2 ** attempt);
				}
			}
			throw mapVendorError(lastError, "create");
		},

		async connect(id: string): Promise<SandboxHandle> {
			const spritesClient = await client();
			try {
				const sprite = await spritesClient.getSprite(id);
				return new SpritesSandbox(spritesClient, sprite);
			} catch (error) {
				if (isNotFound(error)) {
					throw new MuxError("fatal", `Sprite "${id}" was not found.`, SCOPE);
				}
				throw mapVendorError(error, "connect");
			}
		},

		async list(): Promise<SandboxInfo[]> {
			const spritesClient = await client();
			try {
				// Sprite names are global per org; only surface the ones this
				// mux created (they all carry the am-mux- prefix).
				const sprites = await spritesClient.listAllSprites(NAME_PREFIX);
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

class SpritesSandbox implements SandboxHandle {
	readonly id: string;
	readonly substrate = "sprites" as const;
	readonly capabilities = CAPABILITIES;
	private readonly client: SpritesClient;
	private readonly handle: Sprite;

	constructor(client: SpritesClient, handle: Sprite) {
		this.client = client;
		this.handle = handle;
		this.id = handle.name;
	}

	/**
	 * One-shot exec over HTTP (no WebSocket). Non-zero exits are returned
	 * as results, not thrown. The HTTP exec protocol depends on preserved
	 * chunk boundaries, so if the SDK reports a framing/transport defect
	 * we retry once over the WS spawn path (slower but immune to
	 * re-chunking proxies). Caveat: a framing error can surface after the
	 * command already ran, so the fallback may re-run a side-effectful
	 * command once.
	 */
	async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
		const startedAt = Date.now();
		const timeoutMs = options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
		try {
			const script = await scriptFor(this.handle, command, options?.env);
			const result = await this.handle.execFileHTTP("bash", ["-lc", script], {
				cwd: options?.cwd,
				timeout: timeoutMs,
			});
			return {
				stdout: textOf(result.stdout),
				stderr: textOf(result.stderr),
				exitCode: result.exitCode,
				durationMs: Date.now() - startedAt,
			};
		} catch (error) {
			const failed = execResultFrom(error);
			if (failed) {
				return { ...failed, durationMs: Date.now() - startedAt };
			}
			if (isFramingError(error)) {
				return this.execViaSpawn(command, options, startedAt);
			}
			throw mapVendorError(error, "exec");
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
		let script: string;
		try {
			script = await scriptFor(this.handle, command, options.env);
		} catch (error) {
			throw mapVendorError(error, "execStream stage");
		}
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
		// Route the launcher through this.exec() rather than calling
		// execFileHTTP directly: exec base64-wraps the whole command, and
		// passing this launcher's own quoting (single-quoted base64, `$$`,
		// `$(date)`) as raw argv did not survive the transport -- tmux
		// reported success while the payload never ran (verified
		// 2026-07-31). The launcher itself returns immediately because
		// `tmux new-session -d` hands the work to the tmux server, so this
		// stays fire-and-forget.
		const launch = await this.exec(script, { timeoutMs: BACKGROUND_TIMEOUT_MS });
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
		try {
			await fs.writeFile(path, data);
		} catch (error) {
			const code = (error as { code?: string }).code;
			const dir = path.split("/").slice(0, -1).join("/");
			if (code === "ENOENT" && dir) {
				try {
					await fs.mkdir(dir, { recursive: true });
					await fs.writeFile(path, data);
					return;
				} catch (retryError) {
					throw mapVendorError(retryError, "writeFile");
				}
			}
			throw mapVendorError(error, "writeFile");
		}
	}

	/**
	 * The sprite URL proxies to port 8080 inside the sandbox; other ports
	 * have no public route, so they resolve to null.
	 */
	async publicUrl(port: number): Promise<string | null> {
		if (port !== SPRITE_PROXY_PORT) return null;
		try {
			await this.handle.updateURLSettings({ auth: "public" });
			const fresh = await this.client.getSprite(this.id);
			return fresh.url ?? null;
		} catch (error) {
			throw mapVendorError(error, "publicUrl");
		}
	}

	async state(): Promise<MachineState> {
		try {
			const fresh = await this.client.getSprite(this.id);
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

	/** Sprites auto-wake on the next exec/HTTP request. */
	async wake(): Promise<void> {
		await this.state();
	}

	async destroy(): Promise<void> {
		try {
			await this.handle.destroy();
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
	const file = `/tmp/am-mux-cmd-${randomSuffix()}.sh`;
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
	const path = `/tmp/am-mux-env-${randomSuffix()}.sh`;
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

function spriteNameFor(name?: string): string {
	if (name) {
		if (name.startsWith(NAME_PREFIX)) return name;
		const safe = name
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40);
		return `${NAME_PREFIX}${safe || randomSuffix()}`;
	}
	return `${NAME_PREFIX}${randomSuffix()}`;
}

function sanitizeName(value: string): string {
	const safe = value
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return safe || "default";
}

function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 10);
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
			// Parked but auto-wakes on the next exec/HTTP request.
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
	const status = (error as { statusCode?: unknown }).statusCode;
	if (typeof status === "number") return status;
	// WS handshakes surface as "Unexpected server response: NNN".
	const match = messageOf(error).match(/(?:status|response):?\s*(\d{3})/i);
	return match ? Number.parseInt(match[1] ?? "", 10) : undefined;
}

/** House taxonomy: 429 -> rate_limited, 5xx/network -> transient, 4xx -> fatal. */
function mapVendorError(error: unknown, operation: string): MuxError {
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
		/fetch failed|network|socket|websocket|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE/i.test(
			message,
		)
	) {
		return new MuxError("transient", `sprites ${operation}: ${message}`, SCOPE);
	}
	return new MuxError("fatal", `sprites ${operation}: ${message}`, SCOPE);
}

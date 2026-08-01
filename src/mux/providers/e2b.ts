/**
 * E2B substrate adapter.
 *
 * Wraps the `e2b` SDK (v2.x) behind the SandboxProvider contract:
 *
 *   create   -> Sandbox.create (Firecracker microVM, ~150-265ms cold)
 *   exec     -> sbx.commands.run, base64-wrapped through bash -lc
 *   stream   -> onStdout/onStderr callbacks bridged to an AsyncGenerator
 *   pty      -> native sbx.pty (create/sendInput/resize/kill); named
 *               sessions fall back to tmux-over-exec so reattaching with
 *               the same session name resumes scrollback
 *   sleep    -> Sandbox.pause (full memory snapshot). NOTE: pausing kills
 *               every live SDK stream and PTY connection; processes are
 *               frozen in the snapshot and thaw on wake, but callers must
 *               re-open PTYs and exec streams after a sleep/wake cycle.
 *   wake     -> Sandbox.connect (auto-resumes a paused sandbox)
 *   public   -> https://<sbx.getHost(port)>
 *
 * State mapping: running -> ready, paused -> sleeping, missing -> destroyed.
 *
 * The SDK is imported lazily inside methods so unused substrates cost
 * nothing at import time; missing credentials are reported through
 * ready() and never thrown at construction (fail closed).
 */

import { openTmuxPty } from "../pty/tmux.js";
import {
	MuxError,
	type CreateSandboxOptions,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type MachineState,
	type MuxErrorKind,
	type PtyHandle,
	type PtyOptions,
	type SandboxCapabilities,
	type SandboxHandle,
	type SandboxInfo,
	type SandboxProvider,
} from "../types.js";

/**
 * The awaited dynamic-import shape, not `typeof import("e2b")`: the SDK
 * re-exports Sandbox as its default, so under NodeNext the namespace
 * type and the dynamic-import type disagree on `default` and the
 * declaration build fails.
 */
const importE2b = () => import("e2b");
type E2bModule = Awaited<ReturnType<typeof importE2b>>;
type E2bSandbox = import("e2b").Sandbox;
type E2bSandboxInfo = import("e2b").SandboxInfo;

const DEFAULT_EXEC_TIMEOUT_MS = 120_000;
const DEFAULT_SANDBOX_TIMEOUT_MS = 300_000;
const DEFAULT_PTY_COLS = 100;
const DEFAULT_PTY_ROWS = 30;

/**
 * Declared capabilities. Every vendor fact below cites the page it came from
 * and the date it was read; anything E2B does not publish is "unknown" and
 * fails a constraint that needs it rather than passing optimistically.
 */
const CAPABILITIES: SandboxCapabilities = {
	pty: "native",
	persistence: "memory-snapshot",
	reattach: true,
	publicUrl: true,
	streamingExec: true,
	detachedWork: "reliable",
	// No create-time region argument exists: the SDK reference
	// (https://e2b.dev/docs/sdk-reference/js-sdk/v1.13.1/sandbox, read
	// 2026-08-01) lists accessToken, apiKey, allowInternetAccess, domain,
	// envs, headers, logger, metadata, requestTimeoutMs, secure and timeoutMs
	// and nothing else, and no E2B page states which region a plain create
	// lands in. `domain` points the SDK at a different API host (BYOC), not at
	// a documented region, so it is not read as a region selector here.
	region: { default: "unknown", available: "unknown", select: "unsupported" },
	// No E2B-owned page documents GPU sandboxes and the create options carry
	// no accelerator field (same SDK reference, read 2026-08-01). Third-party
	// comparisons assert E2B has none; that is not a vendor source, so this
	// stays "unknown" instead of claiming either direction, and a GPU need
	// rejects the lane either way.
	gpu: { available: "unknown", models: "unknown", request: "unsupported" },
	// https://e2b.dev/docs/sandbox/internet-access (read 2026-08-01): "Every
	// sandbox has outbound access to the internet by default", and the vendor
	// exposes allowInternetAccess (default true) plus allow/deny egress lists,
	// updatable on a running sandbox. This adapter forwards none of that
	// (create() below passes no network options), so control is "ignored":
	// the default is all a run may count on here.
	network: { egress: "open", control: "ignored" },
	// https://e2b.dev/docs/sandbox/snapshots (read 2026-08-01): a snapshot is
	// "a persistent point-in-time capture of a running sandbox, including both
	// its filesystem and memory state", and "The snapshot ID can be used
	// directly with Sandbox.create() to spawn a new sandbox from the
	// snapshot". So the vendor can fork; the mux contract has no snapshot or
	// fork operation, hence exposed: false.
	fork: { vendor: true, exposed: false },
	// getHost(port) returns a host for any port with no create-time port
	// declaration (SDK reference, read 2026-08-01), which is why publicUrl()
	// below is a pure string build. No E2B page states how many ports may be
	// reachable at once, so the ceilings stay unknown while the model itself
	// is provable.
	publicPorts: {
		model: "any-port",
		vendorMax: "unknown",
		muxMax: "unknown",
		fixed: null,
	},
	limits: {
		// Baseline measured by us, not published: docs/MUX-RESULTS.md finding
		// 10 (2026-07-31) recorded the E2B base sandbox as 478 MB and 2 vCPU,
		// which is why a Hermes install exhausts it. That figure is read as MiB
		// here (it has the shape of a `free -m` reading, and E2B's own pricing
		// page meters memory in MiB); the two readings differ by 22 MiB, well
		// inside the granularity anyone declares a memory floor at.
		baseVcpu: 2,
		baseMemoryMib: 478,
		// https://e2b.dev/docs/filesystem (read 2026-08-01): "The Hobby tier
		// sandboxes come with 10 GB of the free disk space and Pro tier
		// sandboxes come with 20 GB." Hobby is used because the plan behind a
		// key is unknown at routing time; 10 GB is 9.31 GiB, floored to 9. The
		// SDK exposes no disk option, so the baseline is also the ceiling.
		baseDiskGib: 9,
		maxDiskGib: 9,
		// https://e2b.dev/pricing (read 2026-08-01): vCPU tiers 1/2/4/6/8 with
		// 2 marked default, and memory "even value between 512 MiB and 8,192
		// MiB" -- both listed for Hobby and Pro alike.
		maxVcpu: 8,
		maxMemoryMib: 8192,
		// https://e2b.dev/docs/sandbox (read 2026-08-01): "Sandboxes can run
		// continuously for up to 24 hours (Pro) or 1 hour (Base)" -- Base here,
		// because the plan behind a key cannot be proven.
		maxRuntimeMs: 3_600_000,
		// https://e2b.dev/pricing (read 2026-08-01): Hobby is "Up to 20
		// concurrently running sandboxes" (Pro 100, extra concurrency
		// purchasable to 1,100).
		maxConcurrentSandboxes: 20,
		// "unknown", not "honored": create() below does forward cpuCount and
		// memoryMB, but docs/MUX-RESULTS.md finding 10 records that E2B ignored
		// the sizing request on this plan, so a larger machine is not something
		// routing may promise.
		resourceRequest: "unknown",
	},
};

/** Lazy, memoized SDK load; unused substrates never pay the import. */
let sdkModule: Promise<E2bModule> | null = null;

function loadSdk(): Promise<E2bModule> {
	const cached = sdkModule;
	if (cached) return cached;
	const pending = importE2b().catch(() => {
		// Clear the memo so a later call can retry once the dep exists.
		sdkModule = null;
		throw new MuxError("fatal", "e2b is not installed; npm i e2b", {
			substrate: "e2b",
		});
	});
	sdkModule = pending;
	return pending;
}

/**
 * E2B commands.run already executes through `/bin/bash -l -c <cmd>`.
 * Base64-encoding the payload and decoding it on the sandbox keeps
 * multiline scripts, heredocs and quotes intact (JSON.stringify-style
 * quoting turns real newlines into literal `\n` and breaks heredocs --
 * known postmortem bug). The base64 alphabet is quote-free, so the
 * single-quoted literal below can never be broken out of.
 */
function bashViaBase64(command: string): string {
	const b64 = Buffer.from(command, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

/** House taxonomy: 429 -> rate_limited, 5xx/network -> transient, 4xx -> fatal. */
function classify(error: unknown): MuxErrorKind {
	const name = error instanceof Error ? error.name : "";
	const message = error instanceof Error ? error.message : String(error);
	if (
		name === "RateLimitError" ||
		/\b429\b/.test(message) ||
		/rate ?limit/i.test(message)
	) {
		return "rate_limited";
	}
	if (
		name === "AuthenticationError" ||
		name === "SandboxNotFoundError" ||
		name === "NotFoundError" ||
		name === "InvalidArgumentError" ||
		name === "TemplateError" ||
		name === "NotEnoughSpaceError" ||
		/\b4\d\d\b/.test(message) ||
		/unauthorized|forbidden|not found|invalid api key/i.test(message)
	) {
		return "fatal";
	}
	// TimeoutError, 5xx, fetch/socket failures and anything else network-ish.
	return "transient";
}

function toMuxError(action: string, error: unknown): MuxError {
	if (error instanceof MuxError) return error;
	const base = error instanceof Error ? error.message : String(error);
	const name = error instanceof Error ? error.name : "";
	const hint =
		name === "AuthenticationError" || /\b40[13]\b|unauthorized|forbidden/i.test(base)
			? " (check E2B_API_KEY)"
			: "";
	return new MuxError(classify(error), `e2b ${action} failed: ${base}${hint}`, {
		substrate: "e2b",
	});
}

function isNotFound(error: unknown): boolean {
	const name = error instanceof Error ? error.name : "";
	const message = error instanceof Error ? error.message : String(error);
	return (
		name === "SandboxNotFoundError" ||
		name === "NotFoundError" ||
		/\b404\b/.test(message) ||
		/not found/i.test(message)
	);
}

/**
 * The SDK throws CommandExitError on non-zero exits with the full result
 * attached. Surface it as a normal ExecResult so callers can branch on
 * exitCode instead of catching vendor errors.
 */
function commandExit(
	error: unknown,
): { exitCode: number; stdout: string; stderr: string } | null {
	if (error && typeof error === "object" && "exitCode" in error) {
		const value = error as { exitCode?: unknown; stdout?: unknown; stderr?: unknown };
		if (typeof value.exitCode === "number") {
			return {
				exitCode: value.exitCode,
				stdout: typeof value.stdout === "string" ? value.stdout : "",
				stderr: typeof value.stderr === "string" ? value.stderr : "",
			};
		}
	}
	return null;
}

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

/** e2b Filesystem.write takes string | ArrayBuffer; copy out of any view. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

/**
 * Bridge for callback-style SDK streams (onStdout/onStderr, pty onData)
 * into pull-based AsyncGenerators. Producers never block: values land in
 * an array and a parked consumer is woken via a one-shot promise.
 */
type PushQueue<T> = {
	push(value: T): void;
	end(): void;
	fail(error: unknown): void;
	[Symbol.asyncIterator](): AsyncGenerator<T, void, void>;
};

function createPushQueue<T>(): PushQueue<T> {
	const buffered: T[] = [];
	let done = false;
	let failure: unknown;
	let hasFailure = false;
	let wake: (() => void) | null = null;

	function notify(): void {
		if (wake) {
			const resume = wake;
			wake = null;
			resume();
		}
	}

	return {
		push(value: T): void {
			if (done) return;
			buffered.push(value);
			notify();
		},
		end(): void {
			done = true;
			notify();
		},
		fail(error: unknown): void {
			if (done) return;
			failure = error;
			hasFailure = true;
			done = true;
			notify();
		},
		async *[Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
			try {
				for (;;) {
					if (buffered.length > 0) {
						yield buffered.shift() as T;
						continue;
					}
					if (hasFailure) throw failure;
					if (done) return;
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
				}
			} finally {
				// Consumer walked away (break/return): drop the buffer and
				// stop accepting producer pushes so nothing accumulates.
				done = true;
				buffered.length = 0;
			}
		},
	};
}

function createHandle(
	apiKey: string,
	id: string,
	initial: E2bSandbox | null,
): SandboxHandle {
	let cached: E2bSandbox | null = initial;
	let connecting: Promise<E2bSandbox> | null = null;

	/** Cached live connection; Sandbox.connect auto-resumes paused VMs. */
	function attach(): Promise<E2bSandbox> {
		if (cached) return Promise.resolve(cached);
		if (!connecting) {
			connecting = (async () => {
				try {
					const { Sandbox } = await loadSdk();
					const sandbox = await Sandbox.connect(id, { apiKey });
					cached = sandbox;
					return sandbox;
				} catch (error) {
					throw toMuxError("connect", error);
				} finally {
					connecting = null;
				}
			})();
		}
		return connecting;
	}

	/** Drop the cached connection after pause/kill or a transport error. */
	function invalidate(): void {
		cached = null;
	}

	async function exec(command: string, options?: ExecOptions): Promise<ExecResult> {
		const sandbox = await attach();
		const startedAt = Date.now();
		try {
			const result = await sandbox.commands.run(bashViaBase64(command), {
				timeoutMs: options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
				envs: options?.env,
				cwd: options?.cwd,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
				durationMs: Date.now() - startedAt,
			};
		} catch (error) {
			const exit = commandExit(error);
			if (exit) return { ...exit, durationMs: Date.now() - startedAt };
			invalidate();
			throw toMuxError("exec", error);
		}
	}

	async function* execStream(
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		if (options?.signal?.aborted) return;
		const sandbox = await attach();
		const queue = createPushQueue<ExecStreamEvent>();
		// End the stream promptly on abort; the SDK also aborts its RPC.
		const onAbort = (): void => queue.end();
		options?.signal?.addEventListener("abort", onAbort, { once: true });

		// Producer: foreground run with incremental callbacks. Runs
		// concurrently with the consumer loop below; every failure path
		// lands in the queue, so this floating promise can never reject.
		void (async () => {
			try {
				const result = await sandbox.commands.run(bashViaBase64(command), {
					timeoutMs: options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
					envs: options?.env,
					cwd: options?.cwd,
					signal: options?.signal,
					onStdout: (data: string) => queue.push({ type: "stdout", data }),
					onStderr: (data: string) => queue.push({ type: "stderr", data }),
				});
				queue.push({ type: "exit", exitCode: result.exitCode });
				queue.end();
			} catch (error) {
				if (options?.signal?.aborted) {
					queue.end();
					return;
				}
				const exit = commandExit(error);
				if (exit) {
					queue.push({ type: "exit", exitCode: exit.exitCode });
					queue.end();
					return;
				}
				invalidate();
				queue.fail(toMuxError("execStream", error));
			} finally {
				options?.signal?.removeEventListener("abort", onAbort);
			}
		})();

		yield* queue;
	}

	async function execBackground(command: string): Promise<void> {
		const sandbox = await attach();
		try {
			const handle = await sandbox.commands.run(bashViaBase64(command), {
				background: true,
			});
			// Fire-and-forget: stop consuming events; the command keeps running.
			await handle.disconnect();
		} catch (error) {
			invalidate();
			throw toMuxError("execBackground", error);
		}
	}

	async function openPty(options: PtyOptions = {}): Promise<PtyHandle> {
		// Named sessions want reattach-with-scrollback semantics, which the
		// native E2B pty does not have (pids are not durable names). Host
		// those in tmux on the sandbox instead.
		if (options.session) {
			return openTmuxPty({ exec, execBackground, execStream }, options);
		}

		const sandbox = await attach();
		const cols = options.cols ?? DEFAULT_PTY_COLS;
		const rows = options.rows ?? DEFAULT_PTY_ROWS;
		const queue = createPushQueue<Uint8Array>();
		const encoder = new TextEncoder();

		let pty: import("e2b").CommandHandle;
		try {
			pty = await sandbox.pty.create({
				cols,
				rows,
				envs: options.env,
				// The SDK defaults to a 60s deadline; 0 disables it, which is
				// what an interactive terminal needs.
				timeoutMs: 0,
				onData: (data: Uint8Array) => queue.push(data),
			});
		} catch (error) {
			invalidate();
			throw toMuxError("openPty", error);
		}

		const exited: Promise<number | null> = pty
			.wait()
			.then((result) => result.exitCode)
			.catch((error: unknown) => {
				const exit = commandExit(error);
				return exit ? exit.exitCode : null;
			})
			.finally(() => queue.end());

		if (options.command) {
			try {
				await sandbox.pty.sendInput(
					pty.pid,
					encoder.encode(`${options.command}\n`),
				);
			} catch (error) {
				await pty.kill().catch(() => {});
				queue.end();
				throw toMuxError("openPty command", error);
			}
		}

		return {
			output: queue,
			async write(data: string | Uint8Array): Promise<void> {
				const bytes = typeof data === "string" ? encoder.encode(data) : data;
				try {
					await sandbox.pty.sendInput(pty.pid, bytes);
				} catch (error) {
					throw toMuxError("pty write", error);
				}
			},
			async resize(nextCols: number, nextRows: number): Promise<void> {
				try {
					await sandbox.pty.resize(pty.pid, { cols: nextCols, rows: nextRows });
				} catch (error) {
					throw toMuxError("pty resize", error);
				}
			},
			exited,
			async close(): Promise<void> {
				try {
					await sandbox.pty.kill(pty.pid);
				} catch {
					// Already dead or sandbox gone; closing is best effort.
				}
				queue.end();
			},
		};
	}

	return {
		id,
		substrate: "e2b",
		capabilities: CAPABILITIES,
		exec,
		execStream,
		execBackground,
		openPty,
		async writeFile(path: string, content: string | Uint8Array): Promise<void> {
			const sandbox = await attach();
			try {
				const data = typeof content === "string" ? content : toArrayBuffer(content);
				await sandbox.files.write(path, data);
			} catch (error) {
				invalidate();
				throw toMuxError("writeFile", error);
			}
		},
		/**
		 * Reset E2B's auto-shutdown timer. Without this a long install
		 * outlives the sandbox ("killed or reached its end of life while
		 * the request was in flight", measured 2026-07-31).
		 */
		async keepAlive(ms: number): Promise<void> {
			const sandbox = await attach();
			try {
				await sandbox.setTimeout(ms);
			} catch (error) {
				invalidate();
				throw toMuxError("keepAlive", error);
			}
		},
		async publicUrl(port: number): Promise<string | null> {
			const sandbox = await attach();
			try {
				return `https://${sandbox.getHost(port)}`;
			} catch (error) {
				throw toMuxError("publicUrl", error);
			}
		},
		async state(): Promise<MachineState> {
			const { Sandbox } = await loadSdk();
			try {
				const info = await Sandbox.getInfo(id, { apiKey });
				return mapState(info.state);
			} catch (error) {
				if (isNotFound(error)) return "destroyed";
				throw toMuxError("state", error);
			}
		},
		async sleep(): Promise<void> {
			const { Sandbox } = await loadSdk();
			try {
				// Full memory snapshot: frozen processes thaw on wake, but all
				// SDK streams and PTY connections die here. Callers must
				// re-open PTYs / exec streams after wake().
				await Sandbox.pause(id, { apiKey });
			} catch (error) {
				throw toMuxError("sleep", error);
			} finally {
				invalidate();
			}
		},
		async wake(): Promise<void> {
			invalidate();
			// Sandbox.connect resumes a paused sandbox automatically.
			await attach();
		},
		async destroy(): Promise<void> {
			const { Sandbox } = await loadSdk();
			invalidate();
			try {
				await Sandbox.kill(id, { apiKey });
			} catch (error) {
				if (isNotFound(error)) return;
				throw toMuxError("destroy", error);
			}
		},
	};
}

function toSandboxInfo(item: E2bSandboxInfo): SandboxInfo {
	return {
		id: item.sandboxId,
		name: item.metadata?.name,
		state: mapState(item.state),
		substrate: "e2b",
		createdAt:
			item.startedAt instanceof Date ? item.startedAt.toISOString() : undefined,
	};
}

export function createE2bProvider(creds: { apiKey?: string }): SandboxProvider {
	const apiKey = creds.apiKey;

	function requireApiKey(): string {
		if (!apiKey) {
			throw new MuxError(
				"missing_credentials",
				"E2B provider is not credentialed; set E2B_API_KEY or providers.e2b.apiKey.",
				{ substrate: "e2b" },
			);
		}
		return apiKey;
	}

	return {
		kind: "e2b",
		capabilities: CAPABILITIES,
		ready(): { ok: boolean; missing: string[] } {
			return apiKey
				? { ok: true, missing: [] }
				: { ok: false, missing: ["E2B_API_KEY"] };
		},
		async create(options: CreateSandboxOptions = {}): Promise<SandboxHandle> {
			const key = requireApiKey();
			const { Sandbox } = await loadSdk();
			try {
				const sandbox = await Sandbox.create({
					apiKey: key,
					timeoutMs: options.timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS,
					envs: options.env,
					metadata: options.name ? { name: options.name } : undefined,
					// Both are optional upstream: omit rather than pass
					// undefined so E2B keeps its own defaults.
					...(options.template ? { template: options.template } : {}),
					...(options.resources?.vcpu
						? { cpuCount: options.resources.vcpu }
						: {}),
					...(options.resources?.memoryMib
						? { memoryMB: Math.round(options.resources.memoryMib) }
						: {}),
				});
				return createHandle(key, sandbox.sandboxId, sandbox);
			} catch (error) {
				throw toMuxError("create", error);
			}
		},
		async connect(id: string): Promise<SandboxHandle> {
			const key = requireApiKey();
			const { Sandbox } = await loadSdk();
			try {
				// Auto-resumes when the sandbox is paused.
				const sandbox = await Sandbox.connect(id, { apiKey: key });
				return createHandle(key, sandbox.sandboxId, sandbox);
			} catch (error) {
				throw toMuxError("connect", error);
			}
		},
		async list(): Promise<SandboxInfo[]> {
			const key = requireApiKey();
			const { Sandbox } = await loadSdk();
			try {
				const paginator = Sandbox.list({
					apiKey: key,
					query: { state: ["running", "paused"] },
				});
				const infos: SandboxInfo[] = [];
				while (paginator.hasNext) {
					const page = await paginator.nextItems();
					for (const item of page) infos.push(toSandboxInfo(item));
				}
				return infos;
			} catch (error) {
				throw toMuxError("list", error);
			}
		},
	};
}

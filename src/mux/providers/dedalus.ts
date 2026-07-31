/**
 * Dedalus substrate adapter (raw REST, no SDK).
 *
 * Mirrors the battle-tested dashboard provider at
 * web/lib/providers/dedalus.ts: same endpoint paths, same adaptive exec
 * polling (60ms x1.6 backoff capped at 1s -- this took exec p50 from
 * 1.57s to 866ms), same wake/sleep quirks (wake and sleep are
 * HMAC-gated "internal lifecycle routes" on the controlplane; wake goes
 * through a no-op execution instead, sleep swallows the 401), and the
 * same preview API for public URLs.
 *
 * Streaming: the Dedalus execution API is strictly batch -- output is
 * only readable after the execution completes -- so streamingExec is
 * false. execStream still exists (the contract requires it) as a
 * degraded stream, see the comment on that method. Interactive PTYs go
 * through tmux-over-exec (../pty/tmux.js); its `stdbuf -o0 tail -c +N
 * -f <log>` output loop is special-cased into a 400ms wc -c + dd byte
 * poll, exactly what web/lib/dashboard/exec-stream.ts does for Dedalus.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

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
	type PtyOptions,
	type SandboxCapabilities,
	type SandboxHandle,
	type SandboxInfo,
	type SandboxProvider,
} from "../types.js";

const DEFAULT_BASE_URL = "https://dcs.dedaluslabs.ai";

// Adaptive exec polling. The execution status endpoint is cheap, so we
// poll quickly at first (a no-op finishes in well under a second) and
// back off toward POLL_MAX_MS for long-running commands. A fixed 1s
// interval added a full second of latency to every exec round-trip.
const POLL_INITIAL_MS = 60;
const POLL_MAX_MS = 1000;
const POLL_BACKOFF = 1.6;

const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_TIMEOUT_MS = 300_000;
const CREATE_READY_TIMEOUT_MS = 240_000;

// Log-tail polling cadence for the degraded PTY output stream; matches
// the Dedalus fallback in web/lib/dashboard/exec-stream.ts.
const TAIL_POLL_MS = 400;
const READ_CHUNK_BYTES = 8_192;
const WRITE_CHUNK_BYTES = 131_072;

// The exact tail command emitted by openTmuxPty's output loop.
const TAIL_COMMAND_RE = /^stdbuf -o0 tail -c \+(\d+) -f (\S+)$/;

const SCOPE = { substrate: "dedalus" } as const;

const CAPABILITIES: SandboxCapabilities = {
	pty: "tmux",
	persistence: "always-on",
	reattach: true,
	publicUrl: true,
	streamingExec: false,
};

// Machine shape provisioned when the router asks for a sandbox; the
// public provision API takes only sizing (no name/env/idle knobs).
const DEFAULT_SPEC = { vcpu: 1, memory_mib: 2048, storage_gib: 10 };

type RawMachine = {
	machine_id: string;
	vcpu: number;
	memory_mib: number;
	storage_gib: number;
	created_at: string;
	configured_at?: string | null;
	desired_state: string;
	status: {
		phase: string;
		revision?: string | number;
		reason?: string | null;
		last_error?: string | null;
	};
};

type ExecRaw = {
	execution_id: string;
	status: "queued" | "running" | "succeeded" | "failed" | "expired" | "cancelled";
	exit_code?: number | null;
};

type ExecOutputRaw = {
	stdout?: string;
	stderr?: string;
};

type RawExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
	durationMs: number;
};

type RunExecutionOptions = {
	timeoutMs: number;
	env?: Record<string, string>;
	cwd?: string;
	signal?: AbortSignal;
};

const TERMINAL_EXEC_STATUS = new Set<ExecRaw["status"]>([
	"succeeded",
	"failed",
	"expired",
	"cancelled",
]);

const BENIGN_REASONS = new Set([
	"DesiredStateReached",
	"Machine already reached desired state",
]);

function mapPhase(phase: string): MachineState {
	switch (phase) {
		case "running":
			return "ready";
		case "starting":
		case "wake_pending":
		case "placement_pending":
		case "accepted":
			return "starting";
		case "sleeping":
		case "sleep_pending":
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

function lastError(raw: RawMachine): string | null {
	const value = raw.status.last_error ?? raw.status.reason ?? null;
	if (!value) return null;
	if (BENIGN_REASONS.has(value)) return null;
	return value;
}

/** House taxonomy: 429 -> rate_limited, 5xx -> transient, other 4xx -> fatal. */
function kindForStatus(status: number): MuxErrorKind {
	if (status === 429) return "rate_limited";
	if (status >= 500) return "transient";
	return "fatal";
}

function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Arbitrary shell goes over the wire base64-encoded and is decoded on
 * the sandbox (proven pattern from web/lib/providers/e2b.ts
 * bashViaBase64): multiline scripts, heredocs and quoting all survive
 * the JSON command array untouched.
 */
function bashViaBase64(script: string): string {
	const b64 = Buffer.from(script, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

/** Prepend env exports and cwd to a command; single-line guards only. */
function buildScript(
	command: string,
	env?: Record<string, string>,
	cwd?: string,
): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(env ?? {})) {
		lines.push(`export ${key}=${shq(value)}`);
	}
	if (cwd) lines.push(`cd ${shq(cwd)} || exit 97`);
	lines.push(command);
	return lines.join("\n");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.resolve();
	return new Promise((resolve) => {
		const timer = setTimeout(finish, ms);
		function finish(): void {
			clearTimeout(timer);
			signal?.removeEventListener("abort", finish);
			resolve();
		}
		signal?.addEventListener("abort", finish, { once: true });
	});
}

function abortError(): MuxError {
	return new MuxError("transient", "dedalus exec aborted by caller signal", SCOPE);
}

/** Thin REST client; every response maps onto the MuxError taxonomy. */
class DedalusRest {
	private readonly apiKey: string;
	private readonly baseUrl: string;

	constructor(apiKey: string, baseUrl: string) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl.trim().replace(/\/$/, "");
	}

	/**
	 * Dedalus auth: send BOTH `Authorization: Bearer <key>` (used by the
	 * wake/sleep internal-route signature check) AND `X-API-Key` for
	 * compatibility with older endpoints -- the dashboard reliably got
	 * 401 "missing internal route signature" with X-API-Key alone.
	 * `Idempotency-Key` goes on every mutating request so retried
	 * operations do not double-spend.
	 */
	private async request(path: string, init?: RequestInit): Promise<Response> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
			"X-API-Key": this.apiKey,
			"Content-Type": "application/json",
			...(init?.headers as Record<string, string> | undefined),
		};
		const method = (init?.method ?? "GET").toUpperCase();
		if (method !== "GET" && method !== "HEAD" && !headers["Idempotency-Key"]) {
			headers["Idempotency-Key"] = randomUUID();
		}
		try {
			return await fetch(`${this.baseUrl}${path}`, { ...init, headers });
		} catch (error) {
			throw new MuxError(
				"transient",
				`dedalus network error on ${method} ${path}: ${(error as Error).message}`,
				SCOPE,
			);
		}
	}

	private async fail(response: Response, context: string): Promise<never> {
		const body = (await response.text().catch(() => "")).slice(0, 300);
		throw new MuxError(
			kindForStatus(response.status),
			`dedalus ${context} ${response.status}: ${body}`,
			SCOPE,
		);
	}

	async getRaw(machineId: string): Promise<RawMachine> {
		const response = await this.request(`/v1/machines/${machineId}`);
		if (!response.ok) await this.fail(response, `get machine ${machineId}`);
		const text = await response.text();
		if (!text) {
			throw new MuxError(
				"transient",
				`dedalus ${response.status}: empty response body for machine ${machineId}`,
				SCOPE,
			);
		}
		try {
			return JSON.parse(text) as RawMachine;
		} catch {
			throw new MuxError(
				"transient",
				`dedalus ${response.status}: malformed JSON: ${text.slice(0, 200)}`,
				SCOPE,
			);
		}
	}

	async getRawOrNull(machineId: string): Promise<RawMachine | null> {
		const response = await this.request(`/v1/machines/${machineId}`);
		if (response.status === 404) return null;
		if (!response.ok) await this.fail(response, `get machine ${machineId}`);
		return (await response.json()) as RawMachine;
	}

	async provision(): Promise<RawMachine> {
		const response = await this.request("/v1/machines", {
			method: "POST",
			body: JSON.stringify(DEFAULT_SPEC),
		});
		if (!response.ok) await this.fail(response, "provision");
		return (await response.json()) as RawMachine;
	}

	async listMachines(): Promise<RawMachine[]> {
		const response = await this.request("/v1/machines");
		if (!response.ok) await this.fail(response, "list machines");
		const body = (await response.json().catch(() => null)) as unknown;
		if (Array.isArray(body)) return body as RawMachine[];
		if (body && typeof body === "object") {
			const record = body as Record<string, unknown>;
			for (const key of ["items", "machines", "data"]) {
				const value = record[key];
				if (Array.isArray(value)) return value as RawMachine[];
			}
		}
		return [];
	}

	async createExecution(
		machineId: string,
		argv: string[],
		timeoutMs: number,
	): Promise<ExecRaw> {
		const response = await this.request(`/v1/machines/${machineId}/executions`, {
			method: "POST",
			body: JSON.stringify({ command: argv, timeout_ms: timeoutMs }),
		});
		if (!response.ok) await this.fail(response, "exec create");
		return (await response.json()) as ExecRaw;
	}

	/**
	 * Submit an execution, poll it to a terminal status with adaptive
	 * backoff, then fetch the output document. Output is NOT trimmed
	 * here: the tail poller depends on exact bytes for its offset math;
	 * the public exec() trims for parity with the dashboard provider.
	 */
	async runExecution(
		machineId: string,
		command: string,
		options: RunExecutionOptions,
	): Promise<RawExecResult> {
		const startedAt = Date.now();
		const argv = [
			"/bin/bash",
			"-lc",
			bashViaBase64(buildScript(command, options.env, options.cwd)),
		];
		const created = await this.createExecution(machineId, argv, options.timeoutMs);

		const deadline = Date.now() + options.timeoutMs + 5_000;
		let current = created;
		let pollInterval = POLL_INITIAL_MS;
		while (!TERMINAL_EXEC_STATUS.has(current.status)) {
			if (options.signal?.aborted) throw abortError();
			if (Date.now() > deadline) {
				throw new MuxError(
					"transient",
					`dedalus exec poll timed out after ${options.timeoutMs}ms: ${command.slice(0, 80)}`,
					SCOPE,
				);
			}
			await delay(pollInterval, options.signal);
			pollInterval = Math.min(POLL_MAX_MS, Math.round(pollInterval * POLL_BACKOFF));
			const poll = await this.request(
				`/v1/machines/${machineId}/executions/${created.execution_id}`,
			);
			if (!poll.ok) await this.fail(poll, "exec poll");
			current = (await poll.json()) as ExecRaw;
		}

		const out = await this.request(
			`/v1/machines/${machineId}/executions/${created.execution_id}/output`,
		);
		const output: ExecOutputRaw = out.ok
			? ((await out.json().catch(() => ({}))) as ExecOutputRaw)
			: {};
		const exitCode = current.exit_code ?? (current.status === "succeeded" ? 0 : 1);
		return {
			stdout: output.stdout ?? "",
			stderr: output.stderr ?? "",
			exitCode,
			durationMs: Date.now() - startedAt,
		};
	}

	/**
	 * Fire-and-forget: submit the execution and return once accepted.
	 * Interactive terminal input only needs Dedalus to accept the tmux
	 * send-keys command; waiting for status and output added several
	 * provider round-trips to every input batch.
	 */
	/**
	 * Fire-and-forget. The payload is handed to setsid/nohup so the
	 * execution Dedalus tracks ends as soon as the child is launched: the
	 * server-side timeout applies to that launch, not to the work. Without
	 * this a detached install (openclaw ~20-30s, hermes minutes) was cut
	 * off at the 30s exec timeout and its sentinel never appeared.
	 */
	async execBackground(
		machineId: string,
		command: string,
		env?: Record<string, string>,
	): Promise<void> {
		const script = buildScript(command, env);
		const launcher =
			`f=$(mktemp /tmp/am-mux-bg.XXXXXX) && printf '%s' '${Buffer.from(script, "utf8").toString("base64")}' | base64 -d > "$f" && ` +
			`( (if command -v setsid >/dev/null 2>&1; then setsid nohup bash --noprofile --norc "$f" >/dev/null 2>&1 </dev/null; else nohup bash --noprofile --norc "$f" >/dev/null 2>&1 </dev/null; fi; rm -f "$f") & )`;
		const argv = ["/bin/bash", "-lc", bashViaBase64(launcher)];
		await this.createExecution(machineId, argv, DEFAULT_EXEC_TIMEOUT_MS);
	}

	/**
	 * Wake quirk: POST /v1/machines/<id>/wake (like /sleep, /admit,
	 * /purge) is an INTERNAL LIFECYCLE ROUTE guarded by HMAC signing
	 * middleware on the controlplane; public API keys reliably 401 with
	 * "missing internal route signature". The supported public path is
	 * to submit ANY execution against the sleeping machine -- the
	 * execution scheduler internally calls the signed admit/wake gate
	 * and the machine transitions sleeping -> wake_pending -> starting
	 * -> running. We submit a fast no-op and do not wait for it.
	 */
	async wake(machineId: string): Promise<void> {
		const raw = await this.getRaw(machineId);
		const state = mapPhase(raw.status.phase);
		if (state === "ready" || state === "starting") return;
		if (state !== "sleeping") {
			throw new MuxError(
				"fatal",
				`dedalus cannot wake machine in phase '${raw.status.phase}'; expected 'sleeping'`,
				SCOPE,
			);
		}
		const exec = await this.request(`/v1/machines/${machineId}/executions`, {
			method: "POST",
			body: JSON.stringify({ command: ["/bin/true"], timeout_ms: 5000 }),
		});
		if (!exec.ok) await this.fail(exec, "wake-via-exec");
	}

	/**
	 * Sleep quirk: POST /sleep is HMAC-gated on the dev fleet -- public
	 * keys get 401 "missing internal route signature". We still attempt
	 * the call (older deployments accept it) but swallow that specific
	 * 401 instead of throwing: every Dedalus machine has
	 * autosleep_seconds (default 300s), so "sleep" degrades to "sleep
	 * sooner" rather than "sleep at all".
	 */
	async sleep(machineId: string): Promise<void> {
		const raw = await this.getRaw(machineId);
		if (raw.status.phase !== "running") return;
		const revision = raw.status.revision;
		if (revision === undefined || revision === null) {
			throw new MuxError(
				"fatal",
				"dedalus machine has no revision token; cannot submit sleep",
				SCOPE,
			);
		}
		const response = await this.request(`/v1/machines/${machineId}/sleep`, {
			method: "POST",
			headers: { "If-Match": String(revision) },
		});
		if (!response.ok) {
			const text = (await response.text().catch(() => "")).slice(0, 400);
			if (response.status === 401 && text.includes("internal route signature")) {
				console.warn(
					`[dedalus] sleep blocked by HMAC gate; relying on autosleep (${machineId})`,
				);
				return;
			}
			throw new MuxError(
				kindForStatus(response.status),
				`dedalus sleep ${response.status}: ${text.slice(0, 200)}`,
				SCOPE,
			);
		}
	}

	async destroy(machineId: string): Promise<void> {
		const raw = await this.getRawOrNull(machineId);
		if (!raw || raw.status.phase === "destroyed") return;
		const revision = raw.status.revision;
		if (revision === undefined || revision === null) return;
		const response = await this.request(`/v1/machines/${machineId}`, {
			method: "DELETE",
			headers: { "If-Match": String(revision) },
		});
		if (!response.ok && response.status !== 404) {
			await this.fail(response, "destroy");
		}
	}

	/**
	 * Create or reuse a Dedalus preview URL for a port. Preview URLs are
	 * platform-managed and survive sleep/wake (unlike cloudflared quick
	 * tunnels, which die on sleep). Returns null when previews are not
	 * configured for the org.
	 */
	async createPreview(machineId: string, port: number): Promise<string | null> {
		try {
			const list = await this.request(`/v1/machines/${machineId}/previews`);
			if (list.ok) {
				const body = (await list.json()) as {
					items?: Array<{ port: number; status: string; url: string }>;
				};
				const match = body.items?.find(
					(preview) => preview.port === port && preview.status === "ready",
				);
				if (match?.url) return match.url;
			}
			const create = await this.request(`/v1/machines/${machineId}/previews`, {
				method: "POST",
				body: JSON.stringify({ port, protocol: "http", visibility: "public" }),
			});
			if (create.ok) {
				const body = (await create.json()) as { url?: string };
				if (body.url) return body.url;
			}
		} catch {
			// Previews unavailable for this org; caller can fall back.
		}
		return null;
	}

	/** Poll a freshly provisioned machine until it can run executions. */
	async waitUntilReady(machineId: string, timeoutMs: number): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		let interval = 500;
		for (;;) {
			const raw = await this.getRaw(machineId);
			const state = mapPhase(raw.status.phase);
			if (state === "ready") return;
			if (state === "sleeping") await this.wake(machineId);
			if (state === "error") {
				throw new MuxError(
					"transient",
					`dedalus machine ${machineId} failed while starting: ${lastError(raw) ?? raw.status.phase}`,
					SCOPE,
				);
			}
			if (state === "destroyed" || state === "destroying") {
				throw new MuxError(
					"fatal",
					`dedalus machine ${machineId} is ${state}; cannot use it`,
					SCOPE,
				);
			}
			if (Date.now() > deadline) {
				throw new MuxError(
					"transient",
					`dedalus machine ${machineId} did not reach running within ${timeoutMs}ms (phase ${raw.status.phase})`,
					SCOPE,
				);
			}
			await delay(interval);
			interval = Math.min(3_000, Math.round(interval * 1.5));
		}
	}
}

/**
 * Degraded PTY output stream: poll a log file for new bytes every
 * TAIL_POLL_MS using `wc -c` (size probe) plus `dd bs=1 skip=<offset>`
 * (byte-range read), draining full chunks back-to-back within a tick.
 * This is the exact Dedalus fallback the dashboard terminal ships in
 * web/lib/dashboard/exec-stream.ts. Raw (untrimmed) exec output keeps
 * the offset arithmetic byte-accurate.
 */
async function* tailPollStream(
	api: DedalusRest,
	machineId: string,
	logPath: string,
	startOffset: number,
	options: ExecStreamOptions,
): AsyncGenerator<ExecStreamEvent, void, void> {
	const signal = options.signal;
	const deadline =
		options.timeoutMs !== undefined
			? Date.now() + options.timeoutMs
			: Number.POSITIVE_INFINITY;
	let offset = startOffset;
	try {
		while (!signal?.aborted && Date.now() < deadline) {
			const probe = await api.runExecution(
				machineId,
				`[ -f ${logPath} ] && wc -c < ${logPath} || echo 0`,
				{ timeoutMs: 10_000, signal },
			);
			const size = Number.parseInt(probe.stdout.trim(), 10) || 0;
			while (size > offset && !signal?.aborted) {
				const read = await api.runExecution(
					machineId,
					`[ -f ${logPath} ] || exit 0; dd if=${logPath} bs=1 skip=${offset} count=${READ_CHUNK_BYTES} 2>/dev/null`,
					{ timeoutMs: 15_000, signal },
				);
				const data = read.stdout;
				if (!data) break;
				const bytes = Buffer.byteLength(data, "utf8");
				offset += bytes;
				yield { type: "stdout", data };
				if (bytes < READ_CHUNK_BYTES) break;
			}
			await delay(TAIL_POLL_MS, signal);
		}
	} catch (error) {
		// Aborting mid-poll is normal PTY teardown, not a failure.
		if (signal?.aborted) return;
		throw error;
	}
}

function createHandle(
	api: DedalusRest,
	machineId: string,
	defaultEnv: Record<string, string>,
): SandboxHandle {
	const exec = async (
		command: string,
		options: ExecOptions = {},
	): Promise<ExecResult> => {
		const raw = await api.runExecution(machineId, command, {
			timeoutMs: options.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
			env: { ...defaultEnv, ...options.env },
			cwd: options.cwd,
		});
		return {
			stdout: raw.stdout.trim(),
			stderr: raw.stderr.trim(),
			exitCode: raw.exitCode,
			durationMs: raw.durationMs,
		};
	};

	const handle: SandboxHandle = {
		id: machineId,
		substrate: "dedalus",
		capabilities: CAPABILITIES,

		exec,

		/**
		 * DEGRADED STREAM. The Dedalus execution API only exposes output
		 * after an execution reaches a terminal status, so true
		 * incremental stdout/stderr is impossible (capabilities.
		 * streamingExec is false). Two behaviors:
		 *
		 *   1. Log tails (`stdbuf -o0 tail -c +N -f <file>`, exactly what
		 *      openTmuxPty's output loop runs) are re-implemented as a
		 *      400ms wc -c + dd byte poll on the file, so interactive
		 *      tmux PTYs stay live-ish on Dedalus.
		 *   2. Everything else runs as one batch exec(): the full stdout
		 *      arrives as a single event once the command exits, then the
		 *      stderr, then the exit event. Consumers see correct data,
		 *      just without incremental delivery.
		 *
		 * An AbortSignal abort ends the stream quietly (no exit event),
		 * matching how the tmux PTY tears its output loop down.
		 */
		async *execStream(
			command: string,
			options: ExecStreamOptions = {},
		): AsyncGenerator<ExecStreamEvent, void, void> {
			const tail = TAIL_COMMAND_RE.exec(command.trim());
			if (tail) {
				// tail -c +N starts at byte N (1-based): N-1 bytes are skipped.
				const startOffset = Math.max(0, Number.parseInt(tail[1], 10) - 1);
				yield* tailPollStream(api, machineId, tail[2], startOffset, options);
				return;
			}
			try {
				const raw = await api.runExecution(machineId, command, {
					timeoutMs: options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
					env: { ...defaultEnv, ...options.env },
					cwd: options.cwd,
					signal: options.signal,
				});
				if (raw.stdout) yield { type: "stdout", data: raw.stdout };
				if (raw.stderr) yield { type: "stderr", data: raw.stderr };
				yield { type: "exit", exitCode: raw.exitCode };
			} catch (error) {
				if (options.signal?.aborted) return;
				throw error;
			}
		},

		async execBackground(command: string): Promise<void> {
			await api.execBackground(machineId, command, defaultEnv);
		},

		async openPty(options: PtyOptions = {}) {
			return openTmuxPty(handle, options);
		},

		async writeFile(path: string, content: string | Uint8Array): Promise<void> {
			const bytes =
				typeof content === "string"
					? Buffer.from(content, "utf8")
					: Buffer.from(content.buffer, content.byteOffset, content.byteLength);
			for (let i = 0; i === 0 || i < bytes.length; i += WRITE_CHUNK_BYTES) {
				const b64 = bytes.subarray(i, i + WRITE_CHUNK_BYTES).toString("base64");
				const redirect = i === 0 ? ">" : ">>";
				const mkdir = i === 0 ? `mkdir -p "$(dirname ${shq(path)})" && ` : "";
				const result = await exec(
					`${mkdir}printf '%s' '${b64}' | base64 -d ${redirect} ${shq(path)}`,
					{ timeoutMs: 60_000 },
				);
				if (result.exitCode !== 0) {
					throw new MuxError(
						"transient",
						`dedalus writeFile failed for ${path} (exit ${result.exitCode}): ${result.stderr.slice(0, 200)}`,
						SCOPE,
					);
				}
			}
		},

		async publicUrl(port: number): Promise<string | null> {
			return api.createPreview(machineId, port);
		},

		async state(): Promise<MachineState> {
			const raw = await api.getRawOrNull(machineId);
			return raw ? mapPhase(raw.status.phase) : "destroyed";
		},

		async sleep(): Promise<void> {
			await api.sleep(machineId);
		},

		async wake(): Promise<void> {
			await api.wake(machineId);
		},

		async destroy(): Promise<void> {
			await api.destroy(machineId);
		},
	};
	return handle;
}

/**
 * Dedalus SandboxProvider. Never throws for missing credentials at
 * construction; ready() reports them and methods fail closed with
 * missing_credentials if invoked anyway.
 */
export function createDedalusProvider(creds: {
	apiKey?: string;
	baseUrl?: string;
}): SandboxProvider {
	const apiKey = creds.apiKey?.trim() || undefined;
	const baseUrl = creds.baseUrl?.trim() || DEFAULT_BASE_URL;
	let api: DedalusRest | null = null;

	const requireApi = (): DedalusRest => {
		if (!apiKey) {
			throw new MuxError(
				"missing_credentials",
				"Dedalus API key is missing (providers.dedalus.apiKey / DEDALUS_API_KEY).",
				SCOPE,
			);
		}
		if (!api) api = new DedalusRest(apiKey, baseUrl);
		return api;
	};

	return {
		kind: "dedalus",
		capabilities: CAPABILITIES,

		ready() {
			return apiKey
				? { ok: true, missing: [] }
				: { ok: false, missing: ["DEDALUS_API_KEY"] };
		},

		async create(options: CreateSandboxOptions = {}): Promise<SandboxHandle> {
			const rest = requireApi();
			const raw = await rest.provision();
			// Executions submitted while the machine is placing/starting
			// can outwait the router's short install probes, so block
			// until the machine is actually running.
			await rest.waitUntilReady(raw.machine_id, CREATE_READY_TIMEOUT_MS);
			// The public provision API has no name/env/idle-timeout
			// fields; env is applied per-exec by the handle instead, and
			// the router's state file owns the name -> id mapping.
			return createHandle(rest, raw.machine_id, options.env ?? {});
		},

		async connect(id: string): Promise<SandboxHandle> {
			const rest = requireApi();
			const raw = await rest.getRawOrNull(id);
			if (!raw) {
				throw new MuxError("fatal", `dedalus machine ${id} not found`, SCOPE);
			}
			if (mapPhase(raw.status.phase) === "destroyed") {
				throw new MuxError("fatal", `dedalus machine ${id} is destroyed`, SCOPE);
			}
			// Sleeping machines wake automatically on the first execution.
			return createHandle(rest, raw.machine_id, {});
		},

		async list(): Promise<SandboxInfo[]> {
			const rest = requireApi();
			const machines = await rest.listMachines();
			return machines.map((raw) => ({
				id: raw.machine_id,
				state: mapPhase(raw.status.phase),
				substrate: "dedalus" as const,
				createdAt: raw.created_at,
			}));
		},
	};
}

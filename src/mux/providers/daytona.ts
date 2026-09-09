/** Daytona's optional SDK, kept lazy so other providers do not load it.
 *
 * Stop/start preserves the filesystem, not processes or RAM. Status reads and
 * connect only fetch the record; waking is an explicit handle.wake() operation.
 * Official SDK 0.211.2 / docs read 2026-09-09:
 * https://www.daytona.io/docs/en/typescript-sdk/daytona/
 * https://www.daytona.io/docs/en/typescript-sdk/sandbox/
 * https://www.daytona.io/docs/en/typescript-sdk/process/
 */
import { randomUUID } from "node:crypto";
import type { Daytona, DaytonaConfig, Sandbox } from "@daytona/sdk";
import {
	MuxError,
	type CreateSandboxOptions, type ExecOptions, type ExecResult,
	type ExecStreamEvent, type ExecStreamOptions, type MachineState,
	type PtyHandle, type PtyOptions, type SandboxCapabilities,
	type SandboxDescription, type SandboxHandle, type SandboxProvider,
} from "../types.js";

export type DaytonaCredentials = { apiKey?: string; apiUrl?: string; target?: string };
/** Real SDK boundary, injectable without constructing a network client in tests. */
export type DaytonaClient = Pick<Daytona, "create" | "get" | "list">;
export type DaytonaClientFactory = (config: DaytonaConfig) => DaytonaClient | Promise<DaytonaClient>;
const SCOPE = { substrate: "daytona" as const };
const REQUEST_MS = 30_000;
const LIFECYCLE_SECONDS = 120;
const DEFAULT_EXEC_MS = 120_000;
const CREATE_LABEL = "agent-machines-create-id";
// Read from the live vendor default snapshot, then verified with 2GiB image
// creation on 2026-09-09. Pin the image rather than mutable latest/lts tags.
const DEFAULT_IMAGE = "daytonaio/sandbox:0.8.0";
/** URL-only consumers must request another URL after expiry; sandbox stays private. */
export const DAYTONA_PREVIEW_TTL_SECONDS = 300;

const CAPABILITIES: SandboxCapabilities = {
	pty: "native", persistence: "filesystem-snapshot", reattach: true,
	publicUrl: true, streamingExec: true, detachedWork: "reliable",
	region: { default: "us", available: "unknown", select: "honored" },
	gpu: { available: "unknown", models: "unknown", request: "unsupported" },
	network: { egress: "open", control: "ignored" },
	fork: { vendor: true, exposed: false },
	publicPorts: { model: "any-port", vendorMax: "unknown", muxMax: "unknown", fixed: null },
	limits: {
		// Snapshot-dependent, so route decisions cannot infer the live allocation.
		baseVcpu: "unknown", baseMemoryMib: "unknown", baseDiskGib: "unknown",
		maxVcpu: "unknown", maxMemoryMib: "unknown", maxDiskGib: "unknown",
		maxRuntimeMs: "unknown", maxConcurrentSandboxes: "unknown",
		// Image+resources create, then verified against refreshData(). The live
		// resize endpoint returned 404 despite the SDK documenting it.
		resourceRequest: "honored",
	},
};

function state(raw: string | undefined): MachineState {
	switch (raw) {
		case "started": return "ready";
		case "stopped": case "paused": case "archived": return "sleeping";
		case "destroyed": return "destroyed";
		case "destroying": return "destroying";
		case "error": case "build_failed": return "error";
		case "creating": case "pending_build": case "building_snapshot":
		case "starting": case "restoring": case "resizing":
		case "stopping": case "pausing": case "archiving": return "starting";
		default: return "unknown";
	}
}
function statusCode(error: unknown): number | undefined {
	return error && typeof error === "object" && "statusCode" in error
		? Number(error.statusCode) : undefined;
}
function missing(error: unknown): boolean {
	return statusCode(error) === 404 && !(error instanceof Error && /^Cannot (?:GET|POST|DELETE|PATCH|PUT) /i.test(error.message));
}
function mapped(error: unknown, action: string): MuxError {
	if (error instanceof MuxError) return error;
	const code = statusCode(error);
	const message = error instanceof Error ? error.message : String(error);
	const kind = code === 429 ? "rate_limited"
		: (code !== undefined && code >= 500) || code === 408 || /timeout|timed out|ECONN|fetch failed/i.test(message)
			? "transient" : "fatal";
	return new MuxError(kind, `Daytona ${action} failed: ${message}`, SCOPE);
}
function quote(value: string): string { return `'${value.replace(/'/g, `'\\''`)}'`; }
function seconds(timeoutMs = DEFAULT_EXEC_MS): number {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new MuxError("fatal", "Daytona execution timeout must be positive and finite", SCOPE);
	return Math.max(1, Math.ceil(timeoutMs / 1000));
}
function commandLine(command: string, options: ExecOptions, timeout: number): string {
	const env = Object.entries(options.env ?? {}).map(([key, value]) => {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new MuxError("fatal", "Invalid command environment variable name", SCOPE);
		return quote(`${key}=${value}`);
	}).join(" ");
	const script = `${options.cwd ? `cd -- ${quote(options.cwd)} || exit;\n` : ""}${command}`;
	// Session execution's timeout bounds HTTP only. GNU timeout independently
	// terminates the guest command, including when the request disconnects.
	// Do not exec-replace Daytona's persistent session shell: the daemon needs
	// that shell to observe the command exit and complete its HTTP response.
	return `bash -lc ${quote(`command -v timeout >/dev/null 2>&1 || { echo 'GNU timeout is required' >&2; exit 127; }; exec timeout --signal=TERM --kill-after=5s ${timeout}s env ${env} bash -lc ${quote(script)}`)}`;
}
function description(sandbox: Sandbox): SandboxDescription {
	const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
	return {
		state: state(sandbox.state), rawPhase: sandbox.state ?? null,
		...(sandbox.createdAt ? { createdAt: sandbox.createdAt } : {}),
		...(sandbox.autoDestroyAt ? { endAt: sandbox.autoDestroyAt } : {}),
		...(sandbox.errorReason ? { lastError: sandbox.errorReason } : {}),
		resources: {
			...(positive(sandbox.cpu) ? { vcpu: sandbox.cpu } : {}),
			...(positive(sandbox.memory) ? { memoryMib: sandbox.memory * 1024 } : {}),
			...(positive(sandbox.disk) ? { diskGib: sandbox.disk } : {}),
		},
	};
}

async function verifyAllocation(sandbox: Sandbox, resources: CreateSandboxOptions["resources"]): Promise<void> {
	if (!resources || !Object.values(resources).some((value) => value !== undefined)) return;
	const requested = { cpu: resources.vcpu, memory: resources.memoryMib === undefined ? undefined : resources.memoryMib / 1024, disk: resources.diskGib };
	await sandbox.refreshData();
	for (const [axis, value] of Object.entries(requested)) {
		if (value !== undefined && sandbox[axis as "cpu" | "memory" | "disk"] !== value) {
			throw new Error(`Daytona did not apply requested ${axis}; allocation verification failed`);
		}
	}
}

async function recoverCreatedSandbox(client: DaytonaClient, creationId: string): Promise<Sandbox> {
	// SDK create waits for startup before returning its handle. If that wait
	// fails, recover by a random label assigned in our POST, never by a user's
	// name (which may conflict with an existing Worker). Do not trust filtering
	// alone, and stop at the second result instead of scanning the account.
	let found: Sandbox | undefined;
	for await (const candidate of client.list({ labels: { [CREATE_LABEL]: creationId }, limit: 2 })) {
		if (found) throw new Error(`Multiple records matched the creation label (${found.id}, ${candidate.id})`);
		if (!candidate.id || candidate.labels?.[CREATE_LABEL] !== creationId) throw new Error("Creation lookup returned an unverified record");
		found = candidate;
	}
	if (!found) throw new Error("No matching record is visible yet; the POST may still complete");
	const current = await client.get(found.id);
	if (current.id !== found.id || current.labels?.[CREATE_LABEL] !== creationId) throw new Error(`Creation ownership changed for sandbox ${found.id}`);
	return current;
}

async function boundedCreationLookup(client: DaytonaClient, creationId: string): Promise<Sandbox> {
	// Only reads happen in recoverCreatedSandbox. If an SDK request completes
	// after this deadline, the abandoned promise cannot perform a late delete.
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			recoverCreatedSandbox(client, creationId),
			new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Creation lookup timed out")), REQUEST_MS); }),
		]);
	} finally { clearTimeout(timer); }
}

export function createDaytonaProvider(credentials: DaytonaCredentials, factory?: DaytonaClientFactory): SandboxProvider {
	const capabilities: SandboxCapabilities = { ...CAPABILITIES, region: { ...CAPABILITIES.region!, default: credentials.target || "us" } };
	let client: Promise<DaytonaClient> | undefined;
	const getClient = () => {
		if (!credentials.apiKey?.trim()) throw new MuxError("missing_credentials", "DAYTONA_API_KEY is required", SCOPE);
		return client ??= Promise.resolve().then(async () => {
			const config: DaytonaConfig = {
				apiKey: credentials.apiKey, apiUrl: credentials.apiUrl || "https://app.daytona.io/api",
				target: credentials.target || "us", requestTimeoutMs: REQUEST_MS,
			};
			return factory ? factory(config) : new (await import("@daytona/sdk")).Daytona(config);
		});
	};
	const get = async (id: string) => (await getClient()).get(id);
	const remove = async (id: string) => {
		try { await (await get(id)).delete(LIFECYCLE_SECONDS, true); }
		catch (error) { if (!missing(error)) throw mapped(error, "delete"); }
	};
	const wrap = (sandbox: Sandbox): SandboxHandle => {
		const handle: SandboxHandle = {
			id: sandbox.id, substrate: "daytona", capabilities,
			async exec(command, options = {}): Promise<ExecResult> {
				const start = Date.now();
				const timeout = seconds(options.timeoutMs);
				const line = commandLine(command, options, timeout);
				const session = `am-exec-${randomUUID()}`;
				try {
					await sandbox.process.createSession(session);
					const result = await sandbox.process.executeSessionCommand(session, { command: line, suppressInputEcho: true }, timeout + 10);
					if (!Number.isInteger(result.exitCode)) throw new Error("Command response did not contain an exit code");
					return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.exitCode!, durationMs: Date.now() - start };
				} catch (error) { throw mapped(error, "exec"); }
				finally { await sandbox.process.deleteSession(session).catch(() => {}); }
			},
			async *execStream(command, options: ExecStreamOptions = {}): AsyncGenerator<ExecStreamEvent, void, void> {
				if (options.signal?.aborted) throw options.signal.reason ?? new Error("Command aborted");
				const timeout = seconds(options.timeoutMs);
				const line = commandLine(command, options, timeout);
				const session = `am-stream-${randomUUID()}`;
				let stdout = "", stderr = "";
				const deadline = Date.now() + (timeout + 10) * 1000;
				try {
					await sandbox.process.createSession(session);
					const started = await sandbox.process.executeSessionCommand(session, { command: line, runAsync: true, suppressInputEcho: true }, 30);
					if (!started.cmdId) throw new Error("Stream response did not contain a command ID");
					while (true) {
						if (options.signal?.aborted) throw options.signal.reason ?? new Error("Command aborted");
						if (Date.now() >= deadline) throw new Error("Command stream timed out");
						// Poll bounded HTTP snapshots rather than an SDK log WebSocket
						// with no AbortSignal/disconnect handle. Output is incremental.
						const result = await sandbox.process.getSessionCommand(session, started.cmdId);
						const logs = await sandbox.process.getSessionCommandLogs(session, started.cmdId);
						for (const [type, previous, current] of [["stdout", stdout, logs.stdout ?? ""], ["stderr", stderr, logs.stderr ?? ""]] as const) {
							if (!current.startsWith(previous)) throw new Error("Command log changed while streaming");
							if (current.length > previous.length) yield { type, data: current.slice(previous.length) };
						}
						stdout = logs.stdout ?? ""; stderr = logs.stderr ?? "";
						if (Number.isInteger(result.exitCode)) { yield { type: "exit", exitCode: result.exitCode! }; return; }
						await new Promise((resolve) => setTimeout(resolve, 100));
					}
				} catch (error) { throw mapped(error, "stream"); }
				finally { await sandbox.process.deleteSession(session).catch(() => {}); }
			},
			async execBackground(command) {
				// Background work is detached from this short, bounded launch command.
				const result = await handle.exec(`nohup bash -lc ${quote(command)} </dev/null >/dev/null 2>&1 &`, { timeoutMs: 30_000 });
				if (result.exitCode !== 0) throw new MuxError("fatal", "Daytona background launch failed", SCOPE);
			},
			async openPty(options: PtyOptions = {}): Promise<PtyHandle> {
				const named = options.session !== undefined;
				const id = options.session ?? `am-pty-${randomUUID()}`;
				if (!/^[A-Za-z0-9_.-]{1,100}$/.test(id)) throw new MuxError("fatal", "Invalid Daytona PTY session name", SCOPE);
				const queue: Uint8Array[] = [];
				let done = false, notify = () => {};
				let settleExit!: (code: number | null) => void;
				const exited = new Promise<number | null>((resolve) => { settleExit = resolve; });
				const finish = (code: number | null) => { done = true; settleExit(code); notify(); };
				const onData = (data: Uint8Array) => { queue.push(data); notify(); };
				let pty: Awaited<ReturnType<Sandbox["process"]["createPty"]>> | undefined;
				let created = false;
				try {
					if (named) {
						const sessions = await sandbox.process.listPtySessions();
						if (sessions.some((item) => item.id === id)) pty = await sandbox.process.connectPty(id, { onData });
						else { created = true; pty = await sandbox.process.createPty({ id, cols: options.cols ?? 100, rows: options.rows ?? 30, envs: options.env, onData }); }
					} else { created = true; pty = await sandbox.process.createPty({ id, cols: options.cols ?? 100, rows: options.rows ?? 30, envs: options.env, onData }); }
					await pty.waitForConnection();
					void pty.wait().then((result) => finish(result.exitCode ?? null), () => finish(null));
					if (created && options.command) await pty.sendInput(`exec bash -lc ${quote(options.command)}\n`);
				} catch (error) {
					if (pty) {
						if (created) await pty.kill().catch(() => {});
						await pty.disconnect().catch(() => {});
					}
					finish(null); throw mapped(error, "PTY open");
				}
				const connected = pty;
				return {
					output: { async *[Symbol.asyncIterator]() { while (!done || queue.length) { if (queue.length) yield queue.shift()!; else await new Promise<void>((resolve) => { notify = resolve; }); } } },
					exited,
					write: (data) => connected.sendInput(data),
					async resize(cols, rows) { await connected.resize(cols, rows); },
					async close() { try { if (!named && !done) await connected.kill(); } finally { await connected.disconnect(); finish(null); } },
				};
			},
			async writeFile(path, content) {
				try { await sandbox.fs.uploadFile(typeof content === "string" ? Buffer.from(content) : Buffer.from(content), path); }
				catch (error) { throw mapped(error, "file write"); }
			},
			async publicUrl(port) {
				if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
				try { return (await sandbox.getSignedPreviewUrl(port, DAYTONA_PREVIEW_TTL_SECONDS)).url; }
				catch (error) { throw mapped(error, "preview URL"); }
			},
			async state() { return (await provider.describe!(sandbox.id)).state; },
			async sleep() { await provider.park!(sandbox.id); },
			async wake() { try { sandbox = await get(sandbox.id); if (state(sandbox.state) !== "ready") await sandbox.start(LIFECYCLE_SECONDS); } catch (error) { throw mapped(error, "start"); } },
			destroy: () => remove(sandbox.id),
		};
		return handle;
	};
	const provider: SandboxProvider = {
		kind: "daytona", capabilities,
		ready: () => credentials.apiKey?.trim() ? { ok: true, missing: [] } : { ok: false, missing: ["DAYTONA_API_KEY"] },
		async create(options = {}) {
			for (const value of Object.values(options.resources ?? {})) if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new MuxError("fatal", "Requested Daytona resources must be positive finite values", SCOPE);
			if (options.timeoutMs !== undefined) seconds(options.timeoutMs);
			const sized = options.resources && Object.values(options.resources).some((value) => value !== undefined);
			if (sized && options.template) throw new MuxError("not_supported", "Daytona snapshot templates have fixed allocation; do not combine a snapshot template with requested resources", SCOPE);
			const activeClient = await getClient();
			const creationId = randomUUID();
			let sandbox: Sandbox | undefined;
			try {
				sandbox = await activeClient.create({
					language: "typescript", envVars: options.env,
					labels: { [CREATE_LABEL]: creationId },
					...(sized ? { image: DEFAULT_IMAGE, user: "daytona", resources: {
						cpu: options.resources?.vcpu,
						memory: options.resources?.memoryMib === undefined ? undefined : options.resources.memoryMib / 1024,
						disk: options.resources?.diskGib,
					} } : { snapshot: options.template }),
					name: options.name && options.onNameConflict === "unique" ? `${options.name.slice(0,50)}-${randomUUID().slice(0,8)}` : options.name,
					public: false, ephemeral: false, autoDeleteInterval: -1, ttlMinutes: 0,
					autoPauseInterval: 0,
					autoStopInterval: options.timeoutMs === undefined ? 0 : Math.ceil(options.timeoutMs / 60_000),
				}, { timeout: LIFECYCLE_SECONDS });
				await verifyAllocation(sandbox, options.resources);
				return wrap(sandbox);
			} catch (error) {
				if (!sandbox) {
					try { sandbox = await boundedCreationLookup(activeClient, creationId); }
					catch (recoveryError) {
						// fatal is routable in the mux. This condition instead refuses
						// automatic retry/failover while the first POST is unresolved.
						throw new MuxError("not_supported", `Daytona automatic creation recovery is not supported for this unresolved result; manual review required. Creation label ${CREATE_LABEL}=${creationId}. ${mapped(recoveryError, "creation lookup").message}. ${mapped(error, "create").message}`, SCOPE);
					}
				}
				try { await sandbox.delete(LIFECYCLE_SECONDS, true); }
				catch { throw new MuxError("not_supported", `Daytona provisioning failed and rollback could not delete new sandbox ${sandbox.id}; manual cleanup required. Creation label ${CREATE_LABEL}=${creationId}. ${mapped(error, "provision").message}`, SCOPE); }
				throw mapped(error, "create");
			}
		},
		async connect(id) { try { return wrap(await get(id)); } catch (error) { throw mapped(error, "connect"); } },
		async describe(id) { try { return description(await get(id)); } catch (error) { if (missing(error)) return { state: "destroyed", rawPhase: null }; throw mapped(error, "describe"); } },
		async list() {
			try {
				const result = [];
				for await (const sandbox of (await getClient()).list()) result.push({ id: sandbox.id, name: sandbox.name, state: state(sandbox.state), substrate: "daytona" as const, createdAt: sandbox.createdAt });
				return result;
			} catch (error) { throw mapped(error, "list"); }
		},
		remove,
		async park(id) { try { const sandbox = await get(id); if (state(sandbox.state) !== "sleeping") await sandbox.stop(LIFECYCLE_SECONDS); } catch (error) { throw mapped(error, "stop"); } },
	};
	return provider;
}

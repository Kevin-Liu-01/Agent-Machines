/**
 * Vercel Sandbox substrate adapter.
 *
 * Wraps `@vercel/sandbox` (persistent Firecracker microVMs) behind the
 * SandboxProvider contract:
 *
 *   exec        -> runCommand("bash", ["-lc", <base64 wrapper>]) so quoting
 *                  never leaks into the vendor API (proven pattern from
 *                  web/lib/providers/e2b.ts).
 *   execStream  -> detached runCommand + Command.logs() async iterator,
 *                  then wait() for the exit code (native streaming).
 *   openPty     -> tmux-over-exec fallback; Vercel Sandbox has NO native
 *                  PTY and NO stdin after a command starts (hard vendor
 *                  limitation), so interactive sessions live in tmux on
 *                  the sandbox and are driven purely through exec.
 *   sleep       -> sandbox.stop() (filesystem snapshot; memory is lost).
 *   wake        -> Sandbox.get({ resume: true }) resumes from snapshot.
 *   destroy     -> sandbox.delete() (terminal; the name is freed).
 *
 * Auth is either VERCEL_OIDC_TOKEN or the token + teamId + projectId
 * triple. A `vck_`-prefixed key is a Vercel AI Gateway key and is NOT
 * Sandbox auth; ready() fails closed with a pointer to the right vars.
 *
 * State mapping (mirrors web/lib/providers/vercel.ts):
 *   running -> ready; stopped -> sleeping;
 *   pending / stopping / snapshotting -> starting;
 *   failed / aborted -> error.
 */

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
	type PtyHandle,
	type PtyOptions,
	type SandboxCapabilities,
	type SandboxHandle,
	type SandboxInfo,
	type SandboxProvider,
} from "../types.js";

type VercelSandboxModule = typeof import("@vercel/sandbox");
type SandboxClass = VercelSandboxModule["Sandbox"];
type SandboxInstance = Awaited<ReturnType<SandboxClass["get"]>>;
type DetachedCommand = Awaited<ReturnType<SandboxInstance["getCommand"]>>;

export type VercelProviderCredentials = {
	token?: string;
	teamId?: string;
	projectId?: string;
	oidcToken?: string;
};

const RUNTIME = "node24";
/** Session auto-terminate window; persistence survives it via snapshots. */
const DEFAULT_SESSION_TIMEOUT_MS = 3_600_000;
/**
 * Vercel requires ports to be declared at create time (max 4). The
 * contract has no port knob, so expose the gateway ports the harnesses
 * use (hermes 8642, openclaw 18789) plus a common dev-server port.
 */
const DEFAULT_PORTS = [3000, 8642, 18789] as const;
const LIST_MAX_ENTRIES = 200;

const CAPABILITIES: SandboxCapabilities = {
	pty: "tmux",
	persistence: "filesystem-snapshot",
	reattach: true,
	publicUrl: true,
	streamingExec: true,
};

let sandboxClassPromise: Promise<SandboxClass> | null = null;

function loadSandboxClass(): Promise<SandboxClass> {
	if (!sandboxClassPromise) {
		sandboxClassPromise = import("@vercel/sandbox").then(
			(mod) => mod.Sandbox,
			() => {
				throw new MuxError(
					"fatal",
					"@vercel/sandbox is not installed; npm i @vercel/sandbox",
					{ substrate: "vercel" },
				);
			},
		);
	}
	return sandboxClassPromise;
}

/** Base64-wrap arbitrary shell so quoting never breaks (postmortem rule). */
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

function mapStatus(status: string | undefined): MachineState {
	switch (status) {
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function httpStatus(error: unknown): number | undefined {
	if (error && typeof error === "object" && "response" in error) {
		const response = (error as { response?: { status?: unknown } }).response;
		if (response && typeof response.status === "number") {
			return response.status;
		}
	}
	return undefined;
}

/** House taxonomy: 429 -> rate_limited, 5xx/network -> transient, 4xx -> fatal. */
function classifyError(error: unknown): "rate_limited" | "transient" | "fatal" {
	const status = httpStatus(error);
	if (status !== undefined) {
		if (status === 429) return "rate_limited";
		if (status >= 500) return "transient";
		if (status >= 400) return "fatal";
	}
	const message = errorMessage(error);
	if (/\b429\b|rate.?limit/i.test(message)) return "rate_limited";
	if (/\b40[0-9]\b|unauthorized|forbidden|not.?found|invalid/i.test(message)) {
		return "fatal";
	}
	// Network-ish and everything unknown: worth retrying elsewhere.
	return "transient";
}

function isNotFound(error: unknown): boolean {
	if (httpStatus(error) === 404) return true;
	return /not[_ ]?found/i.test(errorMessage(error));
}

function toMuxError(error: unknown, context: string): MuxError {
	if (error instanceof MuxError) return error;
	return new MuxError(
		classifyError(error),
		`vercel ${context}: ${errorMessage(error)}`,
		{ substrate: "vercel" },
	);
}

function isGatewayKey(value: string | undefined): boolean {
	return Boolean(value && value.startsWith("vck_"));
}

/**
 * Best-effort local decode of a Vercel OIDC JWT payload. The SDK derives
 * projectId/teamId from these claims; Sandbox.list() requires projectId
 * as an explicit parameter, so we mirror the derivation here.
 */
function decodeOidcClaims(oidcToken: string | undefined): {
	projectId?: string;
	teamId?: string;
} {
	if (!oidcToken) return {};
	const parts = oidcToken.split(".");
	if (parts.length < 2 || !parts[1]) return {};
	try {
		const payload = JSON.parse(
			Buffer.from(
				parts[1].replace(/-/g, "+").replace(/_/g, "/"),
				"base64",
			).toString("utf8"),
		) as Record<string, unknown>;
		return {
			projectId:
				typeof payload["project_id"] === "string"
					? payload["project_id"]
					: undefined,
			teamId:
				typeof payload["owner_id"] === "string"
					? payload["owner_id"]
					: undefined,
		};
	} catch {
		return {};
	}
}

export function createVercelProvider(
	creds: VercelProviderCredentials,
): SandboxProvider {
	const token = creds.token?.trim() || undefined;
	const teamId = creds.teamId?.trim() || undefined;
	const projectId = creds.projectId?.trim() || undefined;
	const oidcToken = creds.oidcToken?.trim() || undefined;

	const tripleOk = Boolean(token && teamId && projectId && !isGatewayKey(token));
	const oidcOk = Boolean(oidcToken && !isGatewayKey(oidcToken));

	/**
	 * All-or-none credential params: the SDK throws on a partial triple.
	 * The OIDC path is resolved by the SDK from VERCEL_OIDC_TOKEN, so an
	 * explicitly configured oidcToken is bridged into the environment at
	 * call time (never at import time).
	 */
	function authParams(): {
		token?: string;
		teamId?: string;
		projectId?: string;
	} {
		if (tripleOk) {
			return { token, teamId, projectId };
		}
		if (oidcOk && oidcToken && !process.env.VERCEL_OIDC_TOKEN) {
			process.env.VERCEL_OIDC_TOKEN = oidcToken;
		}
		return {};
	}

	function ready(): { ok: boolean; missing: string[] } {
		if (tripleOk || oidcOk) return { ok: true, missing: [] };
		const missing: string[] = [];
		if (isGatewayKey(token) || isGatewayKey(oidcToken)) {
			missing.push(
				"a vck_-prefixed key was provided: that is a Vercel AI Gateway key, not Sandbox auth -- need VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID or VERCEL_OIDC_TOKEN",
			);
		}
		if (!token || isGatewayKey(token)) missing.push("VERCEL_TOKEN");
		if (!teamId) missing.push("VERCEL_TEAM_ID");
		if (!projectId) missing.push("VERCEL_PROJECT_ID");
		missing.push("VERCEL_OIDC_TOKEN (alternative to the token triple)");
		return { ok: false, missing };
	}

	function assertReady(): void {
		const readiness = ready();
		if (!readiness.ok) {
			throw new MuxError(
				"missing_credentials",
				`vercel sandbox is not credentialed: ${readiness.missing.join(", ")}`,
				{ substrate: "vercel" },
			);
		}
	}

	function makeHandle(initial: SandboxInstance): SandboxHandle {
		let sandbox = initial;
		const name = initial.name;

		async function refresh(resume: boolean): Promise<SandboxInstance> {
			const Sandbox = await loadSandboxClass();
			sandbox = await Sandbox.get({ ...authParams(), name, resume });
			return sandbox;
		}

		const handle: SandboxHandle = {
			id: name,
			substrate: "vercel",
			capabilities: CAPABILITIES,

			async exec(
				command: string,
				options: ExecOptions = {},
			): Promise<ExecResult> {
				const startedAt = Date.now();
				try {
					// Non-detached: the SDK waits and auto-resumes stopped
					// sessions before running.
					const finished = await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", bashViaBase64(command)],
						env: options.env,
						cwd: options.cwd,
						timeoutMs: options.timeoutMs,
					});
					return {
						stdout: await finished.stdout(),
						stderr: await finished.stderr(),
						exitCode: finished.exitCode,
						durationMs: Date.now() - startedAt,
					};
				} catch (error) {
					// Defensive: some SDK paths surface failed commands as
					// errors that still carry the exit code and output.
					if (error && typeof error === "object" && "exitCode" in error) {
						const cmdError = error as {
							exitCode: number;
							stdout?: () => Promise<string>;
							stderr?: () => Promise<string>;
						};
						return {
							stdout: cmdError.stdout ? await cmdError.stdout() : "",
							stderr: cmdError.stderr ? await cmdError.stderr() : "",
							exitCode: cmdError.exitCode,
							durationMs: Date.now() - startedAt,
						};
					}
					throw toMuxError(error, `exec failed on ${name}`);
				}
			},

			async *execStream(
				command: string,
				options: ExecStreamOptions = {},
			): AsyncGenerator<ExecStreamEvent, void, void> {
				let cmd: DetachedCommand;
				try {
					// timeoutMs is enforced by the sandbox at exec time, so
					// it applies to detached commands too.
					cmd = await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", bashViaBase64(command)],
						env: options.env,
						cwd: options.cwd,
						timeoutMs: options.timeoutMs,
						detached: true,
					});
				} catch (error) {
					throw toMuxError(error, `execStream failed on ${name}`);
				}
				try {
					for await (const log of cmd.logs({ signal: options.signal })) {
						if (log.stream === "stdout") {
							yield { type: "stdout", data: log.data };
						} else {
							yield { type: "stderr", data: log.data };
						}
					}
					const finished = await cmd.wait({ signal: options.signal });
					yield { type: "exit", exitCode: finished.exitCode };
				} catch (error) {
					if (options.signal?.aborted) {
						// Caller cancelled (e.g. tmux tail teardown): reap the
						// remote process and end the stream quietly.
						await cmd.kill().catch(() => {});
						return;
					}
					throw toMuxError(error, `execStream failed on ${name}`);
				}
			},

			async execBackground(command: string): Promise<void> {
				try {
					await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", bashViaBase64(command)],
						detached: true,
					});
				} catch (error) {
					throw toMuxError(error, `execBackground failed on ${name}`);
				}
			},

			async openPty(options: PtyOptions = {}): Promise<PtyHandle> {
				// Vercel Sandbox has no native PTY and no stdin after start;
				// interactive sessions are hosted in tmux on the sandbox.
				return openTmuxPty(handle, options);
			},

			async writeFile(
				path: string,
				content: string | Uint8Array,
			): Promise<void> {
				try {
					await sandbox.writeFiles([{ path, content }]);
				} catch (error) {
					throw toMuxError(error, `writeFile failed for ${name}:${path}`);
				}
			},

			async publicUrl(port: number): Promise<string | null> {
				try {
					// Synchronous route lookup; throws when the port was not
					// declared at create time.
					return sandbox.domain(port);
				} catch {
					return null;
				}
			},

			async state(): Promise<MachineState> {
				try {
					const fresh = await refresh(false);
					return mapStatus(fresh.status);
				} catch (error) {
					if (isNotFound(error)) return "destroyed";
					return "unknown";
				}
			},

			async sleep(): Promise<void> {
				try {
					// stop() snapshots the filesystem and parks the sandbox;
					// memory state is lost by design.
					await sandbox.stop();
				} catch (error) {
					throw toMuxError(error, `sleep (stop) failed for ${name}`);
				}
			},

			async wake(): Promise<void> {
				try {
					// Sandbox.get with resume auto-restores from snapshot.
					await refresh(true);
				} catch (error) {
					throw toMuxError(error, `wake failed for ${name}`);
				}
			},

			async destroy(): Promise<void> {
				try {
					const Sandbox = await loadSandboxClass();
					const target = await Sandbox.get({
						...authParams(),
						name,
						resume: false,
					});
					await target.delete();
				} catch (error) {
					if (isNotFound(error)) return;
					throw toMuxError(error, `destroy failed for ${name}`);
				}
			},
		};

		return handle;
	}

	return {
		kind: "vercel",
		capabilities: CAPABILITIES,

		ready,

		async create(options: CreateSandboxOptions = {}): Promise<SandboxHandle> {
			assertReady();
			const Sandbox = await loadSandboxClass();
			const name = sanitizeSandboxName(
				options.name ?? `am-${randomUUID().slice(0, 12)}`,
			);
			try {
				// getOrCreate makes named creates idempotent (reattaches to a
				// live sandbox, recreates when the snapshot is gone).
				const sandbox = await Sandbox.getOrCreate({
					...authParams(),
					name,
					runtime: RUNTIME,
					persistent: true,
					ports: [...DEFAULT_PORTS],
					timeout: options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
					env: options.env,
					tags: { "agent-machines": "true" },
				});
				return makeHandle(sandbox);
			} catch (error) {
				throw toMuxError(error, `create failed for ${name}`);
			}
		},

		async connect(id: string): Promise<SandboxHandle> {
			assertReady();
			const Sandbox = await loadSandboxClass();
			try {
				// The SDK addresses sandboxes by name; handle ids are names.
				// resume: true auto-wakes a stopped sandbox from snapshot.
				const sandbox = await Sandbox.get({
					...authParams(),
					name: id,
					resume: true,
				});
				return makeHandle(sandbox);
			} catch (error) {
				throw toMuxError(error, `connect failed for ${id}`);
			}
		},

		async list(): Promise<SandboxInfo[]> {
			assertReady();
			const Sandbox = await loadSandboxClass();
			// Sandbox.list requires an explicit projectId even under OIDC
			// auth, where it only exists inside the JWT claims.
			const listProjectId =
				projectId ?? decodeOidcClaims(oidcToken).projectId;
			if (!listProjectId) {
				throw new MuxError(
					"missing_credentials",
					"vercel list requires VERCEL_PROJECT_ID (could not derive project_id from the OIDC token)",
					{ substrate: "vercel" },
				);
			}
			try {
				const paginator = await Sandbox.list({
					...authParams(),
					projectId: listProjectId,
					sortBy: "createdAt",
					sortOrder: "desc",
					limit: 50,
				});
				const infos: SandboxInfo[] = [];
				for await (const entry of paginator) {
					infos.push({
						id: entry.name,
						name: entry.name,
						state: mapStatus(entry.status),
						substrate: "vercel",
						createdAt: new Date(entry.createdAt).toISOString(),
					});
					if (infos.length >= LIST_MAX_ENTRIES) break;
				}
				return infos;
			} catch (error) {
				throw toMuxError(error, "list failed");
			}
		},
	};
}

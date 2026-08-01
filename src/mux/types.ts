/**
 * Core contracts for the Agent Machines multiplexer ("mux").
 *
 * Two planes, one router:
 *
 *   substrate plane  -- SandboxProvider adapters (e2b, sprites, vercel,
 *                       dedalus) normalize lifecycle, exec, streaming and
 *                       PTY access across sandbox vendors.
 *   harness plane    -- HarnessAdapter recipes (claude-code, codex,
 *                       openclaw, hermes) normalize install, auth and
 *                       streamed agent runs across agent CLIs.
 *
 * The Mux router composes both: pick a harness, pick a substrate route
 * (primary + backups), fail over on provisioning errors, and hand back a
 * Machine that can exec, stream an agent run, or attach a PTY.
 *
 * Vocabulary intentionally mirrors web/lib/providers/types.ts so the
 * control plane can adopt these adapters without a translation layer.
 */

export type SubstrateKind = "e2b" | "sprites" | "vercel" | "dedalus";
export type HarnessKind = "claude-code" | "codex" | "openclaw" | "hermes";

export type MachineState =
	| "ready"
	| "starting"
	| "sleeping"
	| "destroying"
	| "destroyed"
	| "error"
	| "unknown";

/** How interactive terminals are realized on a substrate. */
export type PtySupport = "native" | "tmux" | "none";

/** What survives a stop/sleep on a substrate. */
export type PersistenceModel =
	| "memory-snapshot"
	| "filesystem-snapshot"
	| "always-on"
	| "none";

export type SandboxCapabilities = {
	pty: PtySupport;
	persistence: PersistenceModel;
	/** Can an existing sandbox be found and re-driven by id/name? */
	reattach: boolean;
	/** Can a listening port be exposed on a public HTTPS URL? */
	publicUrl: boolean;
	/** Native incremental stdout/stderr while a command runs. */
	streamingExec: boolean;
	/**
	 * Whether work detached from the client runs at full speed.
	 *
	 * "throttled" means the substrate slows or parks a detached process when
	 * the client is not actively driving it. Measured on Sprites 2026-08-01:
	 * the same openclaw install finishes in 17s in the foreground and does
	 * not finish in 15 MINUTES detached, with a plain `curl` that takes
	 * 0.11s interactively stalling indefinitely inside the detached session.
	 * Long installs must therefore stay in the foreground there.
	 */
	detachedWork: "reliable" | "throttled";
};

export type MuxErrorKind =
	| "missing_credentials"
	| "not_supported"
	| "rate_limited"
	| "transient"
	| "fatal";

export class MuxError extends Error {
	readonly kind: MuxErrorKind;
	readonly substrate?: SubstrateKind;
	readonly harness?: HarnessKind;
	constructor(
		kind: MuxErrorKind,
		message: string,
		scope?: { substrate?: SubstrateKind; harness?: HarnessKind },
	) {
		super(message);
		this.name = "MuxError";
		this.kind = kind;
		this.substrate = scope?.substrate;
		this.harness = scope?.harness;
	}
}

/** Failover only on errors that a different substrate could avoid. */
export function isRoutableError(error: unknown): boolean {
	if (error instanceof MuxError) {
		return (
			error.kind === "rate_limited" ||
			error.kind === "transient" ||
			error.kind === "fatal"
		);
	}
	return true;
}

/**
 * One lane's outcome while placing a machine. This is the record that makes
 * a route explainable after the fact ("why did this land on sprites?"), so
 * every field a UI needs to render the decision belongs here.
 */
export type RouteAttempt = {
	substrate: SubstrateKind;
	outcome: "ok" | "skipped" | "failed";
	reason?: string;
	durationMs?: number;
	/** Circuit-breaker state at decision time, when health informed it. */
	health?: import("./health.js").HealthState;
	/** The specific declared need a lane failed, for skipped-by-constraint. */
	constraint?: import("./constraints.js").RouteConstraintKey;
	/** Modeled cost of the run on this lane, when the price is known. */
	estimatedUsd?: number;
};

export type ExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
	durationMs: number;
};

export type ExecOptions = {
	timeoutMs?: number;
	env?: Record<string, string>;
	cwd?: string;
};

export type ExecStreamEvent =
	| { type: "stdout"; data: string }
	| { type: "stderr"; data: string }
	| { type: "exit"; exitCode: number };

export type ExecStreamOptions = ExecOptions & {
	signal?: AbortSignal;
};

export type PtyOptions = {
	cols?: number;
	rows?: number;
	/** Named session; reattaching with the same name resumes scrollback. */
	session?: string;
	env?: Record<string, string>;
	/** Command to run instead of the login shell. */
	command?: string;
};

export type PtyHandle = {
	/** Raw output bytes, ready for xterm/ghostty-web. */
	readonly output: AsyncIterable<Uint8Array>;
	write(data: string | Uint8Array): Promise<void>;
	resize(cols: number, rows: number): Promise<void>;
	/** Resolves with the exit code once the PTY process ends. */
	readonly exited: Promise<number | null>;
	close(): Promise<void>;
};

export type SandboxInfo = {
	id: string;
	name?: string;
	state: MachineState;
	substrate: SubstrateKind;
	createdAt?: string;
};

export type SandboxHandle = {
	readonly id: string;
	readonly substrate: SubstrateKind;
	readonly capabilities: SandboxCapabilities;
	exec(command: string, options?: ExecOptions): Promise<ExecResult>;
	execStream(
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void>;
	/** Fire-and-forget; must not block on command completion. */
	execBackground(command: string): Promise<void>;
	openPty(options?: PtyOptions): Promise<PtyHandle>;
	writeFile(path: string, content: string | Uint8Array): Promise<void>;
	/**
	 * Extend the sandbox's idle/lifetime budget, where the substrate
	 * supports it (E2B `setTimeout`). Long installs outlive the default
	 * budget otherwise. Substrates that park on their own schedule omit
	 * this.
	 */
	keepAlive?(ms: number): Promise<void>;
	publicUrl(port: number): Promise<string | null>;
	state(): Promise<MachineState>;
	sleep(): Promise<void>;
	wake(): Promise<void>;
	destroy(): Promise<void>;
};

export type CreateSandboxOptions = {
	name?: string;
	env?: Record<string, string>;
	/** Idle timeout before the substrate parks the sandbox. */
	timeoutMs?: number;
	/**
	 * Substrate-specific image with harnesses pre-baked. Skips the
	 * per-machine install entirely where available (E2B template, Vercel
	 * VCR image). Ignored by substrates without custom images.
	 */
	template?: string;
	/**
	 * Requested size. Default images are small: a heavy harness install
	 * (Hermes builds a Python venv) can exhaust the default and leave the
	 * sandbox unresponsive. Substrates that do not expose sizing ignore
	 * this rather than failing.
	 */
	resources?: { vcpu?: number; memoryMib?: number };
};

export type SandboxProvider = {
	readonly kind: SubstrateKind;
	readonly capabilities: SandboxCapabilities;
	/** Synchronous fail-closed credential check. */
	ready(): { ok: boolean; missing: string[] };
	create(options?: CreateSandboxOptions): Promise<SandboxHandle>;
	connect(id: string): Promise<SandboxHandle>;
	list(): Promise<SandboxInfo[]>;
};

/** Model upstream keys a harness may need inside the sandbox. */
export type UpstreamKeys = {
	anthropic?: string;
	openai?: string;
	aiGateway?: string;
	openrouter?: string;
};

export type HarnessRunOptions = {
	model?: string;
	cwd?: string;
	/** Extra CLI args appended verbatim. */
	extraArgs?: string[];
	/** Resume a previous session where the harness supports it. */
	sessionId?: string;
};

export type HarnessCommand = {
	command: string;
	env: Record<string, string>;
};

export type HarnessAdapter = {
	readonly kind: HarnessKind;
	/** Which upstream must be present, mirroring credential gating rules. */
	readonly requiredUpstream: "anthropic" | "openai" | "any";
	/** Fast probe; exit 0 means installed. */
	isInstalledCommand(): string;
	/** Idempotent install; safe to re-run. */
	installCommand(): string;
	/**
	 * Budget for this harness's install, when its own cost is known to
	 * exceed the router default. Hermes bootstraps a Python toolchain and
	 * apt packages and measured well past 15 minutes on a cold sandbox; an
	 * npm-installed harness should leave this unset so a broken install
	 * still fails fast.
	 */
	readonly installBudgetMs?: number;
	/** Version probe for diagnostics. */
	versionCommand(): string;
	/**
	 * One-shot streamed run. The command must emit machine-readable
	 * events on stdout (NDJSON where the CLI supports it) and exit when
	 * the turn completes.
	 */
	runCommand(prompt: string, keys: UpstreamKeys, options?: HarnessRunOptions): HarnessCommand;
	/** Interactive command for PTY sessions. */
	interactiveCommand(keys: UpstreamKeys, options?: HarnessRunOptions): HarnessCommand;
	/** Normalize one stdout line into zero or more mux agent events. */
	parseLine(line: string): import("./events.js").MuxAgentEvent[];
	/**
	 * Optional per-run parser factory for adapters that need turn state
	 * (delta dedup, thread ids). The router prefers this over the
	 * stateless parseLine so concurrent runs never share state.
	 */
	newTurnParser?(): (line: string) => import("./events.js").MuxAgentEvent[];
};

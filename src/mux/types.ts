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

/** A vendor fact no documentation states and no measurement of ours proves. */
export type Unknown = "unknown";

/**
 * Whether asking for something changes what a run actually gets.
 *
 *   "honored"     -- the mux forwards the request and it takes effect.
 *   "ignored"     -- the vendor documents the knob; this adapter does not
 *                    forward it, so the default is all a run can count on.
 *   "unsupported" -- no vendor documentation exposes such a request at all.
 *   "unknown"     -- forwarded, but never observed to take effect (E2B's
 *                    sizing request, docs/MUX-RESULTS.md finding 10).
 *
 * Only "honored" may satisfy a constraint that the substrate's default does
 * not already meet: a forwarded-but-ignored request looks like success at
 * placement time and then starves the harness at run time.
 */
export type RequestSupport = "honored" | "ignored" | "unsupported" | "unknown";

/** Where a sandbox physically lands, and whether a caller may choose. */
export type RegionSupport = {
	/** Region a create with no region argument lands in. */
	default: string | Unknown;
	/** Regions the vendor documents for this product, lowest published tier. */
	available: readonly string[] | Unknown;
	/** Can the mux pin one? */
	select: RequestSupport;
};

/** Accelerator access. `available` is the vendor's claim, `request` ours. */
export type GpuSupport = {
	available: boolean | Unknown;
	/** Accelerator models the vendor documents, when it names any. */
	models: readonly string[] | Unknown;
	request: RequestSupport;
};

/** Outbound network posture of a fresh sandbox. */
export type EgressPolicy = "open" | "blocked" | "allowlist";

export type NetworkPolicySupport = {
	egress: EgressPolicy | Unknown;
	/** Can the mux change it per sandbox? */
	control: RequestSupport;
};

/**
 * Starting a SECOND live sandbox from an existing one's state.
 *
 * Deliberately not the same axis as `persistence`: sleep/wake through a
 * snapshot is already modeled there and is reachable through the contract
 * (`sleep()`/`wake()`). This axis is the fork/clone operation, which the
 * SandboxProvider contract does not expose at all today -- hence `exposed`,
 * so a caller who needs forking is told the mux is the missing piece rather
 * than being routed to a vendor that could do it if we called it.
 */
export type ForkSupport = {
	/** Can the vendor's own documented API fork a sandbox? */
	vendor: boolean | Unknown;
	/** Is a fork reachable through the mux contract today? */
	exposed: boolean;
};

/**
 * How a listening port becomes publicly reachable.
 *
 *   "any-port"           -- any port maps to a URL with no declaration.
 *   "declared-at-create" -- ports must be listed when the sandbox is made.
 *   "single-fixed"       -- exactly one port is proxied, and it is fixed.
 */
export type PublicPortModel = "any-port" | "declared-at-create" | "single-fixed";

export type PublicPortSupport = {
	model: PublicPortModel | Unknown;
	/** Simultaneous public ports the vendor documents, lowest tier. */
	vendorMax: number | Unknown;
	/** Public ports a run can actually get through this adapter today. */
	muxMax: number | Unknown;
	/** The only ports that route, where the substrate or adapter fixes them. */
	fixed: readonly number[] | null;
};

/**
 * Quantitative vendor limits, all read as the LOWEST published plan tier.
 *
 * We cannot prove which plan a caller's key is on, so routing may promise
 * only what the cheapest plan guarantees. Memory is MiB and disk is GiB; a
 * vendor figure written in decimal GB is converted down (1 GB = 0.931 GiB)
 * rather than read as the same number of binary units, because rounding a
 * ceiling up is how a floor gets satisfied by a machine that cannot hold it.
 */
export type SubstrateLimits = {
	/** Size a sandbox gets without asking for anything. */
	baseVcpu: number | Unknown;
	baseMemoryMib: number | Unknown;
	baseDiskGib: number | Unknown;
	/** Documented ceiling on the lowest published plan tier. */
	maxVcpu: number | Unknown;
	maxMemoryMib: number | Unknown;
	maxDiskGib: number | Unknown;
	/** Longest single continuous run, lowest published tier. */
	maxRuntimeMs: number | Unknown;
	/** Sandboxes that may run at once on one account, lowest tier. */
	maxConcurrentSandboxes: number | Unknown;
	/** Does `CreateSandboxOptions.resources` change the machine? */
	resourceRequest: RequestSupport;
};

/**
 * What a substrate offers, as the router's feasibility input.
 *
 * The six behavioral axes are required because every adapter demonstrably
 * implements one of the values. The vendor-fact axes below them are optional
 * on purpose: an absent axis reads as "unknown", which is the most
 * conservative value in the model and therefore REJECTS any constraint that
 * needs it. A new adapter thus starts with zero capability claims and earns
 * each one by citing a source, instead of being forced to fill in a field
 * nobody researched -- which is how a guess gets typed in and then routed on.
 *
 * Every declared value must carry the vendor URL and the date it was read in
 * a comment beside it (see the four adapters in ./providers). A value we
 * cannot source is "unknown", never a plausible number.
 */
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
	region?: RegionSupport;
	gpu?: GpuSupport;
	network?: NetworkPolicySupport;
	fork?: ForkSupport;
	publicPorts?: PublicPortSupport;
	limits?: SubstrateLimits;
};

/**
 * Every error kind, as a VALUE. The union is derived from it rather than
 * declared alongside it, so there is one list.
 *
 * Why a value at all: a consumer that has to decide whether a thrown thing is a
 * MuxError cannot use `instanceof` if the error crossed a package boundary --
 * two copies of the class fail that check -- so it matches on `name` and `kind`
 * instead, which means it needs the list of kinds at runtime. The hosted control
 * plane hand-copied these five for exactly that reason, and a hand-copy is a
 * thing that silently misses the sixth: an unrecognized kind degrades to
 * `transient`, so the dashboard would retry a `missing_credentials` forever.
 */
export const MUX_ERROR_KINDS = [
	"missing_credentials",
	"not_supported",
	"rate_limited",
	"transient",
	"fatal",
] as const;

export type MuxErrorKind = (typeof MUX_ERROR_KINDS)[number];

/**
 * The `name` every MuxError carries. Exported because structural recovery
 * across a package boundary matches on this string, and a string literal
 * repeated in another package is a rename waiting to go unnoticed.
 */
export const MUX_ERROR_NAME = "MuxError";

/** Narrow an unknown to a kind, for consumers reading `error.kind` off a plain object. */
export function isMuxErrorKind(value: unknown): value is MuxErrorKind {
	return (
		typeof value === "string" &&
		(MUX_ERROR_KINDS as readonly string[]).includes(value)
	);
}

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
		this.name = MUX_ERROR_NAME;
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

/**
 * A status read that must NOT wake the sandbox.
 *
 * Deliberately not reachable through SandboxHandle: a handle only exists
 * after connect(), and connect RESUMES a paused sandbox on e2b
 * (Sandbox.connect) and vercel (Sandbox.get defaults resume: true). Polling
 * state through a handle therefore bills a parked machine for being looked at,
 * and the dashboard polls state on every fleet render -- so a status read has
 * to be answerable from one control-plane call instead.
 */
export type SandboxDescription = {
	/** Normalized state, the same vocabulary SandboxHandle.state() returns. */
	state: MachineState;
	/**
	 * The substrate's own status word, verbatim, because the normalized state
	 * is deliberately coarse: Sprites reports both "warm" and "cold" as
	 * `sleeping`, and only the raw word says whether the next exec answers in
	 * ~60ms or has to boot first (measured 2026-08-01, ./providers/sprites.ts).
	 * Null when the vendor reports no status at all -- an id its API no longer
	 * knows -- so a caller never reads an invented phase as a real one.
	 */
	rawPhase: string | null;
	/** ISO-8601, when the vendor's status read carries a creation time. */
	createdAt?: string;
	/** The vendor's own failure text, on substrates that publish one. */
	lastError?: string;
	/**
	 * Size the vendor reports for THIS sandbox, not the declared ceiling in
	 * `SubstrateLimits`. An axis the vendor omits, or states in a unit we
	 * cannot prove, is absent rather than converted on a guess.
	 */
	resources?: { vcpu?: number; memoryMib?: number; diskGib?: number };
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
	/**
	 * Open a live sandbox for work. May resume a parked one -- that is what
	 * "live" costs. Use describe() to look, remove() to destroy and park() to
	 * park; none of those want a running machine.
	 */
	connect(id: string): Promise<SandboxHandle>;
	list(): Promise<SandboxInfo[]>;
	/**
	 * Read a sandbox's status without waking it.
	 *
	 * OPTIONAL, following the SandboxHandle.keepAlive pattern: a caller must
	 * degrade when a substrate omits it, never assume it. An adapter that
	 * cannot read status without resuming must omit this member or throw
	 * `not_supported` -- quietly resuming here is the exact defect it exists
	 * to fix, because a caller that polls state cannot see the wake it caused.
	 */
	describe?(id: string): Promise<SandboxDescription>;
	/**
	 * Destroy by id, without resuming first.
	 *
	 * connect() + handle.destroy() resumes on e2b and vercel: wasted billing,
	 * and a sandbox whose snapshot cannot resume becomes UNDESTROYABLE -- the
	 * orphaned-quota failure in
	 * knowledge/POSTMORTEM-2026-05-18-live-fire-qa.md item 5. Idempotent: an
	 * id the vendor no longer knows resolves instead of throwing, since the
	 * requested end state already holds.
	 */
	remove?(id: string): Promise<void>;
	/**
	 * Park by id, on substrates whose vendor can pause without a resume round
	 * trip.
	 *
	 * Omitted rather than stubbed where it cannot be done honestly, so a
	 * caller degrades instead of trusting a park that never happened. Not
	 * idempotent in intent: an id the vendor does not know is an error the
	 * caller should see, not a satisfied request.
	 */
	park?(id: string): Promise<void>;
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

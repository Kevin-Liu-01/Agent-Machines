/**
 * The mux router: compose the harness plane and the substrate plane.
 *
 * `createMux()` loads config (JSON file or object), instantiates only
 * credentialed providers, and routes `create()` calls across the
 * primary -> backups chain. Provisioning errors that another substrate
 * could avoid (transient, rate_limited, fatal) fail over; credential
 * and capability gaps are skipped up front (fail closed).
 *
 * Agent runs stream normalized MuxAgentEvents; interactive use returns
 * a PtyHandle (native where the substrate has one, tmux-over-exec
 * everywhere else).
 */

import { randomUUID } from "node:crypto";
import { loadMuxConfig, resolveMuxConfig, type MuxConfig, type MuxConfigInput } from "./config.js";
import { LineBuffer, type MuxAgentEvent, type RunResult } from "./events.js";
import { getHarness } from "./harnesses/index.js";
import { getProvider } from "./providers/index.js";
import {
	forgetMachineAsync,
	getPlacementStore,
	readMuxState,
	readMuxStateAsync,
	rememberMachineAsync,
	saveHealthAsync,
	type PlacementStore,
	type RememberedMachine,
} from "./state.js";
import { SubstrateHealth, outcomeForError } from "./health.js";
import {
	asSkippedAttempts,
	filterCandidates,
	profileFor,
	type RouteConstraints,
} from "./constraints.js";
import { cheapestFirst, estimate } from "./cost.js";
import { SelectionPolicy, type LaneScore } from "./selection.js";
import { requireUpstream } from "./upstreams.js";
import { appendCharge } from "./ledger.js";
import {
	appendTrace,
	claim,
	type ClaimOutcome,
	completeClaim,
	releaseClaim,
	traceFromRun,
} from "./traces.js";
import {
	MuxError,
	isRoutableError,
	type RouteAttempt,
	type CreateSandboxOptions,
	type HarnessAdapter,
	type HarnessKind,
	type HarnessRunOptions,
	type ExecResult,
	type PtyHandle,
	type PtyOptions,
	type SandboxDescription,
	type SandboxHandle,
	type SandboxProvider,
	type SubstrateKind,
} from "./types.js";
import {
	MIGRATION_MARKER_PATH,
	MOVE_ALLOWLIST,
	MOVE_NOTES,
	REDERIVED,
	buildExportCommand,
	exportTar,
	lostState,
	probeIncludes,
	readHome,
	restoreTar,
	verifyMarker,
	writeMarker,
	DEFAULT_TAR_TIMEOUT_MS,
	type MigrationMarker,
} from "./statemove.js";

export type MuxCreateOptions = {
	agent?: HarnessKind;
	/** Explicit substrate, or "auto" to follow primary -> backups. */
	sandbox?: SubstrateKind | "auto";
	name?: string;
	model?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	/** Skip harness installation (sandbox template already has it). */
	install?: boolean;
	/** Pre-baked image, where the substrate supports one. */
	template?: string;
	/** Requested sandbox size; heavy harnesses need more than defaults. */
	resources?: { vcpu?: number; memoryMib?: number };
	/**
	 * What the work needs, declared instead of naming a vendor. Lanes that
	 * cannot satisfy a need are skipped with the failed dimension named --
	 * never silently downgraded, since a caller who asked for a native PTY
	 * would rather fail than get a slower emulation without being told.
	 */
	constraints?: RouteConstraints;
	/**
	 * Order surviving lanes by modeled price instead of configured order.
	 *
	 * An explicit objective, so it also turns the learned ordering OFF: a
	 * caller who asked for cheapest-first gets cheapest-first, not whatever
	 * the policy currently believes.
	 */
	optimize?: "cost";
};

export type MuxRunOptions = HarnessRunOptions & {
	timeoutMs?: number;
	signal?: AbortSignal;
	onEvent?: (event: MuxAgentEvent) => void;
	/**
	 * Idempotency key. A retry with the same key returns the stored result
	 * instead of running the agent again -- agent runs cost money and have
	 * side effects, so a client crash must not double-execute one. Omit for
	 * fire-and-forget runs.
	 */
	runKey?: string;
};

// RouteAttempt moved to types.ts (traces.ts needs it without importing the
// router). Re-exported here because it was already public from this module.
export type { RouteAttempt } from "./types.js";

/**
 * A RouteAttempt plus what the learned policy thought of the lane.
 *
 * The three fields live here rather than in `types.ts` because that file is the
 * contract every other surface compiles against, while the policy is this
 * router's own. A ScoredRouteAttempt IS a RouteAttempt, so `traces.ts` and
 * every existing consumer keep working unchanged and the annotations ride along
 * into the trace record verbatim -- which is what makes a placement decision
 * still explainable a month later.
 *
 * All three are absent together, and absent means the policy did not run on
 * this lane: it was pinned, or skipped before the ordering stage, or selection
 * is disabled. Absent is never "scored zero".
 */
export type ScoredRouteAttempt = RouteAttempt & {
	/**
	 * 0..1 value of the lane at decision time; higher is better. Comparable
	 * against the other attempts on the SAME route and not across routes -- two
	 * of the three terms behind it are relative to the candidate set of that one
	 * request. See `LaneScore.score`; `machine.selection` carries the absolute
	 * measurements.
	 */
	selectionScore?: number;
	/** Completed runs the score rests on. 0 is an unexplored lane, not an error. */
	selectionSamples?: number;
	/** Scoring rule that produced it (SELECTION_POLICY_VERSION). */
	selectionPolicy?: string;
};

export type RunStream = AsyncIterable<MuxAgentEvent> & {
	result(): Promise<RunResult>;
};

/**
 * One claim key per machine for BOTH placement-mutating verbs (switchAgent and
 * migrate), so they exclude each other, not just themselves. Two functions
 * deriving "their own" key from the same name is how the cross-verb race
 * shipped the first time.
 */
function machineOpClaimKey(name: string): string {
	return `am-machine-op:${name}`;
}

/**
 * What `Mux.switchAgent()` proved before it flipped the placement.
 *
 * The agent router's half of the product's two verbs: the sandbox and its
 * load stay put, the harness that ANSWERS on it changes. `migrate()` is the
 * other half. The two never compose in one call -- "hermes on sprites,
 * starting from openclaw on e2b" is switchAgent then migrate (or vice
 * versa), so each step has exactly one point of no return.
 */
export type SwitchReport = {
	name: string;
	substrate: SubstrateKind;
	sandboxId: string;
	from: HarnessKind;
	to: HarnessKind;
	/** False when from === to: an idempotent no-op, still probed. */
	changed: boolean;
	/** False = the harness was already present (the fast rollback path). */
	installed: boolean;
	/** The versionCommand that proved the harness answers. */
	probe: { command: string };
	/**
	 * Whether connecting resumed a parked sandbox, read from the provider's
	 * no-wake describe() BEFORE connecting. "unknown" where the substrate has
	 * no describe -- never invented.
	 */
	woke: boolean | "unknown";
};

export type MigrateStep = {
	step: "gate" | "provision" | "install" | "export" | "restore" | "verify" | "commit" | "source";
	detail?: string;
};

export type MigrateOptions = {
	to: SubstrateKind;
	/** Ship the $HOME-relative file state (default). `false` = fresh box,
	 * same agent, same name, and the report's `lost` list says everything
	 * file-shaped was left behind. */
	moveState?: boolean;
	/** What happens to the OLD sandbox after commit. Default "destroy":
	 * park does not exist on sprites/dedalus and always-on substrates bill
	 * while parked, so a default that silently accrues cost fails closed
	 * the wrong way. The copied state plus an intact source until commit is
	 * the rollback story; the cautious caller opts into park/keep. */
	source?: "destroy" | "park" | "keep";
	env?: Record<string, string>;
	resources?: { vcpu?: number; memoryMib?: number; diskGib?: number };
	template?: string;
	onProgress?: (step: MigrateStep) => void;
};

/**
 * What `Mux.migrate()` moved, re-derived, lost, and did with the source.
 * The report IS the API surface: what moved and what did not is returned,
 * not logged, because a migration whose losses are only in a log is a
 * migration that over-claims.
 */
export type MigrateReport = {
	name: string;
	/** migrate never changes the agent; switchAgent is the other verb. */
	agent: HarnessKind;
	from: { substrate: SubstrateKind; sandboxId: string };
	to: { substrate: SubstrateKind; sandboxId: string };
	state: {
		moved: string[];
		rederived: string[];
		lost: string[];
		skipped: Array<{ path: string; reason: string }>;
		bytes: number;
		/** Named unknowns (unverified vendor layouts), never silent promises. */
		notes: string[];
	};
	verified: {
		probe: string;
		/** "skipped" only when moveState: false. */
		marker: boolean | "skipped";
	};
	/** `error` names an orphaned sandbox, never silently. A post-commit
	 * source failure does NOT fail the migration: the load is already safe
	 * on the new sandbox. `note` is the other half of that honesty: a
	 * teardown that ERRORED and is nevertheless confirmed complete reports
	 * the vendor's text here, where nothing reads it as an orphan. */
	source: {
		action: "destroyed" | "parked" | "kept";
		resumed?: boolean;
		error?: string;
		note?: string;
	};
	/** The pinned-lane record, same shape create() produces. */
	attempts: RouteAttempt[];
};


/** Detached-install budget and poll cadence. */
const INSTALL_BUDGET_MS = 900_000;
const INSTALL_POLL_MS = 1_500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stand in for a run that is already done or already running under the same
 * idempotency key. A completed claim replays its text and result so the
 * caller's code path is unchanged; an in-flight claim is an error rather than
 * a silent second execution, because two writers to one logical run is
 * exactly what the key exists to prevent.
 */
function replayStream(
	runKey: string,
	outcome: Exclude<ClaimOutcome, "claimed">,
	onEvent?: (event: MuxAgentEvent) => void,
): RunStream {
	if (outcome === "in_flight") {
		const fail = async function* (): AsyncGenerator<MuxAgentEvent> {
			throw new MuxError(
				"transient",
				`run "${runKey}" is already in flight; retry after it settles or use a new runKey`,
			);
		};
		const iterator = fail();
		return {
			[Symbol.asyncIterator]: () => iterator,
			async result() {
				for await (const event of iterator) void event;
				throw new MuxError("transient", `run "${runKey}" is already in flight`);
			},
		};
	}
	const stored = outcome.done;
	const events: MuxAgentEvent[] = [
		{ type: "started", harness: stored.harness, sessionId: stored.sessionId },
		...(stored.text ? [{ type: "text" as const, delta: stored.text }] : []),
		{
			type: "result",
			text: stored.text,
			costUsd: stored.costUsd,
			durationMs: stored.durationMs,
			sessionId: stored.sessionId,
		},
		{ type: "done", exitCode: stored.exitCode },
	];
	const replay = async function* (): AsyncGenerator<MuxAgentEvent> {
		for (const event of events) {
			onEvent?.(event);
			yield event;
		}
	};
	const iterator = replay();
	return {
		[Symbol.asyncIterator]: () => iterator,
		async result() {
			for await (const event of iterator) void event;
			return stored;
		},
	};
}

export class MuxMachine {
	readonly sandbox: SandboxHandle;
	readonly harness: HarnessAdapter;
	readonly name?: string;
	readonly attempts: ScoredRouteAttempt[];
	/** Null means the process global; see the constructor note. */
	private readonly placementStore: PlacementStore | null;
	/**
	 * The ranking that produced this placement, with the per-term breakdown
	 * behind each score. Empty when the policy did not run (a pinned substrate,
	 * an explicit `optimize`, or a single surviving lane). `attempts` carries
	 * the headline score; this is where the arithmetic is.
	 */
	readonly selection: LaneScore[];
	private readonly config: MuxConfig;
	private readonly model?: string;

	constructor(input: {
		sandbox: SandboxHandle;
		harness: HarnessAdapter;
		config: MuxConfig;
		name?: string;
		model?: string;
		attempts?: ScoredRouteAttempt[];
		selection?: LaneScore[];
		/**
		 * The store destroy() forgets this placement in. Threaded from the Mux
		 * that built the machine so a tenant-scoped store is honored here too --
		 * otherwise destroy() would fall back to the process global and forget
		 * the WRONG tenant's placement (or none at all).
		 */
		placementStore?: PlacementStore;
	}) {
		this.sandbox = input.sandbox;
		this.harness = input.harness;
		this.config = input.config;
		this.name = input.name;
		this.model = input.model;
		this.attempts = input.attempts ?? [];
		this.selection = input.selection ?? [];
		this.placementStore = input.placementStore ?? null;
	}

	get substrate(): SubstrateKind {
		return this.sandbox.substrate;
	}

	get agent(): HarnessKind {
		return this.harness.kind;
	}

	/**
	 * Ensure the harness CLI is present; installs on first use.
	 *
	 * Installs run detached on the sandbox and are polled for a sentinel
	 * file rather than held open on one connection. Measured 2026-07-31:
	 * a foreground install of hermes (curl installer + Python venv)
	 * outlived E2B's sandbox budget and tripped Sprites' WebSocket
	 * keepalive. Detach-and-poll makes install duration independent of
	 * any connection limit, and the sentinel makes it idempotent.
	 *
	 * Returns whether an install actually ran: `installed: false` is the
	 * probe-passed fast path, which is what makes switchAgent's rollback
	 * ("switch back to the old harness") seconds instead of minutes.
	 */
	async ensureInstalled(
		options: { timeoutMs?: number; pollMs?: number } = {},
	): Promise<{ installed: boolean }> {
		const probeCommand = this.harness.isInstalledCommand();
		let probe: ExecResult;
		try {
			probe = await this.sandbox.exec(probeCommand, { timeoutMs: 30_000 });
		} catch (error) {
			// "The substrate would not RUN the probe" is not "the harness is
			// absent", and this code read the probe's exit status as a BOOLEAN.
			// MEASURED on dedalus 2026-08-05: 4 of 9 create-then-exec sequences
			// (44%) were refused with error_code machine_not_found /
			// machine_not_routable while the machines API reported the same
			// machine phase=running (./providers/dedalus.ts, execRejection).
			// Treated as "not installed" that spends the whole 900s install
			// budget against a machine the substrate just refused to schedule
			// work on, and then blames the HARNESS for a substrate fault. The
			// provider's kind is preserved so failover still routes it.
			throw new MuxError(
				error instanceof MuxError ? error.kind : "transient",
				`cannot tell whether ${this.harness.kind} is installed on ${this.substrate}: the substrate refused to run the probe (${probeCommand}): ${
					error instanceof Error ? error.message : String(error)
				}`,
				{ substrate: this.substrate, harness: this.harness.kind },
			);
		}
		if (probe.exitCode === 0) return { installed: false };

		const budgetMs =
			options.timeoutMs ?? this.harness.installBudgetMs ?? INSTALL_BUDGET_MS;
		const pollMs = options.pollMs ?? INSTALL_POLL_MS;
		// Optional capability: `?.()` yields undefined on substrates that
		// park on their own schedule, so the await must not assume a
		// promise. Failure to extend is not fatal -- the poll loop reports
		// it as a transient install timeout if the sandbox goes away.
		if (this.sandbox.keepAlive) {
			try {
				await this.sandbox.keepAlive(budgetMs + 120_000);
			} catch {
				// Best effort.
			}
		}

		// A substrate that throttles detached work must be driven in the
		// foreground: measured on Sprites 2026-08-01, the same openclaw
		// install finishes in 17s foreground and does not finish in 15
		// MINUTES detached (a curl that takes 0.11s interactively stalls
		// indefinitely inside the detached session). Detaching exists for
		// substrates that enforce request budgets, not as an end in itself.
		if (this.sandbox.capabilities.detachedWork === "throttled") {
			const install = await this.sandbox.exec(this.harness.installCommand(), {
				timeoutMs: budgetMs,
			});
			if (install.exitCode !== 0) {
				throw new MuxError(
					"fatal",
					`${this.harness.kind} install failed on ${this.substrate} (exit ${install.exitCode}): ${
						(install.stderr || install.stdout).trim().slice(-800)
					}`,
					{ substrate: this.substrate, harness: this.harness.kind },
				);
			}
			return { installed: true };
		}

		const tag = `${this.harness.kind}-${Date.now().toString(36)}`;
		const script = `/tmp/am-install-${tag}.sh`;
		const log = `/tmp/am-install-${tag}.log`;
		const done = `/tmp/am-install-${tag}.done`;
		await this.sandbox.writeFile(
			script,
			`#!/usr/bin/env bash\n${this.harness.installCommand()}\n`,
		);
		// stdin from /dev/null so nothing in the install can block reading a
		// terminal. Substrates that launch background work through tmux hand
		// the payload a TTY, and a tool that reads stdin there hangs with an
		// empty log and no sentinel -- indistinguishable from a slow install.
		await this.sandbox.execBackground(
			`bash ${script} > ${log} 2>&1 </dev/null; echo $? > ${done}`,
		);

		const deadline = Date.now() + budgetMs;
		let exitCode: number | null = null;
		while (Date.now() < deadline) {
			await sleep(pollMs);
			const check = await this.sandbox.exec(`cat ${done} 2>/dev/null`, {
				timeoutMs: 30_000,
			});
			const value = check.stdout.trim();
			if (value.length > 0) {
				exitCode = Number.parseInt(value, 10);
				break;
			}
		}
		if (exitCode === null) {
			const tail = await this.tailInstallLog(log);
			throw new MuxError(
				"transient",
				`${this.harness.kind} install did not finish within ${budgetMs}ms on ${this.substrate}${tail}`,
				{ substrate: this.substrate, harness: this.harness.kind },
			);
		}
		if (exitCode !== 0) {
			const tail = await this.tailInstallLog(log);
			throw new MuxError(
				"fatal",
				`${this.harness.kind} install failed on ${this.substrate} (exit ${exitCode})${tail}`,
				{ substrate: this.substrate, harness: this.harness.kind },
			);
		}
		return { installed: true };
	}

	/**
	 * Prove the harness ANSWERS, not merely that its install exited 0.
	 *
	 * `isInstalledCommand` is a `command -v` existence check; a binary can
	 * exist and still fail its own startup (wrong node ABI, half-written
	 * venv). switchAgent and migrate both refuse to persist a placement whose
	 * harness cannot answer this probe, because a placement pointing at a
	 * mute harness is a machine the dashboard says is ready and is not.
	 */
	async probe(): Promise<{ command: string }> {
		const command = this.harness.versionCommand();
		const result = await this.sandbox.exec(command, { timeoutMs: 30_000 });
		if (result.exitCode !== 0) {
			throw new MuxError(
				"fatal",
				`${this.harness.kind} installed but does not answer on ${this.substrate} (exit ${result.exitCode}): ${
					(result.stderr || result.stdout).trim().slice(-500)
				}`,
				{ substrate: this.substrate, harness: this.harness.kind },
			);
		}
		return { command };
	}

	private async tailInstallLog(log: string): Promise<string> {
		const result = await this.sandbox
			.exec(`tail -c 800 ${log} 2>/dev/null`, { timeoutMs: 30_000 })
			.catch(() => null);
		const text = result?.stdout.trim();
		return text ? `: ${text}` : "";
	}

	/**
	 * One agent turn, streamed as normalized events.
	 *
	 * With `runKey` set the turn is idempotent: a retry after a client crash
	 * returns the stored result instead of running the agent again. That
	 * matters because an agent run costs money and can have side effects, so
	 * "just retry it" is not safe by default.
	 */
	run(prompt: string, options: MuxRunOptions = {}): RunStream {
		if (options.runKey) {
			const outcome = claim(options.runKey);
			if (outcome !== "claimed") {
				return replayStream(options.runKey, outcome, options.onEvent);
			}
		}
		const { command, env } = this.harness.runCommand(prompt, this.config.keys, {
			model: options.model ?? this.model ?? this.config.defaults.model,
			cwd: options.cwd,
			extraArgs: options.extraArgs,
			sessionId: options.sessionId,
		});
		const harness = this.harness;
		const sandbox = this.sandbox;
		const timeoutMs = options.timeoutMs ?? this.config.defaults.timeoutMs;
		const startedAt = Date.now();

		let resultResolve: (value: RunResult) => void = () => {};
		let resultReject: (reason: unknown) => void = () => {};
		const resultPromise = new Promise<RunResult>((res, rej) => {
			resultResolve = res;
			resultReject = rej;
		});
		// A caller may consume only the iterator or only result().
		resultPromise.catch(() => {});

		const lines = new LineBuffer();
		const stderrTail: string[] = [];
		let exitCode = 0;
		let finalText = "";
		let costUsd: number | undefined;
		let sessionId: string | undefined;
		let eventCount = 0;
		let timeToFirstEventMs: number | undefined;
		let sawError: string | undefined;
		let completed = false;
		let settled = false;

		/** Fold one event into the run result. */
		const absorb = (event: MuxAgentEvent): void => {
			// Only parsed harness events reach absorb -- the synthetic error and
			// done events the stream appends do not -- so this is the first
			// output a caller could actually render, not the first byte off the
			// wire. RunResult.timeToFirstEventMs documents why that is the
			// measurement we report.
			timeToFirstEventMs ??= Date.now() - startedAt;
			if (event.type === "result") {
				finalText = event.text || finalText;
				costUsd = event.costUsd ?? costUsd;
				sessionId = event.sessionId ?? sessionId;
			}
			if (event.type === "text") finalText += event.delta;
			if (event.type === "error") sawError = event.message;
		};

		/**
		 * Resolve exactly once, from either the normal end of the stream or
		 * the generator being closed early. `truncated` tells the caller the
		 * text is partial, so an aborted run is never mistaken for success.
		 */
		const settle = (): void => {
			if (settled) return;
			settled = true;
			const finished: RunResult = {
				text: finalText,
				exitCode,
				costUsd,
				durationMs: Date.now() - startedAt,
				timeToFirstEventMs,
				sessionId,
				events: eventCount,
				substrate: sandbox.substrate,
				harness: harness.kind,
				truncated: !completed,
			};
			// Trace before resolving so a caller that immediately exits on the
			// result cannot race the write. Neither tracing nor claim
			// bookkeeping may fail a run that already produced output.
			try {
				const trace = appendTrace(
					traceFromRun({
						runKey: options.runKey,
						result: finished,
						attempts: this.attempts,
						error: sawError,
					}),
				);
				// One money record per run, keyed to the same id as the trace so
				// the two can be reconciled. The model half is "metered" only
				// because the harness reported it; when it did not, the honest
				// branch says unknown rather than zero, which keeps the run's
				// total absent instead of under-billing it. Margin is left
				// undeclared on purpose -- there is no margin policy yet, and an
				// undeclared policy is unknown, not free (see ledger.ts).
				appendCharge({
					runKey: trace.runKey,
					harness: finished.harness,
					substrate: finished.substrate,
					sandbox: { basis: "duration", durationMs: finished.durationMs },
					model:
						finished.costUsd === undefined
							? {
									unknown: `${finished.harness} reported no cost for this turn`,
								}
							: {
									usd: finished.costUsd,
									provenance: "metered",
									rate: {
										id: `${finished.harness}:reported`,
										source: "harness-reported cost for the turn",
									},
								},
				});
			} catch {
				// Observability and metering are best effort: neither may fail a
				// run that already produced output.
			}
			if (options.runKey) {
				try {
					if (completed) completeClaim(options.runKey, finished);
					else releaseClaim(options.runKey);
				} catch {
					// A stuck claim frees itself via the stale timeout.
				}
			}
			resultResolve(finished);
		};

		const iterate = async function* (): AsyncGenerator<MuxAgentEvent> {
			const parseLine =
				harness.newTurnParser?.() ??
				((line: string) => harness.parseLine(line));
			try {
				const stream = sandbox.execStream(command, {
					timeoutMs,
					env,
					signal: options.signal,
				});
				for await (const chunk of stream) {
					if (chunk.type === "stderr") {
						stderrTail.push(chunk.data);
						if (stderrTail.length > 40) stderrTail.shift();
						continue;
					}
					if (chunk.type === "exit") {
						exitCode = chunk.exitCode;
						break;
					}
					for (const line of lines.push(chunk.data)) {
						for (const event of parseLine(line)) {
							eventCount += 1;
							absorb(event);
							options.onEvent?.(event);
							yield event;
						}
					}
				}
				for (const line of lines.flush()) {
					for (const event of parseLine(line)) {
						eventCount += 1;
						absorb(event);
						options.onEvent?.(event);
						yield event;
					}
				}
				if (exitCode !== 0 && !sawError) {
					const message = `${harness.kind} exited ${exitCode}: ${stderrTail.join("").slice(-500)}`;
					const event: MuxAgentEvent = { type: "error", message };
					options.onEvent?.(event);
					yield event;
				}
				completed = true;
				const done: MuxAgentEvent = { type: "done", exitCode };
				options.onEvent?.(done);
				yield done;
				settle();
			} catch (error) {
				resultReject(error);
				throw error;
			} finally {
				// A caller that breaks out of the iteration closes this
				// generator, which resumes the suspended yield with a return
				// completion and skips both the resolve above and the catch.
				// Settling here is what keeps result() from hanging forever.
				settle();
			}
		};

		const iterator = iterate();
		return {
			[Symbol.asyncIterator]() {
				return iterator;
			},
			async result() {
				// Drain whatever is left; a closed generator returns at once.
				for await (const _event of iterator) {
					void _event;
				}
				settle();
				return resultPromise;
			},
		};
	}

	/** Interactive agent terminal (native PTY or tmux fallback). */
	async pty(options: PtyOptions = {}): Promise<PtyHandle> {
		const { command, env } = this.harness.interactiveCommand(this.config.keys, {
			model: this.model ?? this.config.defaults.model,
		});
		return this.sandbox.openPty({
			...options,
			command: options.command ?? command,
			env: { ...env, ...options.env },
		});
	}

	/** Raw shell PTY on the sandbox. */
	async shell(options: PtyOptions = {}): Promise<PtyHandle> {
		return this.sandbox.openPty(options);
	}

	async destroy(): Promise<void> {
		await this.sandbox.destroy();
		if (this.name) {
			await (this.placementStore ?? getPlacementStore()).forget(this.name);
		}
	}
}

export class Mux {
	readonly config: MuxConfig;
	/**
	 * The circuit breaker. Not `readonly`: under an async store it is replaced
	 * once, by `ensureHealth()`, with what the store had persisted. Readers get
	 * an empty breaker until then rather than a promise.
	 */
	health: SubstrateHealth;
	/** False only between construction and the first `ensureHealth()`. */
	private healthLoaded: boolean;
	/**
	 * Null means "use the process global". Resolved per call rather than
	 * captured at construction, because the global is legitimately swapped by
	 * tests and by the CLI between operations.
	 */
	private readonly placementStore: PlacementStore | null;
	/** Learned lane ordering for "auto" routes; null disables it entirely. */
	readonly selection: SelectionPolicy | null;
	private readonly providers = new Map<SubstrateKind, SandboxProvider>();
	private readonly persistHealth: boolean;
	/** Prices from the most recent routeFor(), for attempt annotation. */
	private lastPriced = new Map<SubstrateKind, number | undefined>();
	/** Scores from the most recent routeFor(), for attempt annotation. */
	private lastScored = new Map<SubstrateKind, LaneScore>();

	constructor(config: MuxConfig, options: CreateMuxOptions = {}) {
		this.config = config;
		// Restored from the shared store so a substrate that was failing stays
		// de-prioritized for the next process. Injectable for tests.
		//
		// A constructor cannot await, and a hosted store's read is a network
		// round trip -- so the load is synchronous only when the store says it
		// can be. Under the local JSON store (every CLI and SDK caller today)
		// that is the same eager load as before, byte for byte: `routeFor()`
		// called immediately after `createMux()` still sees persisted health.
		// Under an async store the breaker starts empty and `ensureHealth()`
		// fills it before the first operation that can be influenced by it.
		this.placementStore = options.placementStore ?? null;
		const store = this.store();
		if (options.health) {
			this.health = options.health;
			this.healthLoaded = true;
		} else if (store.synchronous) {
			this.health = SubstrateHealth.fromJSON(readMuxState().health);
			this.healthLoaded = true;
		} else {
			this.health = new SubstrateHealth();
			this.healthLoaded = false;
		}
		this.persistHealth = options.persistHealth ?? options.health === undefined;
		// Default on: `sandbox: "auto"` is the common case and the roadmap's
		// automatic selection. With an empty trace store every lane scores the
		// prior identically, so a fresh install still walks the configured
		// order -- turning this on cannot change behavior before it has
		// evidence. `null` opts out.
		this.selection =
			options.selection === undefined ? new SelectionPolicy() : options.selection;
	}

	/**
	 * Load persisted health when the store could not be read in the constructor.
	 *
	 * Called at the top of every operation whose result health can change. The
	 * flag is set BEFORE the read, not after: a store that is failing must cost
	 * one attempt, not one per call, and an empty breaker only means the
	 * configured order is used -- health never removes a lane, so degrading to
	 * "no history" is safe where degrading to "retry forever" would not be.
	 */
	/** This mux's store: the injected one, else the process global. */
	private store(): PlacementStore {
		return this.placementStore ?? getPlacementStore();
	}

	private async readPlacements(): Promise<Awaited<ReturnType<PlacementStore["read"]>>> {
		return this.store().read();
	}

	private async remember(
		name: string,
		placement: Parameters<PlacementStore["remember"]>[1],
	): Promise<void> {
		await this.store().remember(name, placement);
	}

	private async forget(name: string): Promise<void> {
		await this.store().forget(name);
	}

	private async ensureHealth(): Promise<void> {
		if (this.healthLoaded) return;
		this.healthLoaded = true;
		try {
			this.health = SubstrateHealth.fromJSON((await this.readPlacements()).health);
		} catch {
			// Keep the empty breaker constructed above.
		}
	}

	/** Record a lane outcome and persist the breaker. */
	private async noteHealth(
		substrate: SubstrateKind,
		outcome: "ok" | "transient" | "fatal",
		latencyMs?: number,
	): Promise<void> {
		this.health.record(substrate, outcome, latencyMs);
		if (!this.persistHealth) return;
		try {
			await this.store().saveHealth(this.health.toJSON());
		} catch {
			// Losing a sample only delays opening a circuit; never fail a
			// create() because the store could not be written.
		}
	}

	provider(kind: SubstrateKind): SandboxProvider {
		let provider = this.providers.get(kind);
		if (!provider) {
			provider = getProvider(kind, this.config);
			this.providers.set(kind, provider);
		}
		return provider;
	}

	/** Dependency-injection hook for tests and custom substrates. */
	registerProvider(kind: SubstrateKind, provider: SandboxProvider): void {
		this.providers.set(kind, provider);
	}

	/**
	 * Ordered route for a create() call, in five stages: drop lanes without
	 * credentials, drop lanes that cannot satisfy declared constraints, order
	 * by price when asked, order by learned value on an "auto" route, then
	 * order by health so a failing lane is tried last.
	 *
	 * Only the two filters ever remove a lane. Both ordering stages and the
	 * health stage return permutations, because a global blip that opened every
	 * circuit -- or a policy that has learned to dislike every lane -- must not
	 * make create() impossible.
	 *
	 * Health stays LAST on purpose. It is a safety override answering "is this
	 * lane up right now", which is a different and more urgent question than
	 * "which lane pays off"; a lane whose breaker is open goes to the back
	 * however good its history looks.
	 */
	routeFor(
		sandbox?: SubstrateKind | "auto",
		options: {
			constraints?: RouteConstraints;
			optimize?: "cost";
			/** Harness the lanes are scored for; defaults to the configured one. */
			agent?: HarnessKind;
		} = {},
	): {
		candidates: SubstrateKind[];
		skipped: RouteAttempt[];
		/** Learned ranking, best first. Absent when the policy did not run. */
		selection?: LaneScore[];
	} {
		const requested =
			!sandbox || sandbox === "auto"
				? [this.config.sandboxes.primary, ...this.config.sandboxes.backups]
				: [sandbox];
		let candidates: SubstrateKind[] = [];
		const skipped: RouteAttempt[] = [];
		for (const kind of requested) {
			const readiness = this.provider(kind).ready();
			if (readiness.ok) {
				candidates.push(kind);
			} else {
				skipped.push({
					substrate: kind,
					outcome: "skipped",
					reason: `missing credentials: ${readiness.missing.join(", ")}`,
				});
			}
		}

		if (options.constraints && candidates.length > 0) {
			const profiles = candidates.map((kind) =>
				profileFor(kind, this.provider(kind).capabilities),
			);
			const filtered = filterCandidates(profiles, options.constraints);
			candidates = [...filtered.accepted];
			skipped.push(...asSkippedAttempts(filtered.rejected));
		}

		// Modeled price per lane, kept so an attempt can explain what the
		// route was expected to cost. Unknown-price lanes sort last rather
		// than pretending unknown means cheap.
		const priced = new Map<SubstrateKind, number | undefined>();
		if (options.optimize === "cost" && candidates.length > 1) {
			const ordered = cheapestFirst(candidates);
			candidates = ordered.map((entry) => entry.substrate);
			for (const entry of ordered) priced.set(entry.substrate, entry.totalUsd);
		}
		this.lastPriced = priced;

		// Learned ordering, and ONLY for an "auto" route. A pinned substrate is
		// the caller's escape hatch and must come back exactly as asked -- not
		// reordered, and not annotated with a score, because the policy did not
		// make that choice and must not appear to have. `optimize` is likewise
		// an explicit objective the policy does not get to override.
		const scored = new Map<SubstrateKind, LaneScore>();
		let selection: LaneScore[] | undefined;
		const auto = !sandbox || sandbox === "auto";
		if (
			this.selection &&
			auto &&
			options.optimize === undefined &&
			candidates.length > 1
		) {
			try {
				const ranked = this.selection.rank(
					options.agent ?? this.config.agents.default,
					candidates,
				);
				candidates = ranked.map((lane) => lane.substrate);
				for (const lane of ranked) scored.set(lane.substrate, lane);
				selection = ranked;
			} catch {
				// Selection is an optimization computed from observability data.
				// A corrupt or unreadable trace store must cost us the ordering,
				// never the create(): the configured order is still a valid route.
			}
		}
		this.lastScored = scored;

		// Health last, so a lane that is failing right now goes to the back of
		// whatever order the stages above produced -- price, learned value, or
		// the operator's configured preference. It only reorders, never removes.
		candidates = [...this.health.order(candidates)];
		return selection === undefined
			? { candidates, skipped }
			: { candidates, skipped, selection };
	}

	/**
	 * Learned-policy annotations for one lane's attempt, empty when the policy
	 * did not score it. Empty rather than zeroed: a score of 0 is a lane the
	 * policy rated worthless, which is a different fact from not having run.
	 */
	private scoreOf(kind: SubstrateKind): Partial<ScoredRouteAttempt> {
		const lane = this.lastScored.get(kind);
		if (!lane) return {};
		return {
			selectionScore: lane.score,
			selectionSamples: lane.samples,
			selectionPolicy: lane.policy,
		};
	}

	/**
	 * Create (or reuse by name) a machine running the requested harness,
	 * failing over across the substrate route on provisioning errors.
	 */
	async create(options: MuxCreateOptions = {}): Promise<MuxMachine> {
		const agent = options.agent ?? this.config.agents.default;
		const harness = getHarness(agent);
		this.assertUpstream(agent);
		// Before routeFor, which orders lanes by health.
		await this.ensureHealth();

		const { candidates, skipped, selection } = this.routeFor(options.sandbox, {
			constraints: options.constraints,
			optimize: options.optimize,
			agent,
		});
		const attempts: ScoredRouteAttempt[] = [...skipped];
		if (candidates.length === 0) {
			throw new MuxError(
				"missing_credentials",
				`No sandbox provider is credentialed for route [${
					(options.sandbox && options.sandbox !== "auto"
						? [options.sandbox]
						: [this.config.sandboxes.primary, ...this.config.sandboxes.backups]
					).join(" -> ")
				}]. ${attempts.map((a) => `${a.substrate}: ${a.reason}`).join("; ")}`,
			);
		}

		const createOptions: CreateSandboxOptions = {
			name: options.name,
			env: options.env,
			timeoutMs: options.timeoutMs,
			template: options.template,
			resources: options.resources,
		};

		let lastError: unknown;
		for (const kind of candidates) {
			const startedAt = Date.now();
			// Tracked so a failure *after* provisioning (install, remember)
			// tears the sandbox down instead of leaving it billing while the
			// router moves on to the next lane.
			let provisioned: SandboxHandle | null = null;
			try {
				provisioned = await this.provider(kind).create(createOptions);
				const machine = new MuxMachine({
					placementStore: this.placementStore ?? undefined,
					sandbox: provisioned,
					harness,
					config: this.config,
					name: options.name,
					model: options.model,
					attempts,
					selection,
				});
				if (options.install !== false) {
					await machine.ensureInstalled();
				}
				if (options.name) {
					await this.remember(options.name, {
						substrate: kind,
						sandboxId: provisioned.id,
						agent,
					});
				}
				const okMs = Date.now() - startedAt;
				await this.noteHealth(kind, "ok", okMs);
				attempts.push({
					substrate: kind,
					outcome: "ok",
					durationMs: okMs,
					health: this.health.state(kind),
					estimatedUsd: this.lastPriced.get(kind),
					...this.scoreOf(kind),
				});
				return machine;
			} catch (error) {
				if (provisioned) {
					// Best effort: a teardown failure must not mask the real
					// error, but it is recorded so a leak is not silent.
					const orphan = provisioned;
					try {
						await orphan.destroy();
					} catch (teardownError) {
						attempts.push(await this.teardownAttempt(kind, orphan.id, teardownError));
					}
				}
				// A credential or capability failure says nothing about the
				// substrate's health, so it must not open a circuit -- only
				// transport-class outcomes do.
				const signal = outcomeForError(error);
				if (signal) await this.noteHealth(kind, signal, Date.now() - startedAt);
				attempts.push({
					substrate: kind,
					outcome: "failed",
					reason: error instanceof Error ? error.message : String(error),
					durationMs: Date.now() - startedAt,
					health: this.health.state(kind),
					estimatedUsd: this.lastPriced.get(kind),
					...this.scoreOf(kind),
				});
				lastError = error;
				if (!isRoutableError(error)) throw error;
			}
		}
		void lastError;
		throw new MuxError(
			"fatal",
			`All sandbox routes failed: ${attempts
				.map((a) => `${a.substrate}=${a.outcome}${a.reason ? ` (${a.reason})` : ""}`)
				.join(", ")}`,
		);
	}

	/**
	 * What THIS mux remembers: name -> substrate / sandboxId / agent.
	 *
	 * `readMuxState()` and `readMuxStateAsync()` read the PROCESS GLOBAL store,
	 * so a mux constructed with `placementStore` -- the hosted plane's tenant
	 * scoping, web/lib/mux/hosted-mux.ts -- could not be asked what it
	 * remembered: a reader had to reach around the router to the store object it
	 * happened to pass in, and a reader that never goes through the router
	 * cannot notice that the router is reading a DIFFERENT (global, wrong
	 * tenant) store. This closes that hole for the same reason `describe()`
	 * exists rather than `connect()`: reads must be cheap and side-effect free.
	 * One store round trip, no provider call, no wake, nothing billed.
	 */
	async placements(): Promise<Record<string, RememberedMachine>> {
		return (await this.readPlacements()).machines;
	}

	/**
	 * Status of a remembered machine WITHOUT waking it.
	 *
	 * `connect()` resumes on e2b and vercel, so using it to answer "what state
	 * is this in?" wakes and bills a parked sandbox just for being looked at.
	 * This goes through the provider's no-wake read instead. Substrates that
	 * cannot read status without resuming omit `describe`, and this reports
	 * that rather than resuming behind the caller's back.
	 */
	async describe(name: string): Promise<SandboxDescription> {
		const remembered = await this.rememberedOrThrow(name);
		const provider = this.provider(remembered.substrate);
		if (!provider.describe) {
			throw new MuxError(
				"not_supported",
				`${remembered.substrate} cannot report status without resuming the sandbox; connect() would wake and bill it`,
				{ substrate: remembered.substrate },
			);
		}
		return provider.describe(remembered.sandboxId);
	}

	/**
	 * Destroy a remembered machine without resuming it first.
	 *
	 * The old path was connect() then destroy(), which resumes on e2b and
	 * vercel: wasted billing, and a sandbox whose snapshot cannot resume
	 * becomes undestroyable -- the orphaned-quota failure in
	 * POSTMORTEM-2026-05-18 item 5. The placement is forgotten whatever
	 * happens to the sandbox, because a remembered name whose sandbox is
	 * already gone can otherwise never be cleaned up.
	 */
	async remove(name: string): Promise<{ removed: boolean; resumed: boolean }> {
		const remembered = await this.rememberedOrThrow(name);
		const provider = this.provider(remembered.substrate);
		try {
			let resumed = false;
			if (provider.remove) {
				await provider.remove(remembered.sandboxId);
			} else {
				// No no-wake teardown here: fall back, but report it, so a caller
				// can tell a paid resume happened.
				const handle = await provider.connect(remembered.sandboxId);
				await handle.destroy();
				resumed = true;
			}
			await this.forget(name);
			return { removed: true, resumed };
		} catch (error) {
			// Forget ONLY when the substrate says the sandbox is gone. Any other
			// failure may leave it alive and billing, and a placement that has
			// been forgotten cannot be retried by name -- which is how a machine
			// becomes the invisible orphan of POSTMORTEM-2026-05-18 item 5.
			// Measured on Dedalus 2026-08-02: destroy returned a 500 from the
			// vendor's own metering ledger ("column
			// org_metering_buckets.stripe_submitted_at does not exist"), which
			// says nothing about whether the machine survived.
			if (error instanceof MuxError && error.kind === "fatal" && /not found/i.test(error.message)) {
				await this.forget(name);
				return { removed: true, resumed: false };
			}
			throw error;
		}
	}

	/**
	 * Park a remembered machine, where the substrate can pause by id.
	 *
	 * Omitted rather than faked on sprites (its SDK has no suspend; restart()
	 * replaces the machine) and dedalus (sleep is an HMAC-gated internal route
	 * a public key cannot call), so this reports not_supported there instead of
	 * resolving as though it parked something.
	 */
	async park(name: string): Promise<void> {
		const remembered = await this.rememberedOrThrow(name);
		const provider = this.provider(remembered.substrate);
		if (!provider.park) {
			throw new MuxError(
				"not_supported",
				`${remembered.substrate} cannot park a sandbox by id`,
				{ substrate: remembered.substrate },
			);
		}
		await provider.park(remembered.sandboxId);
	}

	private async rememberedOrThrow(name: string) {
		const remembered = (await this.readPlacements()).machines[name];
		if (!remembered) {
			throw new MuxError("fatal", `No remembered machine named "${name}".`);
		}
		return remembered;
	}

	/**
	 * Reconnect to a machine created earlier with a name.
	 *
	 * The `agent` override is PER-CONNECTION and ephemeral: it changes which
	 * harness this handle drives, but it installs nothing and writes nothing
	 * -- the placement still remembers the old agent, and the next
	 * connect(name) gets the old harness back. Use `switchAgent()` when the
	 * change should install, be verified, and persist.
	 */
	async connect(name: string, agent?: HarnessKind): Promise<MuxMachine> {
		const remembered = (await this.readPlacements()).machines[name];
		if (!remembered) {
			throw new MuxError("fatal", `No remembered machine named "${name}".`);
		}
		const sandbox = await this.provider(remembered.substrate).connect(
			remembered.sandboxId,
		);
		return new MuxMachine({
			placementStore: this.placementStore ?? undefined,
			sandbox,
			harness: getHarness(agent ?? remembered.agent),
			config: this.config,
			name,
		});
	}

	/**
	 * Switch which harness answers on a remembered machine -- the agent
	 * router's persisting verb.
	 *
	 * The sandbox and its load stay put; the target harness is installed
	 * (reusing ensureInstalled's budgets, the detached-poll path, and the
	 * sprites foreground-install trap unchanged), proven to ANSWER via its
	 * version probe, and only then written to the placement. Every failure
	 * before that write leaves the placement byte-identical, so a broken
	 * switch can never relabel a machine whose new harness does not run --
	 * the exact defect the hosted PATCH-agentKind path had (it rewrote the
	 * record and never touched the sandbox).
	 *
	 * The old harness is NEVER uninstalled. Rollback is therefore
	 * switchAgent(name, oldAgent): the isInstalled probe passes, the version
	 * probe re-proves it, and the placement flips back -- seconds, no
	 * install.
	 *
	 * A parked sandbox IS woken: describe() exists because reads must not
	 * wake, but a switch is a write and is meaningless against a stopped
	 * filesystem -- installing needs a running sandbox. Failing on parked
	 * would make switchAgent unusable on every idle machine; a caller who
	 * cares about the wake cost calls mux.describe(name) first. Where the
	 * provider has describe(), it is read pre-connect to fill the report's
	 * `woke`; where not, "unknown" -- never invented.
	 */
	async switchAgent(
		name: string,
		agent: HarnessKind,
		options: { timeoutMs?: number; pollMs?: number } = {},
	): Promise<SwitchReport> {
		const remembered = await this.rememberedOrThrow(name);
		// Fail closed BEFORE connect: a harness with no drivable upstream must
		// not cost a wake (the same gate create() runs before provisioning).
		this.assertUpstream(agent);

		// Same claim key as migrate(), so the two verbs exclude each other per
		// machine. Without it, this method's install window (6s to the full
		// 15-minute budget) is long enough for a migrate to commit and destroy
		// the source sandbox -- and the placement write below would then
		// resurrect a pointer to the destroyed box while the load sits
		// unreachable on the new one.
		const claimKey = machineOpClaimKey(name);
		if (claim(claimKey) !== "claimed") {
			throw new MuxError(
				"transient",
				`another migrate/switch of "${name}" is already in flight; retry after it settles`,
			);
		}
		try {
			return await this.switchAgentClaimed(name, agent, remembered, options);
		} finally {
			releaseClaim(claimKey);
		}
	}

	private async switchAgentClaimed(
		name: string,
		agent: HarnessKind,
		remembered: RememberedMachine,
		options: { timeoutMs?: number; pollMs?: number },
	): Promise<SwitchReport> {
		const provider = this.provider(remembered.substrate);
		let woke: boolean | "unknown" = "unknown";
		if (provider.describe) {
			try {
				const state = (await provider.describe(remembered.sandboxId)).state;
				if (state === "sleeping") woke = true;
				else if (state === "ready") woke = false;
			} catch {
				// Informational only: connect() below is the authoritative
				// operation, and its error is the one worth surfacing.
			}
		}

		const sandbox = await provider.connect(remembered.sandboxId);
		const machine = new MuxMachine({
			placementStore: this.placementStore ?? undefined,
			sandbox,
			harness: getHarness(agent),
			config: this.config,
			name,
		});
		const { installed } = await machine.ensureInstalled({
			timeoutMs: options.timeoutMs,
			pollMs: options.pollMs,
		});
		// Install success without an answering harness never persists: probe
		// throws before the placement write, so the record cannot claim an
		// agent that does not run.
		const probe = await machine.probe();

		// Re-read before committing. The claim already excludes migrate() in
		// this process and any other process using the same claims directory;
		// this guards the remaining writers (a raw rememberMachine/forget from
		// a script, a second host with a different claims dir). The stale
		// snapshot must never be re-asserted over a placement that moved.
		const current = (await this.readPlacements()).machines[name];
		if (!current) {
			throw new MuxError(
				"fatal",
				`"${name}" was removed while switching agents; the ${agent} install on ${remembered.substrate}/${remembered.sandboxId} is orphaned but the placement was already gone`,
			);
		}
		if (
			current.substrate !== remembered.substrate ||
			current.sandboxId !== remembered.sandboxId
		) {
			throw new MuxError(
				"fatal",
				`"${name}" moved to ${current.substrate}/${current.sandboxId} while switching agents on ${remembered.substrate}/${remembered.sandboxId}; re-run switchAgent against the new placement`,
			);
		}

		const changed = agent !== current.agent;
		if (changed) {
			// The store's per-key upsert is the atomic commit. If this write
			// fails the error propagates and the placement is unchanged (the
			// store refused atomically); the new harness staying installed is
			// harmless -- installs are idempotent -- and a retry hits the
			// isInstalled fast path and just flips the record.
			await this.remember(name, {
				substrate: current.substrate,
				sandboxId: current.sandboxId,
				agent,
			});
		}
		return {
			name,
			substrate: current.substrate,
			sandboxId: current.sandboxId,
			from: remembered.agent,
			to: agent,
			changed,
			installed,
			probe,
			woke,
		};
	}

	/**
	 * Move a remembered machine's load to another substrate -- the sandbox
	 * router's persisting verb.
	 *
	 * The name and the agent survive; the sandboxId changes. What moves is
	 * the $HOME-relative FILE state (src/mux/statemove.ts is the one source
	 * of truth for the list); toolchains and credentials are re-derived, and
	 * running processes are declared lost in the report. This is never
	 * marketed as full-disk or live migration: fork is unexposed on every
	 * substrate and e2b's RAM snapshot cannot leave the vendor.
	 *
	 * POINT OF NO RETURN = the rememberMachineAsync at the commit step. The
	 * state is COPIED, never destructively moved, so every failure before
	 * commit destroys the NEW sandbox best-effort and leaves the ORIGINAL
	 * placement intact and addressable. The old sandbox is touched
	 * destructively only AFTER the commit -- and by its raw id through the
	 * provider, never via mux.remove(name), because the name now points at
	 * the new sandbox.
	 */
	async migrate(name: string, options: MigrateOptions): Promise<MigrateReport> {
		const remembered = await this.rememberedOrThrow(name);
		// migrate never changes the agent; switchAgent is the other verb, and
		// composing both in one call would create two points of no return.
		const agent = remembered.agent;
		if (options.to === remembered.substrate) {
			throw new MuxError(
				"fatal",
				`"${name}" is already on ${options.to}; migrate moves between substrates, and a same-lane rebuild reported as a migration would lie. Rebuild/refresh is a different operation.`,
				{ substrate: options.to },
			);
		}
		const progress = options.onProgress ?? (() => {});
		progress({
			step: "gate",
			detail: `${agent} from ${remembered.substrate}:${remembered.sandboxId} to ${options.to}`,
		});

		// One migration per name at a time, via the same exclusive-create
		// registry run keys use (traces.ts). Two concurrent migrations would
		// race the commit and one would destroy a sandbox the other just
		// committed to.
		//
		// The key is shared with switchAgent, not migrate-private: the verbs
		// race EACH OTHER too. A switch that snapshots the placement, spends
		// 6s-15min in connect+install, and then re-asserts its stale snapshot
		// would silently clobber a migrate that committed and destroyed the
		// source inside that window -- placement pointing at a destroyed
		// sandbox, the migrated load stranded live but unreachable, both verbs
		// reporting success. (Found by an adversarial review 2026-08-03; the
		// hosted plane already 409s on exactly this overlap.)
		const claimKey = machineOpClaimKey(name);
		if (claim(claimKey) !== "claimed") {
			throw new MuxError(
				"transient",
				`another migrate/switch of "${name}" is already in flight; retry after it settles`,
			);
		}
		try {
			const moveState = options.moveState !== false;
			const plan = MOVE_ALLOWLIST(agent);

			// Credential + upstream gate AND target provisioning in one step,
			// by delegating to create() with the lane pinned: an uncredentialed
			// target throws missing_credentials naming the exact missing keys
			// BEFORE the source is connected or woken; install reuses budgets
			// and the sprites foreground trap; health and attempts are
			// recorded; and a post-provision install failure already tears the
			// fresh sandbox down (create()'s provisioned-teardown branch).
			// Deliberately NO name: a named create would rememberMachineAsync
			// BEFORE verification, clobbering the placement -- the exact
			// premature commit this ordering exists to prevent.
			progress({ step: "provision", detail: `pinned lane ${options.to}, via create()` });
			const target = await this.create({
				agent,
				sandbox: options.to,
				install: true,
				env: options.env,
				resources: options.resources,
				template: options.template,
			});
			progress({ step: "install", detail: `${agent} installed inside create()` });
			const newId = target.sandbox.id;
			const attempts: ScoredRouteAttempt[] = [...target.attempts];

			const marker: MigrationMarker = {
				name,
				fromSubstrate: remembered.substrate,
				fromSandboxId: remembered.sandboxId,
				nonce: randomUUID(),
				at: new Date().toISOString(),
			};
			let moved: string[] = [];
			let skipped: Array<{ path: string; reason: string }> = [];
			let bytes = 0;
			let markerVerified: boolean | "skipped" = "skipped";
			let probeCommand = "";

			try {
				if (moveState) {
					progress({
						step: "export",
						detail: `allowlist tar off ${remembered.substrate}:${remembered.sandboxId}`,
					});
					// Connecting WAKES a parked source; a migration is a write
					// and cannot read a stopped filesystem.
					const source = await this.provider(remembered.substrate).connect(
						remembered.sandboxId,
					);
					if (source.keepAlive) {
						try {
							// The export must outlive the source's idle budget;
							// failure to extend surfaces later as a transient
							// export error, which is retryable.
							await source.keepAlive(DEFAULT_TAR_TIMEOUT_MS + 120_000);
						} catch {
							// Best effort.
						}
					}
					const oldHome = await readHome(source);
					// The ONLY source mutation before commit: additive and
					// harmless. Written before the tar so it rides it.
					await writeMarker(source, marker);
					const presence = await probeIncludes(source, plan.include);
					// The marker is the verification vehicle, not user load;
					// reporting it under `moved` would pad the list.
					moved = presence.present.filter((path) => path !== MIGRATION_MARKER_PATH);
					skipped = presence.skipped;
					const tarPath = `/tmp/am-migrate-${marker.nonce}.tgz`;
					const build = await source.exec(
						buildExportCommand({ include: presence.present, exclude: plan.exclude }, tarPath),
						{ timeoutMs: DEFAULT_TAR_TIMEOUT_MS },
					);
					if (build.exitCode !== 0) {
						throw new MuxError(
							"transient",
							`state export tar failed on ${remembered.substrate} (exit ${build.exitCode}): ${
								(build.stderr || build.stdout).trim().slice(-500)
							}`,
							{ substrate: remembered.substrate, harness: agent },
						);
					}
					const exported = await exportTar(source, tarPath, { include: presence.present });
					bytes = exported.bytes.length;
					// Best-effort tidy; the tar under /tmp is already declared
					// lost state and costs nothing if it stays.
					await source.exec(`rm -f '${tarPath}'`, { timeoutMs: 30_000 }).catch(() => {});

					progress({ step: "restore", detail: `${bytes} bytes onto ${options.to}:${newId}` });
					await restoreTar(target.sandbox, exported.bytes, {
						sha256: exported.sha256,
						agent,
						...(oldHome ? { oldHome } : {}),
					});
				}

				progress({ step: "verify" });
				probeCommand = (await target.probe()).command;
				if (moveState) {
					const verdict = await verifyMarker(target.sandbox, marker);
					if (!verdict.ok) {
						throw new MuxError(
							"fatal",
							`migration marker check failed on ${options.to}: ${verdict.reason}`,
							{ substrate: options.to, harness: agent },
						);
					}
					markerVerified = true;
				}

				// COMMIT -- the point of no return. The store's per-key upsert
				// is atomic: readers see the old placement or the new one,
				// never a gap. A failed write lands in the catch below, which
				// destroys the NEW sandbox -- safe, because the state was
				// copied and the source still holds everything.
				progress({ step: "commit", detail: `"${name}" -> ${options.to}:${newId}` });
				await this.remember(name, {
					substrate: options.to,
					sandboxId: newId,
					agent,
				});
			} catch (error) {
				// Any pre-commit failure: the new sandbox is torn down
				// best-effort so a failed migration does not leave a second
				// machine billing, and the ORIGINAL placement is untouched and
				// addressable. A teardown failure is recorded, never allowed
				// to mask the real error.
				try {
					await target.sandbox.destroy();
				} catch (teardownError) {
					attempts.push(await this.teardownAttempt(options.to, newId, teardownError));
				}
				throw error;
			}

			// Post-commit source disposition: best-effort, reported, never
			// silent -- and never a failure of the migration itself, because
			// the load is already safe on the new sandbox.
			progress({ step: "source", detail: options.source ?? "destroy" });
			const source = await this.disposeSource(remembered, options.source ?? "destroy");

			return {
				name,
				agent,
				from: { substrate: remembered.substrate, sandboxId: remembered.sandboxId },
				to: { substrate: options.to, sandboxId: newId },
				state: {
					moved,
					rederived: REDERIVED(agent),
					// moveState:false is the honest "fresh box, same agent,
					// same name" outcome: the ENTIRE file-state contract is
					// enumerated under lost, not implied.
					lost: moveState
						? lostState(remembered.substrate)
						: [...plan.include, ...lostState(remembered.substrate)],
					skipped,
					bytes,
					notes: MOVE_NOTES(agent),
				},
				verified: { probe: probeCommand, marker: markerVerified },
				source,
				attempts,
			};
		} finally {
			releaseClaim(claimKey);
		}
	}

	/**
	 * What happens to the OLD sandbox after a committed migration.
	 *
	 * Always by raw sandbox id through the provider -- NEVER mux.remove(name),
	 * because the name now points at the NEW sandbox and removing it by name
	 * would destroy the machine the migration just produced. A confirmed
	 * not-found counts as destroyed (the remove() rule: the requested end
	 * state already holds); a failure the substrate then confirms took effect
	 * counts as destroyed too (see confirmTornDown); anything left reports the
	 * orphan's id and substrate instead of failing a migration whose load is
	 * already safe.
	 */
	private async disposeSource(
		remembered: { substrate: SubstrateKind; sandboxId: string },
		action: "destroy" | "park" | "keep",
	): Promise<MigrateReport["source"]> {
		const provider = this.provider(remembered.substrate);
		if (action === "keep") {
			return { action: "kept" };
		}
		if (action === "park") {
			if (!provider.park) {
				// Fail honest, not silent: sprites and dedalus cannot park by
				// id, and resolving as "parked" would report a pause that
				// never happened while the sandbox keeps billing.
				return {
					action: "kept",
					error: `${remembered.substrate} cannot park a sandbox by id (not_supported); the source sandbox ${remembered.sandboxId} was left running`,
				};
			}
			try {
				await provider.park(remembered.sandboxId);
				return { action: "parked" };
			} catch (error) {
				return {
					action: "kept",
					error: `park failed, orphaning ${remembered.substrate}:${remembered.sandboxId}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				};
			}
		}
		// Tracked across the catch: only the connect() fallback resumes, and
		// only once it has actually returned a handle.
		let resumed = false;
		try {
			if (provider.remove) {
				// The no-wake path; the source may have re-parked since export.
				await provider.remove(remembered.sandboxId);
				return { action: "destroyed", resumed: false };
			}
			const handle = await provider.connect(remembered.sandboxId);
			resumed = true;
			await handle.destroy();
			return { action: "destroyed", resumed: true };
		} catch (error) {
			const vendor = error instanceof Error ? error.message : String(error);
			if (
				error instanceof MuxError &&
				error.kind === "fatal" &&
				/not found/i.test(error.message)
			) {
				return { action: "destroyed", resumed };
			}
			// ASK THE SUBSTRATE before accusing it of leaking a machine.
			// MEASURED on dedalus 2026-08-05: DELETE /v1/machines/<id> answered
			// 500 "failed to close storage usage before deleting machine spec:
			// ... column org_metering_buckets.stripe_submitted_at does not
			// exist" -- a fault in the VENDOR's metering ledger, raised AFTER
			// the machine was gone -- and this report then said `action:
			// "kept"` with "destroy failed, orphaning dedalus:dm-..." for four
			// machines that every follow-up read showed phase=destroyed. The
			// report is the product's honesty contract: sending an operator to
			// hunt a sandbox that does not exist is worse than saying nothing,
			// because it teaches them the report lies.
			const confirmed = await this.confirmTornDown(provider, remembered.sandboxId);
			if (confirmed.gone) {
				return {
					action: "destroyed",
					resumed,
					note: `${remembered.substrate} errored tearing down ${remembered.sandboxId} but now reports it ${confirmed.detail}, so nothing was orphaned; the vendor's error was: ${vendor}`,
				};
			}
			return {
				action: "kept",
				error: `destroy failed, orphaning ${remembered.substrate}:${remembered.sandboxId} (${confirmed.detail}): ${vendor}`,
			};
		}
	}

	/**
	 * The attempt record for a sandbox whose best-effort teardown threw.
	 *
	 * Shared by create()'s failed-lane cleanup and migrate()'s pre-commit
	 * cleanup, because both tear a sandbox down through the same vendor call
	 * and both used to accuse it of leaking on the strength of the error alone.
	 * MEASURED on dedalus 2026-08-05, in create()'s path, while verifying the
	 * migrate fix: the route reported "orphaned sandbox
	 * dm-019fd33b-d8ec-7c34-88b5-6059b34db5fd: teardown failed: dedalus destroy
	 * 500 ... stripe_submitted_at does not exist" for a machine that had
	 * already left the account entirely -- the follow-up list held only the two
	 * pre-existing machines from May and June. Confirm, then accuse.
	 */
	private async teardownAttempt(
		kind: SubstrateKind,
		sandboxId: string,
		teardownError: unknown,
	): Promise<RouteAttempt> {
		const vendor =
			teardownError instanceof Error ? teardownError.message : String(teardownError);
		const confirmed = await this.confirmTornDown(this.provider(kind), sandboxId);
		return {
			substrate: kind,
			outcome: "failed",
			reason: confirmed.gone
				? `sandbox ${sandboxId} teardown errored but the substrate reports it ${confirmed.detail}, so nothing leaked: ${vendor}`
				: `orphaned sandbox ${sandboxId} (${confirmed.detail}): teardown failed: ${vendor}`,
		};
	}

	/**
	 * Did a failed teardown nevertheless take effect?
	 *
	 * Asked with the provider's NO-WAKE `describe()` (status() has the same
	 * rule): a confirming read must not resume and bill the machine it is
	 * asking about, and on dedalus a resume IS an execution submission.
	 *
	 * Fail closed in BOTH directions, which is the whole point:
	 *   - only a substrate that says `destroyed` clears the orphan warning;
	 *   - a substrate with no no-wake status read, a describe() that throws,
	 *     and any other state -- including `destroying`, which no measurement
	 *     covers -- keep the warning and name what was actually observed, so
	 *     the operator judges the phase instead of trusting our guess. An
	 *     unverified maybe-alive machine costs money.
	 */
	private async confirmTornDown(
		provider: SandboxProvider,
		sandboxId: string,
	): Promise<{ gone: boolean; detail: string }> {
		if (!provider.describe) {
			return {
				gone: false,
				detail: `${provider.kind} cannot report a sandbox's state without resuming it, so the teardown is unconfirmed`,
			};
		}
		try {
			const description = await provider.describe(sandboxId);
			const phase = description.rawPhase ? ` (vendor phase ${description.rawPhase})` : "";
			if (description.state === "destroyed") {
				return { gone: true, detail: `destroyed${phase}` };
			}
			if (description.state === "destroying") {
				// Still a warning, because "in flight" is not "finished" -- but a
				// warning that says which it is. MEASURED on dedalus 2026-08-05:
				// two machines read as `destroying` immediately after this same
				// failed teardown had left the account entirely minutes later, so
				// this is probably not a leak. Probably is not confirmation.
				return {
					gone: false,
					detail: `the substrate accepted the teardown and reports it still in flight${phase}, so completion is unconfirmed`,
				};
			}
			return { gone: false, detail: `the substrate still reports ${description.state}${phase}` };
		} catch (error) {
			return {
				gone: false,
				detail: `the confirming describe() also failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		}
	}

	/**
	 * Fail closed before provisioning if no upstream can drive the harness.
	 *
	 * The rule lives in upstreams.ts because it is per-harness and not
	 * simply "native key required": a gateway that serves the harness's wire
	 * format is equally valid (measured: claude-code runs on OpenRouter's
	 * Anthropic-Messages endpoint), while a gateway that does not is
	 * useless. Doing this here means a caller never pays for a sandbox and
	 * an install only to hit the agent's own auth error.
	 */
	private assertUpstream(agent: HarnessKind): void {
		requireUpstream(agent, this.config.keys);
	}
}

export type CreateMuxOptions = {
	/**
	 * Circuit-breaker store. Inject one to isolate health from the shared
	 * state file -- tests need that, because a breaker restored from a
	 * previous run reorders routes and would make assertions depend on
	 * history.
	 */
	health?: SubstrateHealth;
	/** Persist breaker samples to the state file. Defaults to true. */
	persistHealth?: boolean;
	/**
	 * Learned lane scorer for "auto" routes. Omit for the default, which reads
	 * the local trace store; pass one built over an explicit trace list to
	 * isolate it (tests need that, because a policy reading the developer's own
	 * run history would make route assertions depend on yesterday's work); pass
	 * `null` to route on the configured order alone.
	 */
	selection?: SelectionPolicy | null;
	/**
	 * Placement store for THIS mux, instead of the process-global one.
	 *
	 * `setPlacementStore()` is a module singleton, which is correct for the CLI
	 * (one host, one user) and a cross-tenant hazard anywhere else: a serverless
	 * function serves concurrent requests for different users in one process, so
	 * "set the global to user A's tenant-scoped store, then run A's operation"
	 * races user B doing the same and A reads B's placements. Passing the store
	 * per instance removes the global from that path entirely -- the same reason
	 * the hosted connect cache is keyed by credential scope
	 * (web/lib/providers/mux-facade.ts).
	 *
	 * Omitted: the global is used, so CLI and SDK behavior is unchanged.
	 */
	placementStore?: PlacementStore;
};

/** Build a Mux from a config file path, inline object, or environment. */
export function createMux(
	config?: string | MuxConfigInput,
	options: CreateMuxOptions = {},
): Mux {
	if (typeof config === "string") {
		return new Mux(loadMuxConfig(config), options);
	}
	if (config) {
		return new Mux(resolveMuxConfig(config), options);
	}
	return new Mux(loadMuxConfig(), options);
}

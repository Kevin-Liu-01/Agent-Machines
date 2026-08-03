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
	type PtyHandle,
	type PtyOptions,
	type SandboxDescription,
	type SandboxHandle,
	type SandboxProvider,
	type SubstrateKind,
} from "./types.js";

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
	}) {
		this.sandbox = input.sandbox;
		this.harness = input.harness;
		this.config = input.config;
		this.name = input.name;
		this.model = input.model;
		this.attempts = input.attempts ?? [];
		this.selection = input.selection ?? [];
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
	 */
	async ensureInstalled(
		options: { timeoutMs?: number; pollMs?: number } = {},
	): Promise<void> {
		const probe = await this.sandbox.exec(this.harness.isInstalledCommand(), {
			timeoutMs: 30_000,
		});
		if (probe.exitCode === 0) return;

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
			return;
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
		if (this.name) await forgetMachineAsync(this.name);
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
		const store = getPlacementStore();
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
	private async ensureHealth(): Promise<void> {
		if (this.healthLoaded) return;
		this.healthLoaded = true;
		try {
			this.health = SubstrateHealth.fromJSON((await readMuxStateAsync()).health);
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
			await saveHealthAsync(this.health.toJSON());
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
					await rememberMachineAsync(options.name, {
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
					await provisioned.destroy().catch((teardownError: unknown) => {
						attempts.push({
							substrate: kind,
							outcome: "failed",
							reason: `orphaned sandbox ${provisioned?.id ?? "?"}: teardown failed: ${
								teardownError instanceof Error
									? teardownError.message
									: String(teardownError)
							}`,
						});
					});
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

	/** Reconnect to a machine created earlier with a name. */
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
			await forgetMachineAsync(name);
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
				await forgetMachineAsync(name);
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
		const remembered = (await readMuxStateAsync()).machines[name];
		if (!remembered) {
			throw new MuxError("fatal", `No remembered machine named "${name}".`);
		}
		return remembered;
	}

	async connect(name: string, agent?: HarnessKind): Promise<MuxMachine> {
		const remembered = (await readMuxStateAsync()).machines[name];
		if (!remembered) {
			throw new MuxError("fatal", `No remembered machine named "${name}".`);
		}
		const sandbox = await this.provider(remembered.substrate).connect(
			remembered.sandboxId,
		);
		return new MuxMachine({
			sandbox,
			harness: getHarness(agent ?? remembered.agent),
			config: this.config,
			name,
		});
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

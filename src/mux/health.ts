/**
 * Health-aware substrate routing: rolling window + circuit breaker.
 *
 * Routing is otherwise credential-gated only. `Mux.routeFor()` drops lanes
 * it cannot authenticate and then always offers the configured primary
 * first, so a substrate whose control plane is refusing every request keeps
 * costing a full failed provisioning attempt on every `create()` -- and on
 * the slow lanes that attempt is expensive (Sprites cold create measured
 * 17-31s, docs/MUX-RESULTS.md). This module supplies the missing signal.
 *
 * Three deliberate properties:
 *
 *   Advisory, never exclusive. `order()` reorders candidates and never
 *   removes one. A provider-wide incident, or a laptop that lost DNS for
 *   ten seconds, would otherwise open every lane at once and make
 *   `create()` structurally impossible. A last-resort attempt on an open
 *   lane still beats no attempt.
 *
 *   Transport failures only. `fatal` (a credential or capability gap, a
 *   harness install that will fail identically everywhere) is recorded for
 *   diagnostics but never trips the breaker: it says nothing about whether
 *   the substrate is reachable, and letting it open a lane would demote a
 *   perfectly healthy substrate because of a config mistake the breaker
 *   cannot fix.
 *
 *   Pure logic. No I/O, no timers, no vendor SDKs. Time enters through an
 *   injected `now()` so tests are exact and instant, and the whole store
 *   serializes to JSON so it can live beside machine placements in
 *   ~/.agent-machines/mux-state.json and be honored by the next process.
 */

import { SUBSTRATE_KINDS } from "./config.js";
import { MuxError, type SubstrateKind } from "./types.js";

/** What one attempt against a substrate tells us about its health. */
export type HealthOutcome = "ok" | "transient" | "fatal";

/**
 * Routing verdict for a lane. There is no separate "half-open": a breaker
 * whose cooldown has elapsed reports `degraded`, which is exactly the
 * behavior a half-open circuit wants -- the lane is eligible again, so one
 * real attempt probes it, but healthy lanes are still preferred.
 */
export type HealthState = "healthy" | "degraded" | "open";

export type HealthSample = {
	/**
	 * Absolute epoch milliseconds from the injected clock. Absolute rather
	 * than relative so a different process reading the shared state file can
	 * age the window without knowing when we wrote it.
	 */
	at: number;
	outcome: HealthOutcome;
	/** Observed attempt latency, when the caller measured it. */
	latencyMs?: number;
};

export type SubstrateHealthEntry = {
	samples: HealthSample[];
	/** When the breaker last tripped. Absent means closed. */
	openedAt?: number;
};

/**
 * Bumped only on a breaking change to the entry shape. A snapshot with any
 * other version is discarded rather than coerced: losing health history
 * costs one probe attempt, while misreading a foreign shape could pin
 * routing to a dead lane.
 */
export const HEALTH_SNAPSHOT_VERSION = 1;

export type SubstrateHealthSnapshot = {
	version: number;
	substrates: Partial<Record<SubstrateKind, SubstrateHealthEntry>>;
};

export type SubstrateHealthTuning = {
	openAfter: number;
	cooldownMs: number;
	windowSize: number;
	windowMs: number;
	degradedAfter: number;
};

export type SubstrateHealthOptions = Partial<SubstrateHealthTuning> & {
	/** Injected clock returning epoch milliseconds. */
	now?: () => number;
};

export type SubstrateHealthStats = {
	substrate: SubstrateKind;
	state: HealthState;
	/** Attempts inside the current window. */
	samples: number;
	/** Transport failures inside the current window. */
	failures: number;
	/** Non-health failures inside the window; excluded from every verdict. */
	fatals: number;
	consecutiveFailures: number;
	openedAt?: number;
	/** Epoch ms at which an open breaker becomes probeable. */
	retryAtMs?: number;
	avgLatencyMs?: number;
};

/**
 * Defaults, and why each one:
 *
 * openAfter: 3 -- two failures in a row is documented normal noise on a
 *   healthy lane, not a sick lane. Sprites `create` returns intermittent
 *   500s that still create the sprite, and 2 of 3 identical requests failed
 *   in the measured run (docs/MUX-RESULTS.md finding 5). A threshold of 2
 *   would trip the breaker on a substrate that was working.
 *
 * cooldownMs: 30_000 -- long enough for the failure classes actually
 *   observed to clear (a rate-limit window, a control-plane restart, a
 *   transient 500 streak), short enough that it never dominates the cost it
 *   is avoiding: one cold Sprites provisioning attempt alone measured
 *   17-31s, so skipping a lane for 30s can cost at most about what one
 *   failed attempt on it would have.
 *
 * windowSize: 20 -- enough samples for a stable picture of a lane, small
 *   enough that the serialized snapshot stays trivial next to the machine
 *   placements in the shared state file (4 substrates x 20 samples).
 *
 * windowMs: 300_000 -- outcomes stop describing a lane once they are old;
 *   a substrate that failed half an hour ago must not stay demoted for the
 *   rest of the day. Five minutes matches `defaults.timeoutMs`, so the
 *   window spans roughly one full agent run.
 *
 * degradedAfter: 1 -- any recent transport failure is reason enough to
 *   prefer a lane with none. Demotion is cheap because the only consequence
 *   is ordering; nothing is ever excluded.
 */
export const DEFAULT_HEALTH_TUNING: SubstrateHealthTuning = {
	openAfter: 3,
	cooldownMs: 30_000,
	windowSize: 20,
	windowMs: 300_000,
	degradedAfter: 1,
};

const STATE_RANK: Record<HealthState, number> = {
	healthy: 0,
	degraded: 1,
	open: 2,
};

const OUTCOMES: readonly HealthOutcome[] = ["ok", "transient", "fatal"];

function requireInt(name: string, value: number, min: number): number {
	if (!Number.isInteger(value) || value < min) {
		throw new MuxError(
			"fatal",
			`SubstrateHealth ${name} must be an integer >= ${min} (got ${String(value)})`,
		);
	}
	return value;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Reject anything that is not a well-formed sample; a corrupt shared state
 * file must degrade to "no history", never to a wrong verdict. */
function parseSample(raw: unknown): HealthSample | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	if (!isFiniteNumber(record.at)) return null;
	const outcome = record.outcome;
	if (typeof outcome !== "string") return null;
	if (!OUTCOMES.includes(outcome as HealthOutcome)) return null;
	const sample: HealthSample = { at: record.at, outcome: outcome as HealthOutcome };
	if (isFiniteNumber(record.latencyMs) && record.latencyMs >= 0) {
		sample.latencyMs = record.latencyMs;
	}
	return sample;
}

function parseEntry(raw: unknown): SubstrateHealthEntry | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	const rawSamples = Array.isArray(record.samples) ? record.samples : [];
	const samples: HealthSample[] = [];
	for (const item of rawSamples) {
		const sample = parseSample(item);
		if (sample) samples.push(sample);
	}
	samples.sort((a, b) => a.at - b.at);
	const entry: SubstrateHealthEntry = { samples };
	if (isFiniteNumber(record.openedAt)) entry.openedAt = record.openedAt;
	if (samples.length === 0 && entry.openedAt === undefined) return null;
	return entry;
}

/**
 * Classify a thrown routing error as a health signal.
 *
 * `null` means "do not record": `missing_credentials` and `not_supported`
 * are static facts about configuration that `routeFor()` already screens
 * out up front, so folding them into the window would permanently demote a
 * lane for something no cooldown can heal.
 *
 * `rate_limited` counts as a transport failure. A throttled lane genuinely
 * cannot serve until its window resets, which is precisely what the
 * breaker's cooldown expresses.
 *
 * A non-MuxError is treated as transient, matching `isRoutableError`'s
 * stance that an unrecognized failure is worth trying elsewhere.
 */
export function outcomeForError(error: unknown): HealthOutcome | null {
	if (error instanceof MuxError) {
		if (error.kind === "missing_credentials" || error.kind === "not_supported") {
			return null;
		}
		if (error.kind === "fatal") return "fatal";
		return "transient";
	}
	return "transient";
}

export class SubstrateHealth {
	readonly tuning: SubstrateHealthTuning;
	private readonly clock: () => number;
	private readonly entries = new Map<SubstrateKind, SubstrateHealthEntry>();

	constructor(options: SubstrateHealthOptions = {}) {
		const tuning: SubstrateHealthTuning = {
			openAfter: requireInt(
				"openAfter",
				options.openAfter ?? DEFAULT_HEALTH_TUNING.openAfter,
				1,
			),
			cooldownMs: requireInt(
				"cooldownMs",
				options.cooldownMs ?? DEFAULT_HEALTH_TUNING.cooldownMs,
				0,
			),
			windowSize: requireInt(
				"windowSize",
				options.windowSize ?? DEFAULT_HEALTH_TUNING.windowSize,
				1,
			),
			windowMs: requireInt(
				"windowMs",
				options.windowMs ?? DEFAULT_HEALTH_TUNING.windowMs,
				1,
			),
			degradedAfter: requireInt(
				"degradedAfter",
				options.degradedAfter ?? DEFAULT_HEALTH_TUNING.degradedAfter,
				1,
			),
		};
		// A window shorter than the trip threshold can never hold enough
		// consecutive failures, so the breaker would silently never open --
		// exactly the failure the module exists to prevent. Fail closed.
		if (tuning.windowSize < tuning.openAfter) {
			throw new MuxError(
				"fatal",
				`SubstrateHealth windowSize (${tuning.windowSize}) must be >= openAfter (${tuning.openAfter}); the breaker could never trip.`,
			);
		}
		this.tuning = tuning;
		this.clock = options.now ?? (() => Date.now());
	}

	now(): number {
		return this.clock();
	}

	/** Fold one attempt outcome into the lane's window. */
	record(substrate: SubstrateKind, outcome: HealthOutcome, latencyMs?: number): void {
		const at = this.clock();
		const entry = this.entryFor(substrate);
		const sample: HealthSample = { at, outcome };
		if (latencyMs !== undefined && Number.isFinite(latencyMs) && latencyMs >= 0) {
			sample.latencyMs = latencyMs;
		}
		entry.samples.push(sample);
		this.normalize(entry, at);

		if (outcome === "ok") {
			// The only thing that closes a breaker: a real attempt succeeded.
			entry.openedAt = undefined;
			return;
		}
		if (outcome === "fatal") return;
		// Refreshing openedAt while already open is what makes a failed
		// half-open probe restart the cooldown instead of leaving the lane
		// probeable on every subsequent call.
		if (entry.openedAt !== undefined || this.consecutiveFailures(entry) >= this.tuning.openAfter) {
			entry.openedAt = at;
		}
	}

	state(substrate: SubstrateKind): HealthState {
		const entry = this.entries.get(substrate);
		// No evidence is not bad evidence: an untried lane routes normally.
		if (!entry) return "healthy";
		const now = this.clock();
		this.normalize(entry, now);
		if (entry.openedAt !== undefined) {
			return now - entry.openedAt < this.tuning.cooldownMs ? "open" : "degraded";
		}
		const failures = entry.samples.filter((s) => s.outcome === "transient").length;
		return failures >= this.tuning.degradedAfter ? "degraded" : "healthy";
	}

	/**
	 * Reorder candidates healthy -> degraded -> open, preserving the caller's
	 * order inside each tier. Configured order encodes operator preference
	 * (cost, features, region), so health only ever breaks ties it has
	 * evidence for. Nothing is dropped: the returned array is always a
	 * permutation of the input.
	 */
	order(candidates: readonly SubstrateKind[]): SubstrateKind[] {
		return candidates
			.map((substrate, index) => ({
				substrate,
				index,
				rank: STATE_RANK[this.state(substrate)],
			}))
			.sort((a, b) => a.rank - b.rank || a.index - b.index)
			.map((ranked) => ranked.substrate);
	}

	/** Per-lane detail for diagnostics and route explanations. */
	stats(substrate: SubstrateKind): SubstrateHealthStats {
		const state = this.state(substrate);
		const entry = this.entries.get(substrate);
		const samples = entry?.samples ?? [];
		const latencies = samples
			.map((s) => s.latencyMs)
			.filter((value): value is number => value !== undefined);
		const stats: SubstrateHealthStats = {
			substrate,
			state,
			samples: samples.length,
			failures: samples.filter((s) => s.outcome === "transient").length,
			fatals: samples.filter((s) => s.outcome === "fatal").length,
			consecutiveFailures: entry ? this.consecutiveFailures(entry) : 0,
		};
		if (entry?.openedAt !== undefined) {
			stats.openedAt = entry.openedAt;
			stats.retryAtMs = entry.openedAt + this.tuning.cooldownMs;
		}
		if (latencies.length > 0) {
			const total = latencies.reduce((sum, value) => sum + value, 0);
			stats.avgLatencyMs = Math.round(total / latencies.length);
		}
		return stats;
	}

	/** Every lane with recorded history, for dashboards and `am doctor`. */
	report(): SubstrateHealthStats[] {
		return SUBSTRATE_KINDS.filter((kind) => this.entries.has(kind)).map((kind) =>
			this.stats(kind),
		);
	}

	/** Drop all history for one lane, or for every lane. */
	reset(substrate?: SubstrateKind): void {
		if (substrate) this.entries.delete(substrate);
		else this.entries.clear();
	}

	toJSON(): SubstrateHealthSnapshot {
		const now = this.clock();
		const substrates: Partial<Record<SubstrateKind, SubstrateHealthEntry>> = {};
		for (const [substrate, entry] of this.entries) {
			this.normalize(entry, now);
			// Aged-out lanes are omitted entirely so the shared state file does
			// not accumulate a row per substrate forever.
			if (entry.samples.length === 0 && entry.openedAt === undefined) continue;
			const copy: SubstrateHealthEntry = {
				samples: entry.samples.map((sample) => ({ ...sample })),
			};
			if (entry.openedAt !== undefined) copy.openedAt = entry.openedAt;
			substrates[substrate] = copy;
		}
		return { version: HEALTH_SNAPSHOT_VERSION, substrates };
	}

	static fromJSON(
		value: unknown,
		options: SubstrateHealthOptions = {},
	): SubstrateHealth {
		const health = new SubstrateHealth(options);
		if (!value || typeof value !== "object") return health;
		const snapshot = value as Record<string, unknown>;
		if (snapshot.version !== HEALTH_SNAPSHOT_VERSION) return health;
		const substrates = snapshot.substrates;
		if (!substrates || typeof substrates !== "object") return health;
		const byKind = substrates as Record<string, unknown>;
		// Iterate known kinds rather than the file's own keys, so an unknown or
		// hand-edited lane name cannot enter the store.
		for (const kind of SUBSTRATE_KINDS) {
			const entry = parseEntry(byKind[kind]);
			if (entry) health.entries.set(kind, entry);
		}
		return health;
	}

	private entryFor(substrate: SubstrateKind): SubstrateHealthEntry {
		let entry = this.entries.get(substrate);
		if (!entry) {
			entry = { samples: [] };
			this.entries.set(substrate, entry);
		}
		return entry;
	}

	/** Age out the window and defuse clock skew. Called on every read as
	 * well as on write, so a long-idle store never reports stale verdicts. */
	private normalize(entry: SubstrateHealthEntry, now: number): void {
		const horizon = now - this.tuning.windowMs;
		if (entry.samples.length > 0 && entry.samples[0]!.at <= horizon) {
			entry.samples = entry.samples.filter((sample) => sample.at > horizon);
		}
		if (entry.samples.length > this.tuning.windowSize) {
			entry.samples = entry.samples.slice(-this.tuning.windowSize);
		}
		// A snapshot written by a process whose clock runs ahead would
		// otherwise hold the lane open far past the cooldown; clamping caps
		// the damage at exactly one cooldown.
		if (entry.openedAt !== undefined && entry.openedAt > now) entry.openedAt = now;
	}

	/**
	 * Trailing run of transport failures. `fatal` samples are stepped over
	 * rather than counted or treated as a reset: they carry no information
	 * about reachability, so an install failure landing between two transport
	 * failures must not hide the streak.
	 */
	private consecutiveFailures(entry: SubstrateHealthEntry): number {
		let streak = 0;
		for (let i = entry.samples.length - 1; i >= 0; i -= 1) {
			const outcome = entry.samples[i]!.outcome;
			if (outcome === "ok") break;
			if (outcome === "transient") streak += 1;
		}
		return streak;
	}
}

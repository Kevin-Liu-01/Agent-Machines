/**
 * The metering ledger -- roadmap 4.3, the record 4.4 ("one bill") is built on.
 *
 * One append-only JSONL entry per billable event, sharded by UTC day, in
 * ~/.agent-machines/ledger/ and overridable with AGENT_MACHINES_MUX_LEDGER --
 * the same local-store posture as ./traces.js (no daemon, one O_APPEND write per
 * record) so a ledger works from the SDK, the CLI and a dev server at once.
 *
 * A run's charge is THREE lines, never one number:
 *
 *   sandbox -- substrate compute, priced through ./cost.js published rates, or
 *              a figure the provider itself billed.
 *   model   -- what the upstream charged for the turn (RunResult.costUsd).
 *   margin  -- the platform's own take, kept as its own line.
 *
 * WHY THE LINES STAY SPLIT. Folding margin into either pass-through line makes
 * the bill unauditable in the one direction that matters: a user cannot check
 * our arithmetic against the vendor's invoice, and we cannot tell a price
 * increase from a margin change. Splitting is also what lets sandbox stay
 * ESTIMATED while model is METERED without either one contaminating the other.
 *
 * WHAT THIS FILE REFUSES TO DO, each because it is a way ledgers go wrong:
 *
 *   1. Nothing is ever edited. `appendCorrection` posts a NEW compensating
 *      entry that names the entry it corrects. An amount that can be edited in
 *      place cannot be audited, and a total recomputed from mutable rows cannot
 *      be reproduced.
 *   2. Every amount carries provenance: which rate, from where, and whether the
 *      figure was measured or modeled. A sum whose parts disagree is labeled
 *      "mixed" and lists them; no total silently averages a measurement with a
 *      model.
 *   3. An unpriced lane produces a line with the amount ABSENT (`millicents:
 *      null`) plus the reason, never 0. A ledger showing 0.00 for an unpriced
 *      run under-bills silently and looks correct while doing it -- and sprites
 *      is unpriced today (./cost.js), so this is the common case, not a corner.
 *   4. A total exists only when every line of the entry is priced. Otherwise it
 *      is absent and names what is missing.
 *
 * MONEY IS INTEGER MILLICENTS (1/1000 of a cent), never a float. Binary floats
 * cannot represent decimal money exactly, so summing them makes a total depend
 * on the order the rows were added -- fatal for a record that has to reconcile
 * against a vendor invoice. Millicents is also the unit every hosted cost column
 * already uses (`run_traces.cost_millicents`, `machine_costs.*_millicents`), and
 * mixing units across the two halves of one product is how a 100000x error
 * ships. USD enters exactly once, at `usdToMillicents`, where it is rounded to
 * the minor unit: a run whose true cost is under half a millicent therefore
 * rounds to a REAL 0 (we bill nothing), which is not the same as an absent
 * amount and must not be reported as one.
 */

import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { HARNESS_KINDS, SUBSTRATE_KINDS } from "./config.js";
import { estimate } from "./cost.js";
import { routeKey, type RouteKey } from "./traces.js";
import { MuxError, type HarnessKind, type SubstrateKind } from "./types.js";

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** 1 USD = 100 cents = 100_000 millicents. Matches web/lib/metrics/prices.ts. */
export const MILLICENTS_PER_USD = 100_000;

/**
 * The single USD -> minor-unit conversion. Rejects a non-finite or negative
 * input rather than rounding it: a NaN would propagate through every sum in
 * every summary, and a negative pass-through cost is not a thing a vendor bills
 * (a credit is a correction entry, which carries its amount in millicents and
 * never goes through here).
 */
export function usdToMillicents(usd: number, label = "amount"): number {
	if (!Number.isFinite(usd)) {
		throw new MuxError("fatal", `${label} must be a finite USD amount, got ${String(usd)}`);
	}
	if (usd < 0) {
		throw new MuxError("fatal", `${label} must not be negative USD, got ${String(usd)}`);
	}
	return Math.round(usd * MILLICENTS_PER_USD);
}

/** Render an integer amount for a human, without ever doing math on the float. */
export function formatMillicents(millicents: number): string {
	const negative = millicents < 0;
	const abs = Math.abs(millicents);
	const whole = Math.floor(abs / MILLICENTS_PER_USD);
	const frac = String(abs % MILLICENTS_PER_USD).padStart(5, "0");
	return `${negative ? "-" : ""}$${whole}.${frac}`;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Where an amount's authority comes from.
 *
 *   "metered"   -- measured from a real run: a harness-reported model spend, a
 *                  provider-billed usage figure. This is what may be invoiced
 *                  without a caveat.
 *   "estimated" -- modeled: a duration multiplied by a published rate. The
 *                  substrate's own meter may disagree, and a requested machine
 *                  size is not proof of the granted one (docs/MUX-RESULTS.md
 *                  finding 10, where E2B ignored a `resources` request), so a
 *                  modeled sandbox figure stays estimated even when the caller
 *                  knows exactly what it asked for.
 *   "fixed"     -- our own list price, which is neither measured nor modeled
 *                  because it does not depend on usage (a flat platform fee).
 *                  It exists so such a fee is not labeled "metered", which
 *                  would claim a measurement that never happened.
 */
export type Provenance = "metered" | "estimated" | "fixed";

/**
 * The provenance of a SUM. "mixed" is not a fourth kind of amount -- it is the
 * admission that the parts disagree, which the non-negotiable "never mix them in
 * one sum without saying so" requires. "none" appears only on an empty sum (no
 * lines at all) and means nothing was charged, not that a charge is unknown.
 */
export type TotalProvenance = Provenance | "mixed" | "none";

/** Which rate produced an amount, and where that rate is published. */
export type RateRef = {
	/** Stable id: "e2b:compute", "anthropic/claude-sonnet-4.5", "margin:1500bp". */
	id: string;
	/** Source URL or system of record, plus the date it was read. */
	source: string;
};

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type LedgerLineKind = "sandbox" | "model" | "margin";

/**
 * The three components of a run charge. A charge entry must declare all three:
 * a component that is simply left out would make the entry's total look complete
 * while missing money, which is the failure this ordering exists to prevent.
 */
export const LEDGER_LINE_KINDS: readonly LedgerLineKind[] = ["sandbox", "model", "margin"];

export type PricedLine = {
	kind: LedgerLineKind;
	/** Integer millicents. Negative only on a correction entry. */
	millicents: number;
	provenance: Provenance;
	rate: RateRef;
	/** The arithmetic, so an audit can show its work. */
	detail: string;
	/**
	 * True when the amount is an upper bound rather than the expected charge --
	 * an active-CPU lane priced at full utilization bills less in practice,
	 * because model wait is not CPU time (./cost.js `CostEstimate.upperBound`).
	 */
	upperBound?: boolean;
};

/**
 * A component with no amount. `millicents: null` is written explicitly rather
 * than omitted so the absence survives a JSON round trip as a stated fact, and
 * so a reader that forgets to check it gets `null` -- which fails loudly in
 * arithmetic -- instead of `undefined` coerced to 0 by a `?? 0`.
 */
export type UnpricedLine = {
	kind: LedgerLineKind;
	millicents: null;
	/** What was checked and why it came back empty. Surfaced to the user. */
	reason: string;
};

export type LedgerLine = PricedLine | UnpricedLine;

export function isPriced(line: LedgerLine): line is PricedLine {
	return line.millicents !== null;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export type LedgerEntryKind = "charge" | "correction";

export type LedgerEntry = {
	/** Unique per entry; what a correction references. Never reused. */
	id: string;
	kind: LedgerEntryKind;
	/** The logical run this money belongs to. Same key as RunTrace.runKey. */
	runKey: string;
	harness: HarnessKind;
	substrate: SubstrateKind;
	/**
	 * When the billable event happened, UTC ISO 8601. This is the axis the day
	 * shards and every time range use. A correction's own `occurredAt` is when
	 * the correction is issued, not when the corrected run happened, so an
	 * adjustment lands in the period it was made rather than reopening a closed
	 * one -- which means a run's net total is only visible in a window that
	 * covers both entries (`LedgerSummary.danglingCorrections` says when it does
	 * not).
	 */
	occurredAt: string;
	/** When the line was written. Never edited, so this never changes. */
	recordedAt: string;
	/** pid@host of the writer. Audit only; it is not a lock or an owner. */
	recordedBy: string;
	lines: LedgerLine[];
	/** Correction only: the entry id this one compensates. */
	corrects?: string;
	/** Correction only, and required there: why the adjustment exists. */
	reason?: string;
};

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type MissingComponent = { kind: LedgerLineKind; reason: string };

export type KnownTotal = {
	known: true;
	millicents: number;
	/** "mixed" whenever the summed lines disagree; `provenances` names them. */
	provenance: TotalProvenance;
	/** The distinct provenances summed here, sorted, so "mixed" is never opaque. */
	provenances: Provenance[];
};

export type UnknownTotal = {
	known: false;
	/** Every component that had no amount, with the reason it had none. */
	missing: MissingComponent[];
};

export type LedgerTotal = KnownTotal | UnknownTotal;

/**
 * Sum lines into a total, or refuse to.
 *
 * One unpriced line is enough to withhold the total: a partial sum reported as a
 * total under-bills by an unknown amount, and the reader has no way to tell.
 */
export function totalOfLines(lines: readonly LedgerLine[]): LedgerTotal {
	const missing: MissingComponent[] = [];
	const seen = new Set<Provenance>();
	let millicents = 0;
	for (const line of lines) {
		if (!isPriced(line)) {
			missing.push({ kind: line.kind, reason: line.reason });
			continue;
		}
		millicents += line.millicents;
		seen.add(line.provenance);
	}
	if (missing.length > 0) return { known: false, missing };
	const provenances = [...seen].sort();
	return {
		known: true,
		millicents,
		provenance:
			provenances.length === 0
				? "none"
				: provenances.length === 1
					? provenances[0]
					: "mixed",
		provenances,
	};
}

/** One entry's own total. See totalOfLines for when it is withheld. */
export function entryTotal(entry: LedgerEntry): LedgerTotal {
	return totalOfLines(entry.lines);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SHARD_PREFIX = "ledger-";
const SHARD_SUFFIX = ".jsonl";
const SHARD_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ledger root. Separate directory from traces on purpose: a trace is
 * observability and may be pruned, a ledger entry is a money record and may not,
 * so they must never share a retention policy or a delete.
 */
export function ledgerDir(): string {
	return (
		process.env.AGENT_MACHINES_MUX_LEDGER ??
		join(homedir(), ".agent-machines", "ledger")
	);
}

function shardName(occurredAt: string): string {
	return `${SHARD_PREFIX}${occurredAt.slice(0, 10)}${SHARD_SUFFIX}`;
}

function epochMs(value: string | number | Date, label: string): number {
	let ms: number;
	if (value instanceof Date) ms = value.getTime();
	else if (typeof value === "number") ms = value;
	else ms = Date.parse(value);
	if (!Number.isFinite(ms)) {
		throw new MuxError("fatal", `unparseable ${label}: ${String(value)}`);
	}
	return ms;
}

/** First and last instant a record in this day shard can carry, in epoch ms. */
function dayStartMs(date: string): number {
	return Date.parse(`${date}T00:00:00.000Z`);
}

function dayEndMs(date: string): number {
	return Date.parse(`${date}T23:59:59.999Z`);
}

/**
 * Normalize a caller timestamp to UTC ISO 8601, and refuse one the shard names
 * cannot express.
 *
 * Outside years 0000-9999 toISOString() switches to the expanded "+012026-..."
 * form, which would name a shard the reader does not recognize: the entry would
 * be written and then never readable. Losing a money record silently is strictly
 * worse than refusing to write it.
 */
function normalizeTimestamp(value: string | number | Date, label: string): string {
	const iso = new Date(epochMs(value, label)).toISOString();
	if (!SHARD_DATE.test(iso.slice(0, 10))) {
		throw new MuxError("fatal", `${label} is outside the supported year range: ${iso}`);
	}
	return iso;
}

// ---------------------------------------------------------------------------
// Validation -- one rule set, applied on write AND on read
// ---------------------------------------------------------------------------

const HARNESSES = new Set<string>(HARNESS_KINDS);
const SUBSTRATES = new Set<string>(SUBSTRATE_KINDS);
const LINE_KINDS = new Set<string>(LEDGER_LINE_KINDS);
const PROVENANCES = new Set<string>(["metered", "estimated", "fixed"]);

function fail(where: string, message: string): never {
	throw new MuxError("fatal", `${where}: ${message}`);
}

function requireText(value: unknown, where: string, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		fail(where, `${field} must be a non-empty string, got ${String(value)}`);
	}
	return value;
}

function validateLine(line: unknown, where: string, allowNegative: boolean): LedgerLine {
	if (typeof line !== "object" || line === null) {
		fail(where, `each line must be an object, got ${String(line)}`);
	}
	const raw = line as Record<string, unknown>;
	const kind = raw.kind;
	if (typeof kind !== "string" || !LINE_KINDS.has(kind)) {
		fail(where, `line kind must be one of ${LEDGER_LINE_KINDS.join(", ")}, got ${String(kind)}`);
	}
	if (raw.millicents === null) {
		return {
			kind: kind as LedgerLineKind,
			millicents: null,
			// An absent amount with no stated reason is indistinguishable from a
			// forgotten field, and "we do not know why we do not know" is not an
			// auditable record.
			reason: requireText(raw.reason, where, `${kind} line reason`),
		};
	}
	const millicents = raw.millicents;
	if (typeof millicents !== "number" || !Number.isInteger(millicents)) {
		fail(
			where,
			`${kind} line millicents must be an integer or null, got ${String(millicents)}`,
		);
	}
	if (!allowNegative && millicents < 0) {
		fail(where, `${kind} line millicents must not be negative on a charge, got ${millicents}`);
	}
	const provenance = raw.provenance;
	if (typeof provenance !== "string" || !PROVENANCES.has(provenance)) {
		fail(where, `${kind} line provenance must be metered, estimated or fixed`);
	}
	const rate = raw.rate;
	if (typeof rate !== "object" || rate === null) {
		fail(where, `${kind} line needs a rate reference`);
	}
	const rateRecord = rate as Record<string, unknown>;
	const priced: PricedLine = {
		kind: kind as LedgerLineKind,
		millicents,
		provenance: provenance as Provenance,
		rate: {
			id: requireText(rateRecord.id, where, `${kind} line rate.id`),
			source: requireText(rateRecord.source, where, `${kind} line rate.source`),
		},
		detail: requireText(raw.detail, where, `${kind} line detail`),
	};
	if (raw.upperBound === true) priced.upperBound = true;
	return priced;
}

/**
 * Validate and canonicalize one entry. Used by append (before a write) and by
 * read (after a parse), so a hand-edited or foreign record cannot enter a total
 * through the back door -- the reader is exactly as strict as the writer.
 */
export function validateEntry(entry: unknown, where = "ledger entry"): LedgerEntry {
	if (typeof entry !== "object" || entry === null) {
		fail(where, `must be an object, got ${String(entry)}`);
	}
	const raw = entry as Record<string, unknown>;
	const kind = raw.kind;
	if (kind !== "charge" && kind !== "correction") {
		fail(where, `kind must be "charge" or "correction", got ${String(kind)}`);
	}
	const harness = requireText(raw.harness, where, "harness");
	if (!HARNESSES.has(harness)) fail(where, `unknown harness ${harness}`);
	const substrate = requireText(raw.substrate, where, "substrate");
	if (!SUBSTRATES.has(substrate)) fail(where, `unknown substrate ${substrate}`);
	if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
		fail(where, "an entry with no lines records no money");
	}
	const lines = raw.lines.map((line) => validateLine(line, where, kind === "correction"));
	const kinds = new Set<LedgerLineKind>();
	for (const line of lines) {
		if (kinds.has(line.kind)) fail(where, `two ${line.kind} lines in one entry double-bill it`);
		kinds.add(line.kind);
	}
	if (kind === "charge") {
		for (const component of LEDGER_LINE_KINDS) {
			if (!kinds.has(component)) {
				fail(
					where,
					`a charge must declare all of ${LEDGER_LINE_KINDS.join(", ")}; ${component} is missing, and an omitted component makes the total look complete`,
				);
			}
		}
	}
	const record: LedgerEntry = {
		id: requireText(raw.id, where, "id"),
		kind,
		runKey: requireText(raw.runKey, where, "runKey"),
		harness: harness as HarnessKind,
		substrate: substrate as SubstrateKind,
		occurredAt: normalizeTimestamp(
			requireText(raw.occurredAt, where, "occurredAt"),
			`${where} occurredAt`,
		),
		recordedAt: normalizeTimestamp(
			requireText(raw.recordedAt, where, "recordedAt"),
			`${where} recordedAt`,
		),
		recordedBy: requireText(raw.recordedBy, where, "recordedBy"),
		lines,
	};
	if (kind === "correction") {
		record.corrects = requireText(raw.corrects, where, "corrects");
		// A correction with no stated reason is an unexplained change to a money
		// record, which is the thing an append-only log exists to make impossible.
		record.reason = requireText(raw.reason, where, "reason");
	} else {
		if (raw.corrects !== undefined) fail(where, "only a correction may reference another entry");
		if (raw.reason !== undefined) fail(where, "reason belongs on a correction, not a charge");
	}
	return record;
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

/**
 * Ids are random, not a hash of the content.
 *
 * Content addressing would be nicer for audit, but two genuinely identical
 * charges are two charges: a content-addressed id would collapse them into one
 * and silently drop a real bill. Uniqueness wins.
 */
function newEntryId(): string {
	return `led-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
}

function writeEntry(entry: LedgerEntry): LedgerEntry {
	const record = validateEntry(entry);
	const dir = ledgerDir();
	mkdirSync(dir, { recursive: true });
	// One O_APPEND write per record: concurrent writers interleave whole lines
	// rather than corrupting each other's, so no lock and no daemon. Nothing in
	// this module ever opens a shard for writing any other way, which is what
	// makes "append-only" a property of the store and not just of the API.
	appendFileSync(
		join(dir, shardName(record.occurredAt)),
		`${JSON.stringify(record)}\n`,
		"utf8",
	);
	return record;
}

/** Sandbox usage to charge for: modeled from duration, or billed by the vendor. */
export type SandboxUsage =
	| {
			basis: "duration";
			/** Wall clock the sandbox was up, harness install included. */
			durationMs: number;
			/**
			 * Requested size, which is NOT proof of the granted size -- see
			 * Provenance. Defaults to ./cost.js's comparison size, exactly as
			 * ./traces.js prices a run.
			 */
			vcpu?: number;
			memoryMib?: number;
			/** Share of the window the CPU was busy, 0..1. Active-CPU lanes only. */
			cpuUtilization?: number;
			/**
			 * create() calls to bill. Defaults to 0 because a run executes on a
			 * machine that already exists: charging a creation per turn bills the
			 * same provisioning twice on a machine that takes two turns. Pass 1
			 * when this charge covers the create as well.
			 */
			creations?: number;
	  }
	| {
			basis: "provider-billed";
			/** What the provider's own meter says this run cost. */
			usd: number;
			/** The invoice or usage API the figure came from, plus the date. */
			source: string;
	  };

/** Model spend for the turn, or a stated reason there is none. */
export type ModelSpend =
	| {
			/** USD the upstream charged, as reported (RunResult.costUsd). */
			usd: number;
			/**
			 * Required, not defaulted. A harness-reported figure is "metered"; a
			 * figure modeled from token estimates is "estimated". Defaulting would
			 * label one as the other, and only the caller knows which it is.
			 */
			provenance: Provenance;
			rate: RateRef;
			/** Overrides the generated detail line when the caller has better. */
			detail?: string;
	  }
	| {
			/** Why there is no model amount. A harness that reported nothing is
			 *  unknown, not free -- so this is the honest branch, not a fallback. */
			unknown: string;
	  };

/**
 * The platform's take. Omitting it entirely is NOT "no margin": it is an
 * undeclared policy, which makes the run's total absent. That is deliberate --
 * until a margin policy exists, no run has a complete total, which is exactly
 * the roadmap's own position that BYOK is the only truthful description until
 * 4.4 ships.
 */
export type MarginPolicy =
	| { kind: "none" }
	| { kind: "flat"; millicents: number; source: string }
	| {
			/** Basis points (1500 = 15%) of the priced pass-through lines. */
			kind: "percent";
			basisPoints: number;
			source: string;
	  };

export type ChargeInput = {
	runKey: string;
	harness: HarnessKind;
	substrate: SubstrateKind;
	/** When the run happened. Defaults to now. */
	occurredAt?: string | number | Date;
	sandbox: SandboxUsage;
	model: ModelSpend;
	margin?: MarginPolicy;
};

function sandboxLine(substrate: SubstrateKind, usage: SandboxUsage): LedgerLine {
	if (usage.basis === "provider-billed") {
		return {
			kind: "sandbox",
			millicents: usdToMillicents(usage.usd, "provider-billed sandbox cost"),
			provenance: "metered",
			rate: { id: `${substrate}:invoice`, source: usage.source },
			detail: `provider-billed sandbox usage $${usage.usd}`,
		};
	}
	if (!Number.isFinite(usage.durationMs) || usage.durationMs < 0) {
		throw new MuxError(
			"fatal",
			`sandbox durationMs must be a non-negative number, got ${String(usage.durationMs)}`,
		);
	}
	// modelCostUsd is deliberately NOT passed: estimate() would fold it into
	// totalUsd, and the whole point of this file is that the model half is its
	// own line. Only computeUsd is read here.
	const priced = estimate(substrate, {
		durationMs: usage.durationMs,
		vcpu: usage.vcpu,
		memoryMib: usage.memoryMib,
		cpuUtilization: usage.cpuUtilization,
		creations: usage.creations ?? 0,
	});
	if (priced.computeUsd === undefined || priced.source === undefined) {
		return {
			kind: "sandbox",
			millicents: null,
			reason:
				priced.unknownReason ??
				`${substrate} produced no compute figure, so this run's sandbox cost is unknown`,
		};
	}
	const line: PricedLine = {
		kind: "sandbox",
		millicents: usdToMillicents(priced.computeUsd, "modeled sandbox cost"),
		provenance: "estimated",
		rate: { id: `${substrate}:compute`, source: priced.source },
		// The model filter is a guard, not a no-op: estimate() emits a "model" line
		// when a caller passes modelCostUsd, and if a future edit above ever did,
		// this detail string would silently claim the model spend was sandbox
		// compute.
		detail: priced.lines
			.filter((entry) => entry.label !== "model")
			.map((entry) => `${entry.label} ${entry.detail}`)
			.join(" + "),
	};
	if (priced.upperBound) line.upperBound = true;
	return line;
}

function modelLine(spend: ModelSpend): LedgerLine {
	if ("unknown" in spend) {
		return { kind: "model", millicents: null, reason: spend.unknown };
	}
	return {
		kind: "model",
		millicents: usdToMillicents(spend.usd, "model cost"),
		provenance: spend.provenance,
		rate: spend.rate,
		detail: spend.detail ?? `upstream-reported model spend $${spend.usd}`,
	};
}

/**
 * A derived amount inherits the WEAKEST provenance of its inputs, because a
 * percentage of a model is a model. Ordering: estimated is weaker than metered,
 * which is weaker than a fixed list price.
 */
function weakestProvenance(lines: readonly PricedLine[]): Provenance {
	let weakest: Provenance = "fixed";
	for (const line of lines) {
		if (line.provenance === "estimated") return "estimated";
		if (line.provenance === "metered") weakest = "metered";
	}
	return weakest;
}

function marginLine(policy: MarginPolicy | undefined, base: readonly LedgerLine[]): LedgerLine {
	if (policy === undefined) {
		return {
			kind: "margin",
			millicents: null,
			reason:
				"no margin policy was declared for this run, so the platform's take is unknown (an undeclared margin is not a zero margin)",
		};
	}
	if (policy.kind === "none") {
		// A DECLARED zero: the caller states the platform charges nothing on this
		// run. Distinct from the absent amount above, which states we do not know.
		return {
			kind: "margin",
			millicents: 0,
			provenance: "fixed",
			rate: { id: "margin:none", source: "declared: no platform margin on this run" },
			detail: "no platform margin",
		};
	}
	if (policy.kind === "flat") {
		if (!Number.isInteger(policy.millicents) || policy.millicents < 0) {
			throw new MuxError(
				"fatal",
				`flat margin must be a non-negative integer millicent amount, got ${String(policy.millicents)}`,
			);
		}
		return {
			kind: "margin",
			millicents: policy.millicents,
			provenance: "fixed",
			rate: { id: "margin:flat", source: policy.source },
			detail: `flat platform margin ${formatMillicents(policy.millicents)}`,
		};
	}
	if (!Number.isInteger(policy.basisPoints) || policy.basisPoints < 0) {
		throw new MuxError(
			"fatal",
			`percent margin basisPoints must be a non-negative integer, got ${String(policy.basisPoints)}`,
		);
	}
	const unpriced = base.filter((line) => !isPriced(line));
	if (unpriced.length > 0) {
		// A percentage of an unknown base is unknown. Charging 0 here would
		// under-bill every run on an unpriced lane while looking correct.
		return {
			kind: "margin",
			millicents: null,
			reason: `a ${policy.basisPoints}bp margin needs a priced base, and ${unpriced
				.map((line) => line.kind)
				.join(" and ")} ${unpriced.length === 1 ? "has" : "have"} no amount`,
		};
	}
	const priced = base.filter(isPriced);
	const baseMillicents = priced.reduce((sum, line) => sum + line.millicents, 0);
	// Integer arithmetic throughout: multiply first, then divide, so the only
	// rounding is the final one and it is stated.
	const millicents = Math.round((baseMillicents * policy.basisPoints) / 10_000);
	return {
		kind: "margin",
		millicents,
		provenance: weakestProvenance(priced),
		rate: { id: `margin:${policy.basisPoints}bp`, source: policy.source },
		detail: `${policy.basisPoints}bp of ${formatMillicents(baseMillicents)} pass-through (${priced
			.map((line) => line.kind)
			.join(" + ")})`,
	};
}

/**
 * Post one run's charge: three lines, priced where they can be, absent with a
 * reason where they cannot.
 *
 * Returns the entry as written, including its id -- which is what a later
 * correction must reference.
 */
export function appendCharge(input: ChargeInput): LedgerEntry {
	const sandbox = sandboxLine(input.substrate, input.sandbox);
	const model = modelLine(input.model);
	// Margin is computed on the pass-through lines only, never on itself.
	const margin = marginLine(input.margin, [sandbox, model]);
	const now = new Date().toISOString();
	return writeEntry({
		id: newEntryId(),
		kind: "charge",
		runKey: input.runKey,
		harness: input.harness,
		substrate: input.substrate,
		occurredAt: normalizeTimestamp(input.occurredAt ?? Date.now(), "charge occurredAt"),
		recordedAt: now,
		recordedBy: `${process.pid}@${hostname()}`,
		lines: [sandbox, model, margin],
	});
}

/** A line on a correction. Amounts are millicents, and may be negative. */
export type CorrectionLineInput =
	| {
			kind: LedgerLineKind;
			millicents: number;
			provenance: Provenance;
			rate: RateRef;
			detail: string;
	  }
	| { kind: LedgerLineKind; unknown: string };

export type CorrectionInput = {
	/** The entry being compensated, as returned by append or read. */
	original: LedgerEntry;
	/** Why the adjustment exists. Required: see LedgerEntry.reason. */
	reason: string;
	/** When the adjustment is issued. Defaults to now, NOT the original's time. */
	occurredAt?: string | number | Date;
	/** Omit for a full reversal of the original's lines. */
	lines?: CorrectionLineInput[];
};

function reversalLines(original: LedgerEntry): LedgerLine[] {
	return original.lines.map((line) => {
		if (!isPriced(line)) {
			// Reversing an amount that was never known is still not known. A 0 here
			// would claim the original charged nothing.
			return {
				kind: line.kind,
				millicents: null,
				reason: `reversal of an amount that was never priced: ${line.reason}`,
			};
		}
		return {
			// Negating an integer is exact, which is why a reversal nets to zero
			// with no rounding drift. This is also why correction amounts are taken
			// in millicents and never re-derived from USD.
			kind: line.kind,
			millicents: -line.millicents,
			provenance: line.provenance,
			rate: line.rate,
			detail: `reversal of ${original.id}: ${line.detail}`,
		};
	});
}

/**
 * Post a compensating entry against an existing one.
 *
 * This is the ONLY way to change what the ledger says, and it does not change
 * anything: the original line stays exactly as written and the two net out when
 * summed. Nothing in this module can rewrite a shard.
 */
export function appendCorrection(input: CorrectionInput): LedgerEntry {
	const original = validateEntry(input.original, "corrected entry");
	const lines: LedgerLine[] =
		input.lines === undefined
			? reversalLines(original)
			: input.lines.map((line) =>
					"unknown" in line
						? { kind: line.kind, millicents: null, reason: line.unknown }
						: {
								kind: line.kind,
								millicents: line.millicents,
								provenance: line.provenance,
								rate: line.rate,
								detail: line.detail,
							},
				);
	const now = new Date().toISOString();
	return writeEntry({
		id: newEntryId(),
		kind: "correction",
		// Copied from the original rather than accepted again, so a correction can
		// never be filed against a different run or route than the one it fixes.
		runKey: original.runKey,
		harness: original.harness,
		substrate: original.substrate,
		occurredAt: normalizeTimestamp(input.occurredAt ?? Date.now(), "correction occurredAt"),
		recordedAt: now,
		recordedBy: `${process.pid}@${hostname()}`,
		lines,
		corrects: original.id,
		reason: input.reason,
	});
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type ReadLedgerOptions = {
	/** Inclusive lower bound on occurredAt. */
	since?: string | number | Date;
	/** Inclusive upper bound on occurredAt. */
	until?: string | number | Date;
	/** Keep only the most recent N entries. Result stays oldest-first. */
	limit?: number;
};

function listShards(): { date: string; path: string }[] {
	const dir = ledgerDir();
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const shards: { date: string; path: string }[] = [];
	for (const entry of entries) {
		if (!entry.startsWith(SHARD_PREFIX) || !entry.endsWith(SHARD_SUFFIX)) continue;
		const date = entry.slice(SHARD_PREFIX.length, entry.length - SHARD_SUFFIX.length);
		if (!SHARD_DATE.test(date)) continue;
		shards.push({ date, path: join(dir, entry) });
	}
	// ISO dates sort lexicographically, so name order is day order.
	shards.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	return shards;
}

function readShard(path: string): LedgerEntry[] {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return [];
	}
	const entries: LedgerEntry[] = [];
	const lines = raw.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (trimmed.length === 0) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			// A process killed mid-append leaves one torn line, and only ever at the
			// tail: skipping it keeps the rest of the day readable. The damage is
			// bounded at two records, since the next append concatenates onto the
			// newline-less tail and is lost with it.
			continue;
		}
		// Anything that DID parse was written by something that believed it was
		// writing a ledger entry, so a shape failure is corruption or a hand edit,
		// not a torn write. Refusing to read it is the fail-closed choice: a total
		// that silently omits a record it did not understand is worse than an
		// error naming the line.
		entries.push(validateEntry(parsed, `${path}:${index + 1}`));
	}
	return entries;
}

/**
 * Read entries oldest-first over a time range on `occurredAt`: day shards in
 * date order, and within a shard the order they were appended in.
 *
 * A correction lands in the period it was issued (LedgerEntry.occurredAt), so a
 * window that ends before an adjustment was made will not net it -- read a
 * window that covers both, or check `LedgerSummary.danglingCorrections`.
 */
export function readLedger(options: ReadLedgerOptions = {}): LedgerEntry[] {
	const { limit } = options;
	if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
		throw new MuxError(
			"fatal",
			`readLedger limit must be a non-negative integer, got ${String(limit)}`,
		);
	}
	if (limit === 0) return [];
	const sinceMs = options.since === undefined ? undefined : epochMs(options.since, "since");
	const untilMs = options.until === undefined ? undefined : epochMs(options.until, "until");
	if (sinceMs !== undefined && untilMs !== undefined && sinceMs > untilMs) {
		// An inverted range is a caller bug, and returning an empty ledger for it
		// would read as "nothing was charged".
		throw new MuxError(
			"fatal",
			`readLedger since ${new Date(sinceMs).toISOString()} is after until ${new Date(untilMs).toISOString()}`,
		);
	}

	const newestFirst: LedgerEntry[][] = [];
	let total = 0;
	const shards = listShards();
	for (let index = shards.length - 1; index >= 0; index -= 1) {
		const shard = shards[index];
		// Shards are whole UTC days walked newest-first, so once one ends before
		// `since` every remaining shard does too.
		if (sinceMs !== undefined && dayEndMs(shard.date) < sinceMs) break;
		if (untilMs !== undefined && dayStartMs(shard.date) > untilMs) continue;
		const records = readShard(shard.path).filter((entry) => {
			const at = Date.parse(entry.occurredAt);
			if (sinceMs !== undefined && at < sinceMs) return false;
			if (untilMs !== undefined && at > untilMs) return false;
			return true;
		});
		newestFirst.push(records);
		total += records.length;
		if (limit !== undefined && total >= limit) break;
	}
	const ascending = newestFirst.reverse().flat();
	return limit === undefined ? ascending : ascending.slice(-limit);
}

// ---------------------------------------------------------------------------
// Summarize
// ---------------------------------------------------------------------------

export type ComponentTotal = {
	kind: LedgerLineKind;
	/** Lines of this kind in the window. 0 means none were posted at all. */
	lines: number;
	/** Lines of this kind that carried an amount. */
	pricedLines: number;
	total: LedgerTotal;
};

/**
 * One provenance bucket. These are STRICTLY SEPARATE sums: nothing in this
 * module adds two buckets together, because a metered figure and a modeled one
 * are not the same unit of truth. A caller that wants a combined number must
 * read `total`, which is labeled "mixed" when it is.
 */
export type ProvenanceTotal = {
	provenance: Provenance;
	lines: number;
	millicents: number;
	/** Which components contributed, so a bucket cannot hide its composition. */
	kinds: LedgerLineKind[];
};

type Aggregate = {
	entries: number;
	charges: number;
	corrections: number;
	lines: LedgerLine[];
};

export type RunLedger = {
	runKey: string;
	/** Routes seen for this run. More than one means the entries disagree. */
	routes: RouteKey[];
	entries: number;
	charges: number;
	corrections: number;
	byKind: Record<LedgerLineKind, ComponentTotal>;
	/** Net of every entry for this run in the window, corrections included. */
	total: LedgerTotal;
};

export type RouteLedger = {
	route: RouteKey;
	harness: HarnessKind;
	substrate: SubstrateKind;
	/** Distinct runKeys on this route in the window. */
	runs: number;
	entries: number;
	charges: number;
	corrections: number;
	byKind: Record<LedgerLineKind, ComponentTotal>;
	total: LedgerTotal;
};

export type LedgerSummary = {
	entries: number;
	charges: number;
	corrections: number;
	/** Lines with no amount. Every one of them withholds a total somewhere. */
	unpricedLines: number;
	byKind: Record<LedgerLineKind, ComponentTotal>;
	byProvenance: Record<Provenance, ProvenanceTotal>;
	byRun: Record<string, RunLedger>;
	byRoute: Partial<Record<RouteKey, RouteLedger>>;
	total: LedgerTotal;
	/**
	 * Corrections in this window whose target entry is not, so the runs they
	 * touch do not net here. Reported rather than quietly dropped: a window that
	 * contains half a correction pair is not wrong, but a reader who thinks it is
	 * a closed set would double-count or under-count.
	 */
	danglingCorrections: { id: string; corrects: string }[];
	/** occurredAt of the earliest and latest entry counted; absent when none. */
	from?: string;
	to?: string;
};

function newAggregate(): Aggregate {
	return { entries: 0, charges: 0, corrections: 0, lines: [] };
}

function absorb(aggregate: Aggregate, entry: LedgerEntry): void {
	aggregate.entries += 1;
	if (entry.kind === "charge") aggregate.charges += 1;
	else aggregate.corrections += 1;
	for (const line of entry.lines) aggregate.lines.push(line);
}

function componentTotals(lines: readonly LedgerLine[]): Record<LedgerLineKind, ComponentTotal> {
	const byKind = {} as Record<LedgerLineKind, ComponentTotal>;
	for (const kind of LEDGER_LINE_KINDS) {
		const own = lines.filter((line) => line.kind === kind);
		byKind[kind] = {
			kind,
			lines: own.length,
			pricedLines: own.filter(isPriced).length,
			total: totalOfLines(own),
		};
	}
	return byKind;
}

function provenanceTotals(lines: readonly LedgerLine[]): Record<Provenance, ProvenanceTotal> {
	const buckets = {} as Record<Provenance, ProvenanceTotal>;
	for (const provenance of ["metered", "estimated", "fixed"] as const) {
		buckets[provenance] = { provenance, lines: 0, millicents: 0, kinds: [] };
	}
	const kinds: Record<Provenance, Set<LedgerLineKind>> = {
		metered: new Set(),
		estimated: new Set(),
		fixed: new Set(),
	};
	for (const line of lines) {
		if (!isPriced(line)) continue;
		const bucket = buckets[line.provenance];
		bucket.lines += 1;
		bucket.millicents += line.millicents;
		kinds[line.provenance].add(line.kind);
	}
	for (const provenance of ["metered", "estimated", "fixed"] as const) {
		buckets[provenance].kinds = [...kinds[provenance]].sort();
	}
	return buckets;
}

/**
 * Totals by run, by route and by provenance over a window.
 *
 * Pass entries to summarize them directly, or read options to pull the window
 * off disk first. Every entry is revalidated, so a hand-built fixture is held to
 * the same rules as a stored one.
 *
 * With zero entries every total reads `known: true, millicents: 0, provenance:
 * "none"` and every `lines` count is 0: that is the empty set, not a measurement
 * that the window was free. Check `entries` before believing a figure.
 */
export function summarizeLedger(input?: LedgerEntry[] | ReadLedgerOptions): LedgerSummary {
	const entries = Array.isArray(input)
		? input.map((entry, index) => validateEntry(entry, `entry ${index}`))
		: readLedger(input);

	const overall = newAggregate();
	const runs = new Map<string, { routes: Set<RouteKey>; aggregate: Aggregate }>();
	const routes = new Map<
		RouteKey,
		{
			harness: HarnessKind;
			substrate: SubstrateKind;
			runKeys: Set<string>;
			aggregate: Aggregate;
		}
	>();
	const ids = new Set<string>();
	const corrections: { id: string; corrects: string }[] = [];
	let from: string | undefined;
	let to: string | undefined;

	for (const entry of entries) {
		absorb(overall, entry);
		ids.add(entry.id);
		if (entry.corrects !== undefined) {
			corrections.push({ id: entry.id, corrects: entry.corrects });
		}
		let run = runs.get(entry.runKey);
		if (!run) {
			run = { routes: new Set(), aggregate: newAggregate() };
			runs.set(entry.runKey, run);
		}
		run.routes.add(routeKey(entry.harness, entry.substrate));
		absorb(run.aggregate, entry);
		const key = routeKey(entry.harness, entry.substrate);
		let route = routes.get(key);
		if (!route) {
			route = {
				harness: entry.harness,
				substrate: entry.substrate,
				runKeys: new Set(),
				aggregate: newAggregate(),
			};
			routes.set(key, route);
		}
		route.runKeys.add(entry.runKey);
		absorb(route.aggregate, entry);
		// Compared as strings: normalized UTC ISO 8601 sorts chronologically.
		if (from === undefined || entry.occurredAt < from) from = entry.occurredAt;
		if (to === undefined || entry.occurredAt > to) to = entry.occurredAt;
	}

	const summary: LedgerSummary = {
		entries: overall.entries,
		charges: overall.charges,
		corrections: overall.corrections,
		unpricedLines: overall.lines.filter((line) => !isPriced(line)).length,
		byKind: componentTotals(overall.lines),
		byProvenance: provenanceTotals(overall.lines),
		byRun: {},
		byRoute: {},
		total: totalOfLines(overall.lines),
		danglingCorrections: corrections.filter((entry) => !ids.has(entry.corrects)),
	};
	// Built through Object.fromEntries, which defines own properties, rather than
	// by assignment. A run key is caller-chosen text (a URL, "org/repo#42", a
	// prompt digest), so it can be "__proto__" -- and `byRun[key] = value` would
	// then hit the prototype setter and drop the run out of the summary entirely.
	// A money record silently missing a run is the worst available outcome.
	summary.byRun = Object.fromEntries(
		[...runs].map(([runKey, run]) => [
			runKey,
			{
				runKey,
				routes: [...run.routes].sort(),
				entries: run.aggregate.entries,
				charges: run.aggregate.charges,
				corrections: run.aggregate.corrections,
				byKind: componentTotals(run.aggregate.lines),
				total: totalOfLines(run.aggregate.lines),
			},
		]),
	);
	for (const [key, route] of routes) {
		summary.byRoute[key] = {
			route: key,
			harness: route.harness,
			substrate: route.substrate,
			runs: route.runKeys.size,
			entries: route.aggregate.entries,
			charges: route.aggregate.charges,
			corrections: route.aggregate.corrections,
			byKind: componentTotals(route.aggregate.lines),
			total: totalOfLines(route.aggregate.lines),
		};
	}
	if (from !== undefined) summary.from = from;
	if (to !== undefined) summary.to = to;
	return summary;
}

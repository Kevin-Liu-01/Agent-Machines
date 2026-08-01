/**
 * Rate provenance on a run trace (roadmap 4.1), carried as `extra.price`.
 *
 * TWO DIFFERENT BASES, and conflating them is how "we optimize price" becomes
 * false. `extra.outcome.sandboxCostBasis` (see route-outcomes.ts) is the
 * provenance of the FIGURE -- `estimated` from a rate table against the spec,
 * versus `metered` from a provider bill. This block is the provenance of the
 * RATE behind that figure -- `published` by the vendor, or `unknown`. A figure
 * can be an estimate over a published rate (what ingest writes today) and that
 * is a different thing from an estimate over an invented rate (what it wrote
 * before). Only the first may rank a lane on price.
 *
 * Written next to the outcome block rather than inside it so that neither
 * module has to know the other's schema version, and so a reader that only
 * understands the outcome block keeps working unchanged.
 *
 * Rides in `run_traces.extra` (jsonb), so no Supabase migration is required.
 */

/** Schema version of the `extra.price` block ingest writes. */
export const TRACE_PRICE_VERSION = 1;

export type TraceRateBasis = "published" | "unknown";

const RATE_BASES: ReadonlyArray<TraceRateBasis> = ["published", "unknown"];

/**
 * The rate provenance for one ingested run.
 *
 * TWO SEPARATE FACTS, because they fail independently. `rateBasis` is about the
 * LANE -- does the vendor publish a compute rate at all. `costRanked` is about
 * this ROW -- did a published rate actually produce a figure here. A run on a
 * published lane whose wall clock is unusable is `rateBasis: "published"` with
 * `costRanked: false`: recording it as an unknown rate would libel a lane we
 * can in fact price, and recording it as ranked would admit a missing number.
 *
 * `costRanked: false` is a first-class outcome, not an error: the run counts
 * for success and latency, and only its price is unavailable. The sandbox
 * figure in the outcome block is null on such a row -- never a substituted rate
 * from another vendor's table.
 */
export type TraceLanePrice = {
	v: typeof TRACE_PRICE_VERSION;
	/** The lane this rate belongs to, recorded so a reader need not re-derive it. */
	substrate: string;
	rateBasis: TraceRateBasis;
	/** True only when a published rate produced this row's sandbox figure. */
	costRanked: boolean;
	/** Why this row is not cost-ranked. Null exactly when costRanked is true. */
	reason: string | null;
};

/**
 * The union makes the unrepresentable unrepresentable: an unknown rate always
 * carries the reason it is unknown, so no writer can produce a refusal a caller
 * cannot explain.
 */
export type TraceLanePriceInput =
	| { substrate: string; rateBasis: "published"; unknownReason?: string }
	| { substrate: string; rateBasis: "unknown"; unknownReason: string };

export function buildTraceLanePrice(input: TraceLanePriceInput): TraceLanePrice {
	const costRanked = input.rateBasis === "published" && input.unknownReason === undefined;
	// An empty reason would build a block the strict reader rejects, silently
	// demoting the row to "legacy". Saying the writer recorded no reason is a
	// true statement about the record; inventing a pricing rationale is not.
	const reason = input.unknownReason || "no reason recorded by the writer";
	return {
		v: TRACE_PRICE_VERSION,
		substrate: input.substrate,
		rateBasis: input.rateBasis,
		costRanked,
		reason: costRanked ? null : reason,
	};
}

/**
 * Strictly read the price block out of untyped jsonb.
 *
 * Anything malformed, or from an unknown schema version, is rejected outright
 * rather than partially understood: the caller's fallback is "this row has no
 * rate provenance", which keeps it out of the cost posterior. A half-parsed
 * block would instead admit an unpriced run as a priced one.
 */
export function readTraceLanePrice(extra: unknown): TraceLanePrice | null {
	if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
	const block = (extra as { price?: unknown }).price;
	if (!block || typeof block !== "object" || Array.isArray(block)) return null;
	const p = block as Record<string, unknown>;
	if (p.v !== TRACE_PRICE_VERSION) return null;
	if (typeof p.substrate !== "string" || p.substrate === "") return null;
	if (typeof p.rateBasis !== "string" || !RATE_BASES.includes(p.rateBasis as TraceRateBasis)) {
		return null;
	}
	if (typeof p.costRanked !== "boolean") return null;
	if (p.reason !== null && typeof p.reason !== "string") return null;
	// Incoherent rows are refused rather than half-read: a ranked row must be a
	// published lane with nothing to explain, and a refused row must explain
	// itself. An unknown rate that claims to be rankable is the exact shape this
	// block exists to make impossible.
	const coherent = p.costRanked
		? p.rateBasis === "published" && p.reason === null
		: typeof p.reason === "string" && p.reason.length > 0;
	if (!coherent) return null;
	return {
		v: TRACE_PRICE_VERSION,
		substrate: p.substrate,
		rateBasis: p.rateBasis as TraceRateBasis,
		costRanked: p.costRanked,
		reason: p.reason as string | null,
	};
}

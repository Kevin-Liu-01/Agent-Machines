/**
 * Health signal for the hosted control plane (ROADMAP pillar 6, hosted half).
 *
 * The hosted plane already walks a credentialed order and records every attempt
 * (`lib/mux/failover.ts`, ROADMAP 0.3), but it walked that order BLIND: a lane
 * whose control plane was refusing every request cost a full failed
 * provisioning attempt on every create, and the next request paid it again.
 * Sprites cold create alone measured 17-31s (docs/MUX-RESULTS.md), so a lane
 * that is down is not a cheap mistake. This module is the missing signal: the
 * breaker that `src/mux/health.ts` already implements, loaded from and saved to
 * the CALLING TENANT's row, handed to the failover walk as an advisory ordering
 * plus an outcome sink.
 *
 * WHY the breaker itself is value-imported instead of reimplemented here:
 * `lib/mux/failover.ts` reimplements `create()`'s walk because when it was
 * written a value import out of `src/mux` did not resolve under Turbopack. That
 * blocker is gone -- since the 0.2 deletion (2026-08-03) the four hosted
 * adapters value-import `agent-machines/mux/providers/*` through the compiled
 * package, so `build:sdk` is already a build-order dependency of `next build`.
 * A second circuit breaker would be a second tuning to drift: `openAfter`,
 * `cooldownMs`, the window, the "fatal never opens a circuit" rule and the
 * snapshot version all have to be ONE implementation, or the doc guard's
 * derived tuning check (`src/lib/mux-docs.test.ts`) would be checking the wrong
 * copy. So the breaker is the mux's, and this file is scope + I/O only.
 *
 * Three properties this file owes:
 *
 *   PER TENANT, never shared. The snapshot is read and written through
 *   `SupabasePlacementStore`, whose every statement is filtered on `tenant_id`
 *   and whose health row is a separate row from every placement (guarantee 3 in
 *   `lib/mux/placement-store.ts`). One user's expired E2B key must not open
 *   another user's E2B circuit -- their credentials, quotas and regions are
 *   different, so their evidence is not comparable. This is also why no module
 *   global appears anywhere below: a serverless process serves concurrent
 *   requests for different users, the same hazard that made
 *   `setPlacementStore()` unusable from `web/` (see `lib/mux/hosted-mux.ts`).
 *
 *   ADVISORY, never exclusive, and never fatal to a provision. A read that
 *   fails degrades to "no history" (the configured order, unchanged) and a write
 *   that fails costs one sample. Losing the breaker must never cost a machine:
 *   the failure mode of guessing wrong here is one wasted attempt, while the
 *   failure mode of throwing is a user who cannot provision because a
 *   bookkeeping table was unreachable.
 *
 *   ONE ROUND TRIP on the create path. `loadTenantHealth()` reads once; the
 *   returned gate holds the breaker in memory for the rest of the request.
 *   Saves happen per recorded outcome, which is at most one per lane walked.
 */

import { SubstrateHealth } from "agent-machines/mux/health";

import type {
	HealthOutcome,
	HealthState,
	SubstrateHealthSnapshot,
} from "../../../src/mux/health.js";
import type { SubstrateKind as MuxSubstrateKind } from "../../../src/mux/types.js";

import type { SubstrateKind } from "@/lib/mux/capabilities";
import { createSupabasePlacementStore } from "@/lib/mux/placement-store";
import type { ProviderError } from "@/lib/providers/types";

/**
 * Compile-time proof that a hosted substrate name is a name the breaker knows.
 *
 * `lib/mux/placement-store.ts` proves the other direction (the web mirror covers
 * every mux kind, so no live placement is hidden). This is the direction THIS
 * file needs: every `order()` and `record()` call below passes a web
 * `SubstrateKind` straight into the mux breaker, so a mirror member the mux does
 * not have would be a lane whose samples land under a key nothing reads.
 */
export type HostedSubstratesAreMuxSubstrates = SubstrateKind extends MuxSubstrateKind
	? true
	: never;
export const HOSTED_SUBSTRATES_ARE_MUX_SUBSTRATES: HostedSubstratesAreMuxSubstrates = true;

/**
 * Classify a hosted provider failure as a health signal.
 *
 * This is `outcomeForError()` from `src/mux/health.ts` restated over
 * `ProviderError` instead of over a thrown `MuxError`, and it has to be
 * restated: a `MachineProviderError` crossing the package boundary fails
 * `instanceof MuxError`, so calling the mux function directly would classify
 * EVERY hosted failure as `transient` -- including a missing credential, which
 * would permanently demote a lane for something no cooldown can heal.
 * `health.test.ts` asserts kind-for-kind agreement with the real
 * `outcomeForError`, so the restatement cannot drift.
 *
 * `null` means "do not record at all".
 */
export function healthOutcomeFor(kind: ProviderError): HealthOutcome | null {
	switch (kind) {
		// Static facts about configuration, which `resolveRoute` already screens
		// out. Folding them into the window would demote a lane forever.
		case "missing_credentials":
		case "not_supported":
			return null;
		// Recorded for diagnostics, never opens a circuit: the substrate
		// correctly rejecting a request says nothing about reachability.
		case "fatal":
			return "fatal";
		// A throttled lane genuinely cannot serve until its window resets, which
		// is exactly what the breaker's cooldown expresses.
		case "rate_limited":
		case "transient":
			return "transient";
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unclassified provider error kind: ${String(exhaustive)}`);
		}
	}
}

/**
 * The slice of `PlacementStore` this module drives. Narrower than the real
 * contract on purpose: a health gate has no business remembering or forgetting a
 * machine, and the narrow type is what lets a test hand in three lines instead
 * of a fake Postgres.
 */
export type HealthStore = {
	read(): Promise<{ health?: SubstrateHealthSnapshot }>;
	saveHealth(snapshot: SubstrateHealthSnapshot): Promise<void>;
};

/**
 * What the failover walk is given. Deliberately not the breaker itself: the walk
 * may reorder and report, and must not be able to reset a tenant's history or
 * read another tenant's.
 */
export type HostedHealthGate = {
	/**
	 * Reorder candidates healthy -> degraded -> open, preserving the caller's
	 * order inside each tier. Always a permutation: nothing is ever removed.
	 */
	order(route: readonly SubstrateKind[]): SubstrateKind[];
	/** Breaker verdict for one lane, for attempt annotation and messages. */
	stateOf(substrate: SubstrateKind): HealthState;
	/** Record a success and persist. Never throws. */
	noteOk(substrate: SubstrateKind, latencyMs?: number): Promise<void>;
	/** Record a failure and persist, per `healthOutcomeFor`. Never throws. */
	noteFailure(
		substrate: SubstrateKind,
		kind: ProviderError,
		latencyMs?: number,
	): Promise<void>;
	/**
	 * False when the tenant's snapshot could not be read, so this gate started
	 * from no history. Surfaced rather than hidden: "every lane looks healthy"
	 * and "the breaker never loaded" order routes identically, and only one of
	 * them is a working system.
	 */
	readonly loaded: boolean;
};

/**
 * A gate that does nothing, for a caller with no tenant to scope to.
 *
 * Returned rather than throwing, and returned rather than `undefined`, so the
 * "no health" path is the same code path as the healthy one: an anonymous or
 * unscoped caller gets the configured order and no samples, which is exactly the
 * behavior the hosted plane had before this module existed.
 */
export function noHealthGate(): HostedHealthGate {
	return {
		order: (route) => [...route],
		stateOf: () => "healthy",
		noteOk: async () => {},
		noteFailure: async () => {},
		loaded: false,
	};
}

export type LoadTenantHealthOptions = {
	/** Scope key: the effective user id, as every other hosted table uses. */
	tenantId: string;
	/** Injected in tests. Production resolves the tenant's Supabase store. */
	store?: HealthStore;
	/** Injected clock, so a test can age a window exactly. */
	now?: () => number;
};

/**
 * Load the calling tenant's breaker and return the gate over it.
 *
 * Never rejects. An unreadable snapshot is reported through `loaded: false` and
 * a `console.warn` -- visible to an operator, invisible to the user, and
 * ordering degrades to the configured route rather than failing the request.
 */
export async function loadTenantHealth(
	options: LoadTenantHealthOptions,
): Promise<HostedHealthGate> {
	const tenantId = typeof options.tenantId === "string" ? options.tenantId.trim() : "";
	if (tenantId.length === 0) {
		// An unscoped gate would either read every tenant's samples or write into
		// a shared row; both are worse than no health at all.
		return noHealthGate();
	}
	const store = options.store ?? createSupabasePlacementStore(tenantId);
	const healthOptions = options.now === undefined ? {} : { now: options.now };

	let breaker = new SubstrateHealth(healthOptions);
	let loaded = false;
	try {
		const state = await store.read();
		// fromJSON version-checks the snapshot and re-parses every sample, so a
		// row written by a newer build degrades to "no history" instead of
		// pinning routing to a lane that no longer exists.
		breaker = SubstrateHealth.fromJSON(state?.health, healthOptions);
		loaded = true;
	} catch (error) {
		// A later save then replaces the row with a window that starts here. That
		// is the store's documented health semantics -- last writer wins, because
		// a snapshot is one whole-store aggregate with no per-key merge (see
		// src/mux/state.ts) -- and it costs at most a delayed circuit, never a
		// machine. The warn is the only place this is visible, which is why it
		// exists: "every lane looks healthy" and "the breaker never loaded" order
		// a route identically.
		console.warn(
			`[mux health] could not read the breaker snapshot; routing this request on the configured order: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	const persist = async (): Promise<void> => {
		try {
			await store.saveHealth(breaker.toJSON());
		} catch (error) {
			// Losing a sample only delays a circuit opening. Never fail a
			// provision because the bookkeeping row could not be written.
			console.warn(
				`[mux health] could not persist the breaker snapshot: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	};

	return {
		order: (route) => breaker.order(route),
		stateOf: (substrate) => breaker.state(substrate),
		noteOk: async (substrate, latencyMs) => {
			breaker.record(substrate, "ok", latencyMs);
			await persist();
		},
		noteFailure: async (substrate, kind, latencyMs) => {
			const outcome = healthOutcomeFor(kind);
			// Nothing recorded means nothing to save: a missing credential must
			// not even rewrite the row, or every uncredentialed request would
			// churn it.
			if (outcome === null) return;
			breaker.record(substrate, outcome, latencyMs);
			await persist();
		},
		loaded,
	};
}

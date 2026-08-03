/**
 * Create-time failover for the hosted control plane (ROADMAP 0.3).
 *
 * `lib/mux/route.ts` already computes the credential-gated lane order that the
 * mux router computes, and nothing walked it: the hosted provisioning route
 * returned 502 on the first provider error (ROADMAP section 2, pillar 6 --
 * "The hosted control plane has no failover at all"). This module walks it.
 *
 * The contract is the one `src/mux/router.ts` `create()` proved out, and it is
 * REIMPLEMENTED rather than imported on purpose: the compiled `dist/` is the
 * only import form Turbopack resolves, because it applies no `.js` -> `.ts`
 * extension alias anywhere in this project and every ESM specifier in `src/mux`
 * carries `.js` (measured 2026-08-02, ROADMAP 3c). Importing the built package
 * would make `build:sdk` a build-order dependency of `next build`; importing
 * only the mux *types* -- which SWC erases before the bundler sees them -- costs
 * nothing and still keeps the attempt record from drifting away from
 * `RouteAttempt`.
 *
 * What this is NOT: health-aware, capability-filtered, or learned selection.
 * The hosted side has no outcome window, no circuit breaker, no constraint
 * filter and no policy in this path. It is create-time failover across a
 * credential-gated order, and the docs must say that and no more (ROADMAP
 * section 4).
 */

import type { RouteAttempt } from "../../../src/mux/types.js";

import type { SubstrateKind } from "@/lib/mux/capabilities";
import type { ResolvedRoute } from "@/lib/mux/route";
import { asMachineProviderError } from "@/lib/providers/mux-facade";
import {
	MachineProviderError,
	type ProviderError,
} from "@/lib/providers/types";

/**
 * One lane's outcome while placing a machine, in the same vocabulary the mux
 * records so a dashboard can render either source with one component. An
 * unexplainable route is a bug in this repo, so every lane the walk touched
 * gets a record -- including the ones it never tried.
 */
export type ProvisionAttempt = {
	substrate: SubstrateKind;
	outcome: "ok" | "skipped" | "failed";
	/** Why the lane was skipped or failed. Absent only on `ok`. */
	reason?: string;
	/** Measured wall time for a lane that was actually tried. */
	durationMs?: number;
};

/**
 * Compile-time proof that the hosted attempt record is a mux `RouteAttempt`.
 * If either side renames a field or adds an outcome, this fails `tsc` instead
 * of shipping two subtly different explanations of the same decision.
 */
export type ProvisionAttemptMatchesMux = ProvisionAttempt extends RouteAttempt
	? true
	: never;
export const PROVISION_ATTEMPT_MATCHES_MUX: ProvisionAttemptMatchesMux = true;

/** Anything the walk can hand back must name the sandbox it created. */
export type ProvisionedMachine = { machineId: string };

export type FailoverLane<T extends ProvisionedMachine> = {
	/** Place the machine on one substrate. Rejecting fails only that lane. */
	provision(substrate: SubstrateKind): Promise<T>;
	/**
	 * Post-provision acceptance check. Throwing here rejects a lane whose
	 * sandbox already exists, which is precisely the case `teardown` covers.
	 */
	accept?(substrate: SubstrateKind, created: T): void | Promise<void>;
	/**
	 * Destroy a sandbox that was provisioned before a later step failed. Always
	 * addressed by the machineId the walk provisioned -- never by a globally
	 * "active" machine (postmortem 2026-05-18, item 2).
	 */
	teardown(substrate: SubstrateKind, machineId: string): Promise<void>;
};

export type FailoverResult<T extends ProvisionedMachine> =
	| {
			ok: true;
			/** The lane the machine actually landed on. */
			substrate: SubstrateKind;
			created: T;
			attempts: ProvisionAttempt[];
	  }
	| { ok: false; error: MachineProviderError; attempts: ProvisionAttempt[] };

/**
 * Whether a failed lane says anything about the next one.
 *
 * Mirrors `isRoutableError` in `src/mux/types.ts`. `missing_credentials` and
 * `not_supported` fail identically on every lane, so retrying them burns time
 * to reach the same answer. `fatal` IS routable, and that is not an oversight:
 * a vendor-side 4xx is per-account, and the one that bit us in production was a
 * machine-quota wall on Dedalus (postmortem 2026-05-18, item 5) -- which says
 * nothing at all about whether E2B will accept the same request.
 */
export function isRoutableProviderError(kind: ProviderError): boolean {
	switch (kind) {
		case "missing_credentials":
		case "not_supported":
			return false;
		case "rate_limited":
		case "transient":
		case "fatal":
			return true;
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unclassified provider error kind: ${String(exhaustive)}`);
		}
	}
}

/**
 * States a freshly provisioned machine must never be left in.
 *
 * Both come from a vendor phase the adapters map explicitly -- Dedalus
 * `failed`, Vercel `failed`/`aborted` (`lib/providers/*`) -- so this is the
 * substrate reporting its own machine dead, not us guessing. `unknown` is
 * deliberately absent: it means the status read did not answer, and the machine
 * is recorded and visible in the fleet, so destroying it would throw away a
 * sandbox that may be perfectly alive.
 */
const UNUSABLE_FRESH_STATES: ReadonlySet<string> = new Set([
	"error",
	"destroyed",
]);

/**
 * Reject a lane that provisioned a dead machine.
 *
 * Without this the route answered `ok: true` with `state: "error"` and the user
 * got a machine that cannot run and still consumes vendor quota -- the invisible
 * orphans of postmortem 2026-05-18 item 5. Classified `transient` because
 * nothing about the request was rejected: this placement died, and the next
 * lane may well accept the identical create.
 */
export function assertUsableProvisionState(
	substrate: SubstrateKind,
	machineId: string,
	state: string,
): void {
	if (!UNUSABLE_FRESH_STATES.has(state)) return;
	throw new MachineProviderError(
		substrate,
		"transient",
		`${substrate} provisioned ${machineId} but reported state "${state}"`,
	);
}

function describeAttempts(attempts: readonly ProvisionAttempt[]): string {
	return attempts
		.map(
			(attempt) =>
				`${attempt.substrate}=${attempt.outcome}${
					attempt.reason ? ` (${attempt.reason})` : ""
				}`,
		)
		.join(", ");
}

/**
 * Walk a resolved route in order, placing the machine on the first lane that
 * accepts it.
 *
 * Failure is RETURNED, not thrown, because the attempts are the point: an
 * exception would force every caller to reach into an error object to explain
 * the route, and one of them would forget.
 */
export async function provisionWithFailover<T extends ProvisionedMachine>(input: {
	/** Credentialed lanes in preference order, from `resolveRoute`. */
	route: readonly SubstrateKind[];
	/** Lanes `resolveRoute` dropped, recorded so the skip is explainable. */
	skipped: ResolvedRoute["skipped"];
	/** The lane the caller asked for, used to attribute a route-wide failure. */
	primary: SubstrateKind;
	lane: FailoverLane<T>;
	/** Injectable clock so attempt durations are assertable in tests. */
	now?: () => number;
}): Promise<FailoverResult<T>> {
	const now = input.now ?? Date.now;
	const attempts: ProvisionAttempt[] = input.skipped.map((entry) => ({
		substrate: entry.substrate,
		outcome: "skipped",
		reason: `missing credentials: ${entry.missing.join(", ")}`,
	}));

	if (input.route.length === 0) {
		return {
			ok: false,
			attempts,
			error: new MachineProviderError(
				input.primary,
				"missing_credentials",
				`No substrate is credentialed for this request. ${describeAttempts(
					attempts,
				)}`,
			),
		};
	}

	let lastError: MachineProviderError | null = null;
	for (const substrate of input.route) {
		const startedAt = now();
		// Tracked so a failure *after* provisioning tears the sandbox down
		// instead of leaving it billing while the walk moves on. This is the
		// leak the mux had and fixed (src/mux/router.ts create()); it must not
		// be reintroduced on the hosted side.
		let created: T | null = null;
		try {
			created = await input.lane.provision(substrate);
			await input.lane.accept?.(substrate, created);
			attempts.push({
				substrate,
				outcome: "ok",
				durationMs: now() - startedAt,
			});
			return { ok: true, substrate, created, attempts };
		} catch (error) {
			const failure =
				error instanceof MachineProviderError
					? error
					: asMachineProviderError(substrate, "provision", null, error);
			if (created !== null) {
				const machineId = created.machineId;
				try {
					await input.lane.teardown(substrate, machineId);
				} catch (teardownError) {
					// A teardown failure must not mask the real error, but it is
					// recorded as its own attempt so a leak is never silent.
					attempts.push({
						substrate,
						outcome: "failed",
						reason: `orphaned sandbox ${machineId}: teardown failed: ${
							teardownError instanceof Error
								? teardownError.message
								: String(teardownError)
						}`,
					});
				}
			}
			attempts.push({
				substrate,
				outcome: "failed",
				reason: failure.message,
				durationMs: now() - startedAt,
			});
			lastError = failure;
			if (!isRoutableProviderError(failure.kind)) {
				return { ok: false, error: failure, attempts };
			}
		}
	}

	// Every lane was tried and every lane failed. The kind carried forward is
	// the last one so the caller's HTTP mapping stays honest, and the message
	// names every lane because "provision failed" alone is unactionable.
	const kind: ProviderError = lastError?.kind ?? "transient";
	return {
		ok: false,
		attempts,
		error: new MachineProviderError(
			lastError?.providerKind ?? input.primary,
			kind,
			`All ${input.route.length} credentialed substrate(s) failed: ${describeAttempts(
				attempts,
			)}`,
		),
	};
}

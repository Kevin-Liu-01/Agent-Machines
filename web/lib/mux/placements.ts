/**
 * The hosted plane's placement seam: what the MUX ROUTER remembers about this
 * one tenant's machines, and how the hosted verbs keep that memory true.
 *
 * WHY this module exists. `createHostedMux()` (lib/mux/hosted-mux.ts) built a
 * mux whose placement store is Supabase and scoped to one user -- and nothing
 * called it, so the store was installable but never installed and every
 * tenant's placement table stayed empty. The hosted endpoints provision
 * through the provider FACADE (lib/providers/*), not through the router, which
 * is correct: the facade is what the bootstrap runner, the terminal, exec and
 * the dashboard all drive. But that leaves the router with no memory of the
 * fleet, so `mux.connect("box")` from the SDK cannot find a machine the
 * dashboard created, and the two planes disagree about where "box" lives.
 *
 * This module is the narrow bridge, in three parts:
 *
 *   read   -- `readHostedPlacements()` asks the ROUTER (not the store object)
 *             what it remembers, and joins it against the machines table so
 *             DRIFT IN BOTH DIRECTIONS is reported rather than hidden.
 *   record -- `recordHostedPlacement()` writes one placement, called
 *             POST-COMMIT and best-effort by the two verbs whose whole
 *             contract is the placement (agent switch, migrate).
 *   forget -- `forgetHostedPlacement()` prunes a placement when the hosted
 *             plane has the substrate's own authority that the sandbox is
 *             gone (a destroy), or when the record it described is being
 *             removed and nothing would ever be able to prune it again.
 *
 * WHY the router is never on a PRIMARY path here. Every function returns a
 * typed result and none of them throw: a placement mirror that could fail an
 * agent switch or a migration would trade a correct operation for a bookkeeping
 * error, and both of those verbs have already committed by the time they call
 * in. The record/forget calls therefore sit exactly where migrate.ts already
 * puts its source teardown and terminal state writes -- after the point of no
 * return, reported, never silent.
 *
 * WHY the placement name is guarded (`resolvePlacementName`). Mux placements
 * are keyed by NAME, unique per tenant, and the hosted plane does NOT enforce
 * unique machine names -- nothing in provision.ts or the machines route checks
 * one. Writing a placement for an ambiguous name would make `mux.connect(name)`
 * hand the SDK whichever machine wrote last, i.e. a sandbox the dashboard row
 * of that name does not describe. That is worse than no placement at all, so an
 * ambiguous name is REFUSED with a reason. The archived flag is what makes
 * migrate's own case unambiguous: at commit the old record is archived and the
 * new one carries the name.
 *
 * WHY forget is guarded by sandboxId. After a migration the name "box" points
 * at the NEW sandbox while the OLD record still exists (archived, or live under
 * `source: "keep"`). Destroying that old record must not forget "box" -- that
 * would strand the new sandbox, unreachable by name from the SDK while it keeps
 * billing. So forget only fires when the stored placement still names THIS
 * machine's sandbox id.
 */

import { createHostedMux } from "@/lib/mux/hosted-mux";
import { createSupabasePlacementStore } from "@/lib/mux/placement-store";
import { resolveRoute, toSubstrateKind } from "@/lib/mux/route";
import type { MachineRef, ProviderKind, UserConfig } from "@/lib/user-config/schema";

// Types only -- erased before Turbopack sees them (placement-store.ts header).
import type { RememberedMachine } from "../../../src/mux/state.js";
import type { SandboxDescription, SubstrateKind } from "../../../src/mux/types.js";

/**
 * Outcome of one mirror attempt. A skip is as reportable as a write: "we did
 * not remember this and here is why" is the honest answer, and the two verbs
 * put it in their response/report rather than a log line nobody reads.
 */
export type PlacementMirrorResult =
	| { recorded: true; name: string }
	| { recorded: false; reason: string };

/** Outcome of one prune attempt; same reasoning as PlacementMirrorResult. */
export type PlacementForgetResult =
	| { forgotten: true; name: string }
	| { forgotten: false; reason: string };

export type PlacementRow = {
	name: string;
	substrate: SubstrateKind;
	sandboxId: string;
	agent: RememberedMachine["agent"];
	updatedAt: string;
	/**
	 * The machine record this placement points at, matched BY SANDBOX ID (the
	 * only stable join: names are not unique and ids are). Null means the mux
	 * remembers a sandbox the machines table does not -- a placement the
	 * dashboard cannot explain, which is exactly the drift worth showing.
	 */
	machineId: string | null;
	/** True when the record exists but says a different substrate/agent. */
	disagrees: boolean;
	/**
	 * False when this lane has no credentials on file right now, with the
	 * missing keys named. A placement on an uncredentialed lane is remembered
	 * but not connectable, and presenting it as usable would be the lie.
	 */
	credentialed: boolean;
	missingCredentials: string[];
};

export type HostedPlacements = {
	placements: PlacementRow[];
	/**
	 * Live machine records with NO placement. Expected today rather than a
	 * fault: only the agent-switch and migrate verbs mirror, so a machine that
	 * has only ever been provisioned is remembered by the machines table alone.
	 */
	unremembered: Array<{ machineId: string; name: string; providerKind: ProviderKind }>;
};

function credentialCheck(
	config: UserConfig,
	substrate: SubstrateKind,
): { ok: boolean; missing: string[] } {
	// The pinned-lane idiom (migrate route, provision-machine failover:false):
	// this lane or nothing, so `skipped` names exactly its missing keys.
	const { route, skipped } = resolveRoute(config, { primary: substrate, order: [substrate] });
	if (route.length > 0) return { ok: true, missing: [] };
	return { ok: false, missing: skipped.find((s) => s.substrate === substrate)?.missing ?? [] };
}

/**
 * The mux name for this machine, or the reason it must not be written.
 *
 * Fail closed on both cases a wrong placement could come from: a blank name
 * (the placement key would be unusable) and a name borne by more than one LIVE
 * machine (the placement would describe whichever wrote last).
 */
export function resolvePlacementName(
	config: UserConfig,
	machine: Pick<MachineRef, "id" | "name">,
): { ok: true; name: string } | { ok: false; reason: string } {
	const name = machine.name.trim();
	if (!name) {
		return {
			ok: false,
			reason: `machine ${machine.id} has no name; a mux placement is keyed by name`,
		};
	}
	const sharing = config.machines.filter((m) => !m.archived && m.name.trim() === name);
	if (sharing.length > 1) {
		return {
			ok: false,
			reason: `${sharing.length} live machines are named "${name}" (${sharing
				.map((m) => m.id)
				.join(", ")}); a placement keyed by that name would resolve to whichever wrote last`,
		};
	}
	// A machine that is itself archived may still be the sole bearer of the
	// name; what must not happen is claiming a name a DIFFERENT live machine
	// holds.
	const holder = sharing[0];
	if (holder && holder.id !== machine.id) {
		return {
			ok: false,
			reason: `"${name}" is the live machine ${holder.id}, not ${machine.id}`,
		};
	}
	return { ok: true, name };
}

/**
 * Remember one machine's placement for this tenant.
 *
 * Never throws: every caller is post-commit, where a store failure must be
 * reported and moved past, not turned into a failed operation whose real work
 * already succeeded.
 */
export async function recordHostedPlacement(args: {
	userId: string;
	config: UserConfig;
	machine: Pick<MachineRef, "id" | "name" | "providerKind" | "agentKind">;
}): Promise<PlacementMirrorResult> {
	const userId = args.userId.trim();
	if (!userId) {
		// Fail closed: an unscoped write would land in no tenant's namespace or,
		// worse, a shared one. Same guard as createHostedMux's.
		return { recorded: false, reason: "no tenant id: refusing an unscoped placement write" };
	}
	const resolved = resolvePlacementName(args.config, args.machine);
	if (!resolved.ok) return { recorded: false, reason: resolved.reason };
	try {
		await createSupabasePlacementStore(userId).remember(resolved.name, {
			substrate: toSubstrateKind(args.machine.providerKind),
			sandboxId: args.machine.id,
			agent: args.machine.agentKind,
		});
		return { recorded: true, name: resolved.name };
	} catch (err) {
		return {
			recorded: false,
			reason: err instanceof Error ? err.message : "placement write failed",
		};
	}
}

/**
 * Prune this machine's placement, if the placement still names ITS sandbox.
 *
 * The guard is the point: see the header. Never throws, for the same reason
 * `recordHostedPlacement` does not.
 */
export async function forgetHostedPlacement(args: {
	userId: string;
	machine: Pick<MachineRef, "id" | "name">;
}): Promise<PlacementForgetResult> {
	const userId = args.userId.trim();
	if (!userId) {
		return { forgotten: false, reason: "no tenant id: refusing an unscoped placement read" };
	}
	const name = args.machine.name.trim();
	if (!name) return { forgotten: false, reason: "machine has no name; nothing could be remembered" };
	try {
		const store = createSupabasePlacementStore(userId);
		const remembered = (await store.read()).machines[name];
		if (!remembered) return { forgotten: false, reason: `nothing remembered under "${name}"` };
		if (remembered.sandboxId !== args.machine.id) {
			// The name has moved on (a migration re-pointed it). Forgetting here
			// would strand a live sandbox: unreachable by name, still billing.
			return {
				forgotten: false,
				reason: `"${name}" now points at ${remembered.sandboxId}, not ${args.machine.id}; left intact`,
			};
		}
		await store.forget(name);
		return { forgotten: true, name };
	} catch (err) {
		return {
			forgotten: false,
			reason: err instanceof Error ? err.message : "placement forget failed",
		};
	}
}

/**
 * What the ROUTER remembers for this tenant, joined against the machines table.
 *
 * Goes through `createHostedMux(...).placements()` rather than reading the
 * store directly, on purpose: a reader that reaches around the router cannot
 * notice a mux that fell back to the process-global store -- which under
 * concurrency is another tenant's placements. Throws only what the store
 * throws (a `MuxError`-shaped failure); the caller turns that into a 502
 * instead of pretending the tenant has nothing remembered, because "empty" and
 * "unreadable" are different answers.
 */
export async function readHostedPlacements(args: {
	userId: string;
	config: UserConfig;
}): Promise<HostedPlacements> {
	const mux = createHostedMux(args.userId, args.config);
	const remembered = await mux.placements();
	const credentialCache = new Map<SubstrateKind, { ok: boolean; missing: string[] }>();
	const credentials = (substrate: SubstrateKind) => {
		let entry = credentialCache.get(substrate);
		if (!entry) {
			entry = credentialCheck(args.config, substrate);
			credentialCache.set(substrate, entry);
		}
		return entry;
	};

	const placements: PlacementRow[] = Object.entries(remembered)
		.map(([name, entry]) => {
			// Join by sandbox id: names are not unique hosted-side, ids are.
			const record = args.config.machines.find((m) => m.id === entry.sandboxId) ?? null;
			const creds = credentials(entry.substrate);
			return {
				name,
				substrate: entry.substrate,
				sandboxId: entry.sandboxId,
				agent: entry.agent,
				updatedAt: entry.updatedAt,
				machineId: record?.id ?? null,
				disagrees:
					record !== null &&
					(toSubstrateKind(record.providerKind) !== entry.substrate ||
						record.agentKind !== entry.agent),
				credentialed: creds.ok,
				missingCredentials: creds.missing,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const rememberedIds = new Set(placements.map((row) => row.sandboxId));
	const unremembered = args.config.machines
		.filter((m) => !m.archived && !rememberedIds.has(m.id))
		.map((m) => ({ machineId: m.id, name: m.name, providerKind: m.providerKind }));

	return { placements, unremembered };
}

export type DescribeHostedPlacement =
	| { ok: true; name: string; substrate: SubstrateKind; description: SandboxDescription }
	| {
			ok: false;
			error: "unknown_placement" | "missing_provider_credentials" | "not_supported" | "describe_failed";
			message: string;
			missing?: string[];
			substrate?: SubstrateKind;
	  };

/**
 * No-wake status of one remembered machine, through the ROUTER.
 *
 * `mux.describe(name)` is the mux's read that does NOT resume a parked sandbox
 * (connect() does, on e2b and vercel -- billing a machine for being looked at).
 *
 * The credential gate is EXPLICIT and comes first: mux providers never throw at
 * construction, they report missing keys from `ready()`, so without this check
 * an uncredentialed lane would reach the vendor and come back as an opaque auth
 * error. Naming the missing keys is the same fail-closed shape the migrate
 * route uses.
 */
export async function describeHostedPlacement(args: {
	userId: string;
	config: UserConfig;
	name: string;
}): Promise<DescribeHostedPlacement> {
	const mux = createHostedMux(args.userId, args.config);
	const remembered = (await mux.placements())[args.name];
	if (!remembered) {
		return {
			ok: false,
			error: "unknown_placement",
			message: `nothing remembered under "${args.name}"`,
		};
	}
	const creds = credentialCheck(args.config, remembered.substrate);
	if (!creds.ok) {
		return {
			ok: false,
			error: "missing_provider_credentials",
			substrate: remembered.substrate,
			missing: creds.missing,
			message: `"${args.name}" is remembered on ${remembered.substrate}, which has no credentials on file. Missing: ${
				creds.missing.join(", ") || "unknown"
			}`,
		};
	}
	try {
		return {
			ok: true,
			name: args.name,
			substrate: remembered.substrate,
			description: await mux.describe(args.name),
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : "describe failed";
		// not_supported is a capability fact (sprites/dedalus cannot read status
		// without resuming), not a fault: report it as its own outcome so the
		// dashboard can say "cannot be read without waking" instead of "error".
		const kind =
			typeof (err as { kind?: unknown } | null)?.kind === "string"
				? (err as { kind: string }).kind
				: null;
		return {
			ok: false,
			error: kind === "not_supported" ? "not_supported" : "describe_failed",
			substrate: remembered.substrate,
			message,
		};
	}
}

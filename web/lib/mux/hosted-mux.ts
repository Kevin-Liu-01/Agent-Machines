/**
 * Build a mux whose placements live in Supabase, scoped to ONE user.
 *
 * This is the missing install step for `web/lib/mux/placement-store.ts`: that
 * store was implemented, tested against a fake Postgres, and applied to the
 * database (migration 006, applied 2026-08-03) but nothing ever handed it to a
 * mux, so the hosted plane still had no durable placement memory.
 *
 * WHY NOT `setPlacementStore()`, which is the API the store's own header points
 * at: it is a MODULE SINGLETON. That is correct for the CLI -- one host, one
 * user, one home directory -- and a cross-tenant hazard here. A serverless
 * function serves concurrent requests for different users inside one process,
 * so "set the global to user A's store, then run A's operation" races user B
 * doing the same, and A's `connect(name)` reads B's placements. Same shape as
 * the two credential-scoping bugs already caught on this path: the connected
 * handle cache keyed only by machine id (mux-facade.ts) and the process-global
 * OIDC token bridge (providers/vercel.ts). So `createMux()` takes the store
 * PER INSTANCE (`CreateMuxOptions.placementStore`) and the global is never
 * touched from web/.
 *
 * The tenant id is the effective user id, the same value every other hosted
 * table is scoped by, and `SupabasePlacementStore` refuses an empty one rather
 * than silently reading every tenant.
 */

import { createMux, type Mux } from "agent-machines/mux";

import { createSupabasePlacementStore } from "@/lib/mux/placement-store";
import { DEFAULT_ROUTE_ORDER, resolveRoute } from "@/lib/mux/route";
import type { UserConfig } from "@/lib/user-config/schema";

import type { MuxConfigInput } from "../../../src/mux/config.js";

/**
 * The user's stored credentials in the shape `createMux()` takes.
 *
 * Deliberately NOT a new source of truth about which lanes are usable: the
 * credential RULES live in `lib/mux/route.ts` (including vercel's
 * OIDC-or-triple case), and `resolveRoute` is what decides the order and what
 * is skipped. This function only re-spells what the user stored; an
 * uncredentialed lane is dropped by the mux's own `ready()` gate the same way
 * `create()` drops it for the CLI.
 *
 * The primary is the first CREDENTIALED lane rather than a fixed default, so a
 * hosted mux never opens with a primary the user cannot authenticate against.
 */
export function muxConfigForUser(config: UserConfig): MuxConfigInput {
	const providers = config.providers;
	const { route } = resolveRoute(config);
	const order = route.length > 0 ? route : [...DEFAULT_ROUTE_ORDER];
	return {
		providers: {
			...(providers.e2b?.apiKey ? { e2b: { apiKey: providers.e2b.apiKey } } : {}),
			// The mux spells this one `token`; user config says `apiKey`.
			...(providers.sprites?.apiKey
				? { sprites: { token: providers.sprites.apiKey } }
				: {}),
			...(providers.vercel?.token
				? {
						vercel: {
							token: providers.vercel.token,
							teamId: providers.vercel.teamId,
							projectId: providers.vercel.projectId,
						},
					}
				: {}),
			...(providers.dedalus?.apiKey
				? {
						dedalus: {
							apiKey: providers.dedalus.apiKey,
							...(providers.dedalus.baseUrl
								? { baseUrl: providers.dedalus.baseUrl }
								: {}),
						},
					}
				: {}),
		},
		sandboxes: { primary: order[0], backups: order.slice(1) },
	};
}

/**
 * A mux for one user, with that user's substrate credentials and a placement
 * store scoped to their tenant.
 *
 * Callers get a fresh instance per request on purpose: it is cheap (providers
 * are constructed lazily, per credential set) and it is what keeps two
 * concurrent requests from sharing anything mutable.
 */
export function createHostedMux(userId: string, config: UserConfig): Mux {
	if (!userId.trim()) {
		// Fail closed rather than build an unscoped mux. The store would refuse
		// the empty tenant anyway, but failing here names the caller's mistake
		// instead of surfacing it later as a storage error mid-provision.
		throw new Error(
			"createHostedMux needs a non-empty userId: an unscoped mux would read every tenant's placements",
		);
	}
	return createMux(muxConfigForUser(config), {
		placementStore: createSupabasePlacementStore(userId),
		// Health stays on the default (the local file / whatever the mux
		// resolves): the hosted plane has no circuit-breaker table yet, and
		// silently persisting one user's breaker samples into a shared file
		// would be worse than not persisting them. Roadmap pillar 6 -- the
		// hosted plane has failover but no health -- is unchanged by this file.
		persistHealth: false,
	});
}

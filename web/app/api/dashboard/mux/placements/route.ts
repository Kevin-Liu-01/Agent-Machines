/**
 * GET /api/dashboard/mux/placements[?name=<placement>]
 *
 * What the MUX ROUTER remembers about this tenant's machines -- the first read
 * of the hosted placement store (lib/mux/placement-store.ts, migration 006)
 * through a real `createHostedMux()` instance rather than around it.
 *
 *   no params  -- every placement, joined against the machines table so drift
 *                 is reported both ways: a remembered sandbox with no record
 *                 (`machineId: null`), a record with no placement
 *                 (`unremembered`), and a placement whose substrate/agent
 *                 disagrees with its record (`disagrees`). Each row says
 *                 whether its lane is credentialed RIGHT NOW, because a
 *                 placement on a revoked lane is remembered but not
 *                 connectable.
 *   ?name=     -- that one placement's sandbox state via `mux.describe()`,
 *                 which reads WITHOUT resuming: connect() wakes on e2b and
 *                 vercel, so answering "what state is this in" through connect
 *                 bills a parked sandbox for being looked at.
 *
 * Read-only by construction: nothing here provisions, wakes, installs or
 * writes. `unremembered` being long is expected today, not a fault -- only the
 * agent-switch and migrate verbs mirror placements (lib/mux/placements.ts
 * header), so a machine that has only ever been provisioned is remembered by
 * the machines table alone.
 *
 * Scoping is the whole risk on this route, so it is explicit: `userId` comes
 * from `getEffectiveUserId()` and is passed into `createHostedMux(userId, ...)`
 * per request. The module-global `setPlacementStore()` is never touched -- one
 * serverless process serves concurrent requests for different users, and a
 * global store means tenant A reads tenant B's placements.
 */

import { describeHostedPlacement, readHostedPlacements } from "@/lib/mux/placements";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One Supabase read, or one read plus one no-wake provider status call. */
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
	try {
		// Inside the try so even an unexpected throw from identity resolution
		// answers with a status instead of an unhandled 502.
		const userId = await getEffectiveUserId();
		if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
		const config = await getUserConfig();
		const name = new URL(request.url).searchParams.get("name");

		if (name !== null) {
			if (!name.trim()) {
				return Response.json(
					{ error: "invalid_name", message: "name must not be blank" },
					{ status: 400 },
				);
			}
			const result = await describeHostedPlacement({ userId, config, name });
			if (result.ok) {
				return Response.json({
					ok: true,
					name: result.name,
					substrate: result.substrate,
					description: result.description,
				});
			}
			// Statuses mirror the migrate route's vocabulary: 404 for a name that
			// is not remembered, 409 + NAMED missing keys for an uncredentialed
			// lane (fail closed before the vendor call, which would otherwise come
			// back as an opaque auth error), 501 for a substrate that genuinely
			// cannot report status without resuming.
			const status =
				result.error === "unknown_placement"
					? 404
					: result.error === "missing_provider_credentials"
						? 409
						: result.error === "not_supported"
							? 501
							: 502;
			return Response.json(
				{
					error: result.error,
					message: result.message,
					...(result.missing ? { missing: result.missing } : {}),
					...(result.substrate ? { substrate: result.substrate } : {}),
				},
				{ status },
			);
		}

		const { placements, unremembered } = await readHostedPlacements({ userId, config });
		return Response.json({ ok: true, placements, unremembered });
	} catch (err) {
		// A store read that FAILED and a tenant with NOTHING remembered are
		// different answers, and reporting the first as the second is how a
		// caller ends up creating a second sandbox for a name that already has
		// one. So an unreadable store is a 502, never an empty list.
		return Response.json(
			{
				error: "placements_unavailable",
				message: err instanceof Error ? err.message : "could not read the placement store",
			},
			{ status: 502 },
		);
	}
}

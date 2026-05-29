/**
 * GET /api/dashboard/benchmarks
 *
 * Returns the substrate benchmark snapshot the dashboard renders: cited
 * reference/capability/pricing facts from the committed seed, merged with
 * any measured/demo runs stored in Supabase. Always returns a usable
 * payload — if Supabase is unconfigured or unreachable, the seed alone.
 */

import { getSnapshot } from "@/lib/benchmarks/store";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const snapshot = await getSnapshot();
	return Response.json(snapshot);
}

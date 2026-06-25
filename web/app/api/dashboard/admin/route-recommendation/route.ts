/**
 * GET /api/dashboard/admin/route-recommendation -- Loop A greedy recommendation.
 *
 * Returns the best feasible {runtime, substrate, model, router} arm under the
 * active routing policy, for the DeployAndTalk "recommended" banner. Advisory:
 * the human still confirms (exploit at interactive provision).
 */

import { recommendArm } from "@/lib/learning/recommend";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	try {
		const config = await getUserConfig();
		const rec = await recommendArm(config);
		if (!rec) {
			return Response.json({ ok: true, recommended: null });
		}
		return Response.json({
			ok: true,
			recommended: {
				runtime: rec.arm.runtime,
				substrate: rec.arm.substrate,
				model: rec.arm.model,
				routerId: rec.arm.routerId,
			},
			meanSuccess: rec.meanSuccess,
			samples: rec.n,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "recommendation_failed";
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

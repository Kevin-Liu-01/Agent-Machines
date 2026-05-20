/**
 * GET /api/dashboard/crons/[name]
 *
 * Returns execution trail, log lines, and file diffs for a single cron run.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { isDemoMode, loadDemoHandlers } from "@/lib/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const { name } = await ctx.params;
	const decoded = decodeURIComponent(name);

	if (isDemoMode()) {
		const { demoCronDetailResponse } = await loadDemoHandlers();
		return demoCronDetailResponse(decoded);
	}

	return Response.json({
		ok: true,
		message: "Live cron detail ships in a future release.",
		fetchedAt: new Date().toISOString(),
	});
}

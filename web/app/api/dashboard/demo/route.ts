/**
 * GET /api/dashboard/demo
 *
 * Serves the demo config snapshot — fleet defaults + machine id index.
 * Per-machine payloads are resolved by the other /api/dashboard/* demo branches.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { isDemoMode, loadDemoHandlers } from "@/lib/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	if (!isDemoMode()) {
		return Response.json({ error: "not_demo_mode" }, { status: 404 });
	}
	const machineId = new URL(request.url).searchParams.get("machineId") ?? undefined;
	const { demoConfigResponse } = await loadDemoHandlers();
	return demoConfigResponse(machineId);
}

/**
 * GET /api/dashboard/packages/suggest
 *
 * Returns contextual Add ___ chip suggestions for the agent composer.
 * Matches draft text against session attach packages, excluding abilities
 * already active in the Worker's Memory or attached to this chat session.
 */

import { buildPool } from "@/lib/dashboard/pool";
import { resolveMachine } from "@/lib/dashboard/exec";
import { matchPackages } from "@/lib/packages/match";
import { resolveBundle } from "@/lib/memory/bundle";
import { resolveMachineWorker } from "@/lib/workers/resolve";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const draft = url.searchParams.get("draft") ?? "";
	const machineId = url.searchParams.get("machineId");
	const sessionRaw = url.searchParams.get("session") ?? "";
	const sessionPackageIds = sessionRaw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	if (!machineId) {
		return Response.json({ ok: false, error: "machineId_required" }, { status: 422 });
	}

	const config = await getUserConfig();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		return Response.json({ ok: false, error: "machine_not_found" }, { status: 404 });
	}

	const worker = resolveMachineWorker(config, machine);
	const memory = resolveBundle(config, worker.memoryBundleId);
	if (!memory) {
		return Response.json({ ok: false, error: "memory_not_found" }, { status: 404 });
	}

	const pool = buildPool(config);
	const suggestions = matchPackages({
		draft,
		memory,
		sessionPackageIds,
		pool,
	}).slice(0, 3);

	return Response.json({ ok: true, suggestions });
}

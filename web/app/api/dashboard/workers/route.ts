/**
 * GET  /api/dashboard/workers  — list the user's worker templates.
 * POST /api/dashboard/workers  — create a worker.
 *
 * A Worker = agentKind + model/router + a referenced memory bundle (+ optional
 * role prompt). Deployed onto a machine via /workers/[id]/deploy.
 */

import { randomUUID } from "node:crypto";

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { listBundles } from "@/lib/memory/bundle";
import {
	AGENT_KINDS,
	DEFAULT_MEMORY_BUNDLE_ID,
	DEFAULT_MODEL,
	type AgentKind,
	type Worker,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAgent(v: unknown): v is AgentKind {
	return typeof v === "string" && (AGENT_KINDS as ReadonlyArray<string>).includes(v);
}

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const config = await getUserConfig();
	const bundleNames: Record<string, string> = {};
	for (const b of listBundles(config)) bundleNames[b.id] = b.name;
	return Response.json({ ok: true, workers: config.workers ?? [], bundleNames });
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) return Response.json({ error: "name_required" }, { status: 400 });
	if (!isAgent(body.agentKind)) {
		return Response.json({ error: "invalid_agent_kind" }, { status: 400 });
	}

	const now = new Date().toISOString();
	const worker: Worker = {
		id: randomUUID(),
		name,
		agentKind: body.agentKind,
		model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL,
		gatewayProfileId:
			typeof body.gatewayProfileId === "string" ? body.gatewayProfileId : "dedalus-default",
		memoryBundleId:
			typeof body.memoryBundleId === "string" ? body.memoryBundleId : DEFAULT_MEMORY_BUNDLE_ID,
		rolePrompt: typeof body.rolePrompt === "string" ? body.rolePrompt : null,
		lastMachineId: null,
		createdAt: now,
		updatedAt: now,
	};

	const config = await getUserConfig();
	await setUserConfig({ workers: [...(config.workers ?? []), worker] });
	return Response.json({ ok: true, worker });
}

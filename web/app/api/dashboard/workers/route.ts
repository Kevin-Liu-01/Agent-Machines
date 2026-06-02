/**
 * GET  /api/dashboard/workers  — list the user's worker templates.
 * POST /api/dashboard/workers  — create a worker.
 *
 * A Worker = agentKind + model/router + a referenced memory bundle (+ optional
 * role prompt). Deployed onto a machine via /workers/[id]/deploy.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { findPreset } from "@/lib/dashboard/presets";
import { listBundles } from "@/lib/memory/bundle";
import { applyPreset } from "@/lib/onboarding/apply-preset";
import { newWorker } from "@/lib/workers/resolve";
import {
	AGENT_KINDS,
	DEFAULT_MEMORY_BUNDLE_ID,
	DEFAULT_MODEL,
	type AgentKind,
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

	const config = await getUserConfig();

	// Start from a curated preset: import its abilities into the pool, create a
	// Memory shaped by it, and a Worker on that Memory (reuses the onboarding
	// helper, machineId null since this worker isn't deployed yet).
	if (typeof body.presetId === "string" && body.presetId) {
		const preset = findPreset(body.presetId);
		if (!preset) return Response.json({ error: "unknown_preset" }, { status: 400 });
		const application = applyPreset({
			config,
			preset,
			agentKind: body.agentKind,
			model:
				typeof body.model === "string" && body.model.trim() ? body.model.trim() : config.draftModel,
			gatewayProfileId:
				typeof body.gatewayProfileId === "string" ? body.gatewayProfileId : "dedalus-default",
			machineId: null,
		});
		const workers = application.workers.map((w) =>
			w.id === application.workerId ? { ...w, name } : w,
		);
		await setUserConfig({ workers });
		const worker = workers.find((w) => w.id === application.workerId);
		return Response.json({ ok: true, worker });
	}

	const worker = newWorker({
		name,
		agentKind: body.agentKind,
		model:
			typeof body.model === "string" && body.model.trim()
				? body.model.trim()
				: DEFAULT_MODEL,
		gatewayProfileId:
			typeof body.gatewayProfileId === "string" ? body.gatewayProfileId : "dedalus-default",
		memoryBundleId:
			typeof body.memoryBundleId === "string" ? body.memoryBundleId : DEFAULT_MEMORY_BUNDLE_ID,
		rolePrompt: typeof body.rolePrompt === "string" ? body.rolePrompt : null,
		source: "custom",
	});

	await setUserConfig({ workers: [...(config.workers ?? []), worker] });
	return Response.json({ ok: true, worker });
}

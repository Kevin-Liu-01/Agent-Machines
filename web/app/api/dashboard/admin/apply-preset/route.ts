/**
 * POST /api/dashboard/admin/apply-preset
 *
 * Save a Worker bound to a preset's Memory before submitting its launch.
 * A stable workerId makes retries safe if the client loses the response.
 * `presetId: null` starts with Barebones memory.
 */

import { findPreset } from "@/lib/dashboard/presets";
import { DEFAULT_ROUTER_ID } from "@/lib/agents/upstreams";
import { applyPreset } from "@/lib/onboarding/apply-preset";
import { modelEndpointForSelection } from "@/lib/bootstrap/runner";
import { initialWorkerModel } from "@/lib/agents/model-endpoint";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import {
	AGENT_KINDS,
	toPublicConfig,
	type AgentKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
	workerId?: string;
	presetId?: string | null;
	agentKind?: AgentKind;
	model?: string;
	gatewayProfileId?: string;
	machineId?: string | null;
};

function isAgent(v: unknown): v is AgentKind {
	return typeof v === "string" && (AGENT_KINDS as ReadonlyArray<string>).includes(v);
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return Response.json({ error: "invalid_body" }, { status: 400 });
	}
	if (body.workerId !== undefined && (
		typeof body.workerId !== "string" ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.workerId)
	)) {
		return Response.json({ error: "invalid_worker_id" }, { status: 400 });
	}

	const config = await getUserConfig();
	const agentKind = isAgent(body.agentKind) ? body.agentKind : config.draftAgentKind;
	const preset = body.presetId ? findPreset(body.presetId) : null;
	if (body.presetId && !preset) {
		return Response.json({ error: "unknown_preset" }, { status: 400 });
	}

	const gatewayProfileId = typeof body.gatewayProfileId === "string" && body.gatewayProfileId.trim() ? body.gatewayProfileId.trim() : DEFAULT_ROUTER_ID;
	let model: string;
	try {
		model = initialWorkerModel(agentKind, modelEndpointForSelection({ agentKind, gatewayProfileId }, config), typeof body.model === "string" ? body.model : null, config.draftModel);
	} catch (error) {
		return Response.json({ error: "model_required", message: error instanceof Error ? error.message : "Choose a model for the selected endpoint." }, { status: 400 });
	}
	const application = applyPreset({
		workerId: body.workerId,
		config,
		preset,
		agentKind,
		model,
		gatewayProfileId,
		machineId: typeof body.machineId === "string" ? body.machineId : null,
	});

	const next = await setUserConfig({ workers: application.workers });

	return Response.json({
		ok: true,
		workerId: application.workerId,
		memoryBundleId: application.memoryBundleId,
		config: toPublicConfig(next),
	});
}

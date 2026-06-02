/**
 * POST /api/dashboard/admin/apply-preset
 *
 * Seed a user's loadout from an onboarding preset choice: import the preset's
 * abilities into the account-global pool (customLoadout), create a Memory
 * shaped by the preset, and create a Worker bound to that Memory and the
 * just-provisioned machine. `presetId: null` means "no preset" (blank start on
 * the default Memory). Call AFTER provision (so the Worker links to the
 * machine) and BEFORE bootstrap (which reads the Worker -> Memory).
 */

import { findPreset } from "@/lib/dashboard/presets";
import { applyPreset } from "@/lib/onboarding/apply-preset";
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

	const config = await getUserConfig();
	const agentKind = isAgent(body.agentKind) ? body.agentKind : config.draftAgentKind;
	const preset = body.presetId ? findPreset(body.presetId) : null;
	if (body.presetId && !preset) {
		return Response.json({ error: "unknown_preset" }, { status: 400 });
	}

	const application = applyPreset({
		config,
		preset,
		agentKind,
		model:
			typeof body.model === "string" && body.model.trim() ? body.model.trim() : config.draftModel,
		gatewayProfileId:
			typeof body.gatewayProfileId === "string" && body.gatewayProfileId.trim()
				? body.gatewayProfileId.trim()
				: "dedalus-default",
		machineId: typeof body.machineId === "string" ? body.machineId : null,
	});

	const next = await setUserConfig({
		customLoadout: application.customLoadout,
		memoryBundles: application.memoryBundles,
		workers: application.workers,
	});

	return Response.json({
		ok: true,
		workerId: application.workerId,
		memoryBundleId: application.memoryBundleId,
		config: toPublicConfig(next),
	});
}

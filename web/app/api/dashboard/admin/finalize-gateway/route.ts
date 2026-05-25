/**
 * POST /api/dashboard/admin/finalize-gateway
 *
 * Fast path when Hermes is installed but bootstrap state is stale:
 * restart gateway, probe /v1/models, persist apiUrl + succeeded state.
 */

import { getProvider } from "@/lib/providers";
import { finalizeGatewayBootstrap } from "@/lib/bootstrap/runner";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = { machineId?: string };

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as Body;
	const config = await getUserConfig();
	const machineId = body.machineId ?? config.activeMachineId;
	const machine = machineId
		? config.machines.find((m) => m.id === machineId) ?? null
		: null;
	if (!machine) {
		return Response.json({ error: "not_found", message: "Machine not found." }, { status: 404 });
	}

	const provider = getProvider(machine.providerKind, config.providers);
	try {
		const result = await finalizeGatewayBootstrap({
			machine,
			provider,
			config,
			onState: async (bootstrapState) => {
				await setUserConfig({
					patchMachine: { id: machine.id, patch: { bootstrapState } },
				});
			},
		});
		await setUserConfig({
			patchMachine: {
				id: machine.id,
				patch: { apiUrl: result.apiUrl, apiKey: result.apiKey },
			},
		});
		return Response.json({ ok: true, machineId: machine.id, apiUrl: result.apiUrl });
	} catch (err) {
		const message = err instanceof Error ? err.message : "finalize failed";
		return Response.json({ ok: false, error: "finalize_failed", message }, { status: 502 });
	}
}

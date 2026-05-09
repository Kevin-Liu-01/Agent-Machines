/**
 * GET / PATCH / DELETE /api/dashboard/machines/[id]
 *
 *   GET    -- single machine + live state
 *   PATCH  -- mutate stored fields (name, agentKind, model, apiUrl, apiKey)
 *             or set this machine as active via { active: true }
 *   DELETE -- archive (default) or hard-destroy via ?destroy=1
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { MachineProviderError, getProvider } from "@/lib/providers";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import {
	AGENT_KINDS,
	type AgentKind,
	type MachineRef,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type PatchBody = {
	name?: string;
	agentKind?: AgentKind;
	model?: string;
	apiUrl?: string | null;
	apiKey?: string | null;
	active?: boolean;
};

function isAgent(value: unknown): value is AgentKind {
	return typeof value === "string" && (AGENT_KINDS as ReadonlyArray<string>).includes(value);
}

async function find(id: string): Promise<MachineRef | null> {
	const config = await getUserConfig();
	return config.machines.find((m) => m.id === id) ?? null;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const machine = await find(id);
	if (!machine) return Response.json({ error: "not_found" }, { status: 404 });
	const config = await getUserConfig();
	let live: unknown = null;
	try {
		const provider = getProvider(machine.providerKind, config.providers);
		live = await provider.state(machine.id);
	} catch (err) {
		const reason =
			err instanceof MachineProviderError ? err.message : err instanceof Error ? err.message : "probe failed";
		live = { error: reason };
	}
	const { apiKey, ...rest } = machine;
	return Response.json({
		ok: true,
		machine: { ...rest, hasApiKey: Boolean(apiKey) },
		live,
	});
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const machine = await find(id);
	if (!machine) return Response.json({ error: "not_found" }, { status: 404 });

	let body: PatchBody;
	try {
		body = (await request.json()) as PatchBody;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	if (body.active === true) {
		const next = await setUserConfig({ activeMachineId: id });
		return Response.json({ ok: true, activeMachineId: next.activeMachineId });
	}

	const patch: Partial<MachineRef> = {};
	if (typeof body.name === "string" && body.name.trim().length > 0) {
		patch.name = body.name.trim().slice(0, 80);
	}
	if (body.agentKind !== undefined) {
		if (!isAgent(body.agentKind)) {
			return Response.json({ error: "invalid_agent_kind" }, { status: 400 });
		}
		patch.agentKind = body.agentKind;
	}
	if (typeof body.model === "string") {
		patch.model = body.model.trim();
	}
	if (body.apiUrl !== undefined) {
		patch.apiUrl =
			typeof body.apiUrl === "string" && body.apiUrl.trim().length > 0
				? body.apiUrl.trim().replace(/\/$/, "")
				: null;
	}
	if (body.apiKey !== undefined) {
		patch.apiKey =
			typeof body.apiKey === "string" && body.apiKey.trim().length > 0
				? body.apiKey.trim()
				: null;
	}

	if (Object.keys(patch).length === 0) {
		return Response.json({ error: "no_changes" }, { status: 422 });
	}

	const next = await setUserConfig({ patchMachine: { id, patch } });
	const updated = next.machines.find((m) => m.id === id);
	if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
	const { apiKey, ...rest } = updated;
	return Response.json({
		ok: true,
		machine: { ...rest, hasApiKey: Boolean(apiKey) },
	});
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const machine = await find(id);
	if (!machine) return Response.json({ error: "not_found" }, { status: 404 });
	const url = new URL(request.url);
	const hardDestroy = url.searchParams.get("destroy") === "1";
	const config = await getUserConfig();
	if (hardDestroy) {
		try {
			const provider = getProvider(machine.providerKind, config.providers);
			await provider.destroy(machine.id);
		} catch (err) {
			const message = err instanceof Error ? err.message : "destroy failed";
			return Response.json(
				{ error: "destroy_failed", message },
				{ status: 502 },
			);
		}
		await setUserConfig({ removeMachine: id });
	} else {
		await setUserConfig({ archiveMachine: id });
	}
	return Response.json({ ok: true, hardDestroy });
}

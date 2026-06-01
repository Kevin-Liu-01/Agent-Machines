/**
 * GET    /api/dashboard/workers/[id]  — fetch one worker.
 * PATCH  /api/dashboard/workers/[id]  — update fields.
 * DELETE /api/dashboard/workers/[id]  — remove a worker.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { AGENT_KINDS, type AgentKind, type Worker } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isAgent(v: unknown): v is AgentKind {
	return typeof v === "string" && (AGENT_KINDS as ReadonlyArray<string>).includes(v);
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const config = await getUserConfig();
	const worker = (config.workers ?? []).find((w) => w.id === id);
	if (!worker) return Response.json({ error: "not_found" }, { status: 404 });
	return Response.json({ ok: true, worker });
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	const config = await getUserConfig();
	const existing = (config.workers ?? []).find((w) => w.id === id);
	if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

	const updated: Worker = {
		...existing,
		name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
		agentKind: isAgent(body.agentKind) ? body.agentKind : existing.agentKind,
		model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : existing.model,
		gatewayProfileId:
			typeof body.gatewayProfileId === "string" ? body.gatewayProfileId : existing.gatewayProfileId,
		memoryBundleId:
			typeof body.memoryBundleId === "string" ? body.memoryBundleId : existing.memoryBundleId,
		rolePrompt:
			typeof body.rolePrompt === "string"
				? body.rolePrompt
				: body.rolePrompt === null
					? null
					: existing.rolePrompt,
		updatedAt: new Date().toISOString(),
	};
	const next = (config.workers ?? []).map((w) => (w.id === id ? updated : w));
	await setUserConfig({ workers: next });
	return Response.json({ ok: true, worker: updated });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const config = await getUserConfig();
	const next = (config.workers ?? []).filter((w) => w.id !== id);
	await setUserConfig({ workers: next });
	return Response.json({ ok: true });
}

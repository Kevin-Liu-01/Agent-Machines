/**
 * GET    /api/dashboard/memory/[id]  — full bundle + resolved abilities.
 * PATCH  /api/dashboard/memory/[id]  — update (upserts a persisted override
 *                                      for the synthesized default).
 * DELETE /api/dashboard/memory/[id]  — remove a bundle.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { BUILTIN_TOOLS } from "@/lib/dashboard/loadout";
import { buildPool } from "@/lib/dashboard/pool";
import { resolveAbilities } from "@/lib/memory/abilities";
import { defaultMemoryBundle, resolveBundle } from "@/lib/memory/bundle";
import {
	DEFAULT_MEMORY_BUNDLE_ID,
	type MemoryBundle,
	type MemoryBundleDocs,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const config = await getUserConfig();
	const bundle = resolveBundle(config, id);
	if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });
	const pool = buildPool(config);
	// The full set of abilities the Memory can select from: imported skills/MCPs
	// (the pool) + runtime-intrinsic built-in tools. The editor renders these as
	// a checklist; the resolved `abilities` is the current selection.
	const available = {
		skills: pool.skills.map((s) => ({ id: s.slug, name: s.name, description: s.description })),
		tools: BUILTIN_TOOLS.map((t) => ({ id: t.name, name: t.title, description: t.description })),
		mcps: pool.mcps.map((m) => ({
			id: m.name,
			name: m.name,
			description: `${m.tools.length} tool${m.tools.length === 1 ? "" : "s"}`,
		})),
	};
	return Response.json({
		ok: true,
		bundle,
		abilities: resolveAbilities(bundle, pool),
		available,
	});
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
	const stored = config.memoryBundles ?? [];
	const existing =
		stored.find((b) => b.id === id) ??
		(id === DEFAULT_MEMORY_BUNDLE_ID ? defaultMemoryBundle() : null);
	if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

	const docs = (body.docs ?? {}) as Partial<MemoryBundleDocs>;
	const updated: MemoryBundle = {
		...existing,
		name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
		description:
			typeof body.description === "string" ? body.description : existing.description,
		docs: {
			soul: typeof docs.soul === "string" ? docs.soul : existing.docs.soul,
			agentDocs: typeof docs.agentDocs === "string" ? docs.agentDocs : existing.docs.agentDocs,
			memory: typeof docs.memory === "string" ? docs.memory : existing.docs.memory,
			user: typeof docs.user === "string" ? docs.user : existing.docs.user,
		},
		skillIds: Array.isArray(body.skillIds) ? (body.skillIds as string[]) : existing.skillIds,
		toolIds: Array.isArray(body.toolIds) ? (body.toolIds as string[]) : existing.toolIds,
		mcpServerIds: Array.isArray(body.mcpServerIds)
			? (body.mcpServerIds as string[])
			: existing.mcpServerIds,
		updatedAt: new Date().toISOString(),
	};

	// Upsert: editing the synthesized default persists an override under its id.
	const next = stored.some((b) => b.id === id)
		? stored.map((b) => (b.id === id ? updated : b))
		: [...stored, updated];
	await setUserConfig({ memoryBundles: next });
	return Response.json({ ok: true, bundle: updated });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const config = await getUserConfig();
	const next = (config.memoryBundles ?? []).filter((b) => b.id !== id);
	await setUserConfig({ memoryBundles: next });
	return Response.json({ ok: true });
}

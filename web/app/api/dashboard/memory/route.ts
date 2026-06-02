/**
 * GET  /api/dashboard/memory  — list the user's memory bundles (summaries,
 *                               always including the seeded default).
 * POST /api/dashboard/memory  — create a bundle.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { buildPool } from "@/lib/dashboard/pool";
import { abilityCounts } from "@/lib/memory/abilities";
import { listBundles, newBundle } from "@/lib/memory/bundle";
import type { MemoryBundleDocs } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const config = await getUserConfig();
	const pool = buildPool(config);
	const bundles = listBundles(config).map((b) => ({
		id: b.id,
		name: b.name,
		description: b.description,
		source: b.source,
		counts: abilityCounts(b, pool),
		createdAt: b.createdAt,
		updatedAt: b.updatedAt,
	}));
	return Response.json({ ok: true, bundles });
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

	const docs = (body.docs ?? {}) as Partial<MemoryBundleDocs>;
	const bundle = newBundle({
		name,
		description: typeof body.description === "string" ? body.description : "",
		docs,
		skillIds: Array.isArray(body.skillIds) ? (body.skillIds as string[]) : undefined,
		toolIds: Array.isArray(body.toolIds) ? (body.toolIds as string[]) : undefined,
		mcpServerIds: Array.isArray(body.mcpServerIds)
			? (body.mcpServerIds as string[])
			: undefined,
	});

	const config = await getUserConfig();
	await setUserConfig({ memoryBundles: [...(config.memoryBundles ?? []), bundle] });
	return Response.json({ ok: true, bundle });
}

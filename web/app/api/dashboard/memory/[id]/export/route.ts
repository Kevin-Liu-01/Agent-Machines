/**
 * POST /api/dashboard/memory/[id]/export — assemble the bundle into one
 * pastable prompt (markdown).
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig } from "@/lib/user-config/clerk";
import { resolveBundle } from "@/lib/memory/bundle";
import { bundleToPrompt } from "@/lib/memory/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const config = await getUserConfig();
	const bundle = resolveBundle(config, id);
	if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });

	const prompt = bundleToPrompt(bundle);
	const slug = bundle.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	return Response.json({
		ok: true,
		prompt,
		filename: `${slug || "memory"}.md`,
	});
}

/**
 * POST /api/dashboard/memory/import — create a bundle from a pasted existing
 * setup (CLAUDE.md / AGENTS.md / .cursor rules / any system prompt).
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { bundleFromPaste } from "@/lib/memory/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	const text = typeof body.text === "string" ? body.text : "";
	if (!text.trim()) return Response.json({ error: "text_required" }, { status: 400 });

	const bundle = bundleFromPaste(text, typeof body.name === "string" ? body.name : undefined);
	const config = await getUserConfig();
	await setUserConfig({ memoryBundles: [...(config.memoryBundles ?? []), bundle] });
	return Response.json({ ok: true, bundle });
}

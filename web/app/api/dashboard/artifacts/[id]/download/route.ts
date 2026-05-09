/**
 * GET /api/dashboard/artifacts/[id]/download
 *
 * Streams an artifact's bytes back to the browser. The bytes live on
 * the user's active Dedalus machine; we fetch them via the execution
 * API as base64, decode, and ship the raw buffer with the right
 * Content-Type + Content-Disposition headers.
 *
 * Authenticated only -- there's no public CDN URL like the previous
 * Vercel Blob layer gave us. To share an artifact externally, the
 * user would need to publish it via their own gateway (out of scope
 * for now).
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { loadArtifactBytes } from "@/lib/storage/machine-artifacts";
import { withActiveMachine } from "@/lib/storage/machine-fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const handle = await withActiveMachine();
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}
	const { id } = await ctx.params;
	try {
		const result = await loadArtifactBytes(id);
		if (!result) {
			return Response.json({ error: "not_found" }, { status: 404 });
		}
		const bytes = new Uint8Array(
			result.bytes.buffer,
			result.bytes.byteOffset,
			result.bytes.byteLength,
		);
		return new Response(bytes as BodyInit, {
			status: 200,
			headers: {
				"Content-Type": result.ref.mime || "application/octet-stream",
				"Content-Length": String(result.ref.bytes),
				"Content-Disposition": `inline; filename="${result.ref.name.replace(/"/g, "")}"`,
				"Cache-Control": "private, no-store",
			},
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "download_failed";
		return Response.json(
			{ error: "download_failed", message },
			{ status: 502 },
		);
	}
}

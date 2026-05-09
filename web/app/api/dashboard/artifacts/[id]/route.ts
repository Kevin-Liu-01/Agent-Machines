/**
 * DELETE /api/dashboard/artifacts/[id]
 *
 * Removes the artifact directory + index entry on the user's active
 * machine. Sleeping machines auto-wake.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { deleteArtifact } from "@/lib/storage/machine-artifacts";
import { withActiveMachine } from "@/lib/storage/machine-fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const handle = await withActiveMachine();
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}
	const { id } = await ctx.params;
	try {
		await deleteArtifact(id);
		return Response.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "delete_failed";
		return Response.json(
			{ error: "delete_failed", message },
			{ status: 502 },
		);
	}
}

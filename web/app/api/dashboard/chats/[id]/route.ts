/**
 * GET / DELETE /api/dashboard/chats/[id]
 *
 * Single-chat read + delete on the user's active machine. The data
 * lives at `~/.agent-machines/chats/<id>.json` on the VM.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { deleteChat, loadChat } from "@/lib/storage/machine-chats";
import { withActiveMachine } from "@/lib/storage/machine-fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const handle = await withActiveMachine();
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}
	const { id } = await ctx.params;
	try {
		const chat = await loadChat(id);
		if (!chat) return Response.json({ error: "not_found" }, { status: 404 });
		return Response.json({ ok: true, chat });
	} catch (err) {
		const message = err instanceof Error ? err.message : "load_failed";
		return Response.json(
			{ error: "load_failed", message },
			{ status: 502 },
		);
	}
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const handle = await withActiveMachine();
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}
	const { id } = await ctx.params;
	try {
		await deleteChat(id);
		return Response.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "delete_failed";
		return Response.json(
			{ error: "delete_failed", message },
			{ status: 502 },
		);
	}
}

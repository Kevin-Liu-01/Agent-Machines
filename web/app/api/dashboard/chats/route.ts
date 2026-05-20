/**
 * GET / POST /api/dashboard/chats
 *
 * Reads + writes chat history on the user's active Dedalus machine
 * (under `~/.agent-machines/chats/`). The machine is the storage layer
 * because the persistent volume already survives sleep/wake and the
 * agent itself can `cat` the same files for context.
 *
 * Wake-on-read: if the machine is sleeping, GET fires a wake and
 * returns `{ ok: false, reason: "machine_starting" }` so the client
 * can poll. POSTs that arrive while a machine is asleep similarly
 * return a transitional state -- the client retries after the machine
 * is ready.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import {
	deleteChat,
	listChats,
	loadChat,
	saveChat,
	type ChatRecord,
} from "@/lib/storage/machine-chats";
import { withActiveMachine } from "@/lib/storage/machine-fs";
import { isDemoMode, loadDemoHandlers } from "@/lib/demo/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	if (isDemoMode()) {
		const { demoChatsResponse } = await loadDemoHandlers();
		const machineId = new URL(request.url).searchParams.get("machineId") ?? undefined;
		return demoChatsResponse(machineId);
	}
	const machineId = new URL(request.url).searchParams.get("machineId") ?? undefined;
	const handle = await withActiveMachine(machineId);
	if ("ok" in handle) {
		return Response.json({ ...handle, chats: [] });
	}
	try {
		const chats = await listChats();
		return Response.json({
			ok: true,
			chats,
			machineId: handle.machine.id,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "list_failed";
		return Response.json(
			{ ok: false, reason: "exec_failed", message, chats: [] },
			{ status: 502 },
		);
	}
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	let body: ChatRecord;
	try {
		body = (await request.json()) as ChatRecord;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	if (isDemoMode()) {
		if (!body.id || typeof body.id !== "string") {
			return Response.json({ error: "id_required" }, { status: 422 });
		}
		if (!Array.isArray(body.messages)) {
			return Response.json({ error: "messages_required" }, { status: 422 });
		}
		const { demoChatSaveResponse } = await loadDemoHandlers();
		const now = new Date().toISOString();
		return demoChatSaveResponse({
			...body,
			updatedAt: now,
			createdAt: body.createdAt || now,
			messageCount: body.messages.length,
			title: (body.title || derivedTitle(body.messages)).slice(0, 120),
		});
	}
	const machineId = (body as Record<string, unknown>).machineId as string | undefined;
	const handle = await withActiveMachine(machineId);
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}
	if (!body.id || typeof body.id !== "string") {
		return Response.json({ error: "id_required" }, { status: 422 });
	}
	if (!Array.isArray(body.messages)) {
		return Response.json({ error: "messages_required" }, { status: 422 });
	}
	const now = new Date().toISOString();
	const record: ChatRecord = {
		...body,
		updatedAt: now,
		createdAt: body.createdAt || now,
		messageCount: body.messages.length,
		machineId: handle.machine.id,
		title: (body.title || derivedTitle(body.messages)).slice(0, 120),
	};
	try {
		await saveChat(record);
		return Response.json({ ok: true, chat: record });
	} catch (err) {
		const message = err instanceof Error ? err.message : "save_failed";
		return Response.json(
			{ error: "save_failed", message },
			{ status: 502 },
		);
	}
}

export async function DELETE(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const url = new URL(request.url);
	const id = url.searchParams.get("id");
	if (isDemoMode()) {
		if (!id) return Response.json({ error: "id_required" }, { status: 422 });
		const { demoChatDeleteResponse } = await loadDemoHandlers();
		return demoChatDeleteResponse(id);
	}
	const machineId = url.searchParams.get("machineId") ?? undefined;
	if (!id) return Response.json({ error: "id_required" }, { status: 422 });
	const handle = await withActiveMachine(machineId);
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}
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

function derivedTitle(messages: ChatRecord["messages"]): string {
	const firstUser = messages.find((m) => m.role === "user");
	if (!firstUser) return "untitled chat";
	const text = firstUser.content.trim().replace(/\s+/g, " ");
	return text.length > 0 ? text : "untitled chat";
}

// `loadChat` is referenced by the [id] route only; re-exporting from
// here would force the route into the same chunk for no reason.
void loadChat;

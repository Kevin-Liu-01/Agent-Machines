/**
 * GET / POST /api/dashboard/chats
 *
 * Reads + writes chat history on the user's selected, owned machine
 * (under `~/.agent-machines/chats/`). The machine is the storage layer
 * because the persistent volume already survives sleep/wake and the
 * agent itself can `cat` the same files for context.
 *
 * Reads never wake compute. A sleeping machine returns an explicit
 * `machine_asleep` state; the operator must choose Wake before reading
 * or updating its on-machine history.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import {
	deleteChat,
	listChats,
	saveChat,
	type ChatRecord,
} from "@/lib/storage/machine-chats";
import { withActiveMachine } from "@/lib/storage/machine-fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const machineId = new URL(request.url).searchParams.get("machineId") ?? undefined;
	const handle = await withActiveMachine(machineId);
	if ("ok" in handle) {
		return Response.json({ ...handle, chats: [] });
	}
	try {
		const chats = await listChats(handle.storage);
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
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	if (!isObject(parsed)) {
		return Response.json({ error: "invalid_chat_body" }, { status: 400 });
	}
	if (typeof parsed.id !== "string" || !parsed.id.trim()) {
		return Response.json({ error: "id_required" }, { status: 422 });
	}
	if (!Array.isArray(parsed.messages)) {
		return Response.json({ error: "messages_required" }, { status: 422 });
	}
	if (!parsed.messages.every(isMessage)) {
		return Response.json({ error: "invalid_messages" }, { status: 400 });
	}
	for (const field of ["title", "machineId", "model", "createdAt"] as const) {
		if (parsed[field] != null && typeof parsed[field] !== "string") {
			return Response.json({ error: `invalid_${field}` }, { status: 400 });
		}
	}
	if (parsed.sessionPackageIds !== undefined && (
		!Array.isArray(parsed.sessionPackageIds)
		|| !parsed.sessionPackageIds.every((id) => typeof id === "string")
	)) {
		return Response.json({ error: "invalid_sessionPackageIds" }, { status: 400 });
	}
	// Validate before resolving a machine or issuing any storage command. Keep
	// message evidence intact; server-owned summary fields are recomputed below.
	const body = parsed as ChatRecord;
	const handle = await withActiveMachine(body.machineId ?? undefined);
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
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
		await saveChat(record, handle.storage);
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
	const machineId = url.searchParams.get("machineId") ?? undefined;
	if (!id) return Response.json({ error: "id_required" }, { status: 422 });
	const handle = await withActiveMachine(machineId);
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}
	try {
		await deleteChat(id, handle.storage);
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

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMessage(value: unknown): value is ChatRecord["messages"][number] {
	return isObject(value)
		&& typeof value.id === "string"
		&& (value.role === "user" || value.role === "assistant" || value.role === "system")
		&& typeof value.content === "string"
		&& typeof value.createdAt === "number"
		&& Number.isFinite(value.createdAt);
}

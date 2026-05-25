/**
 * Chat persistence on the user's active machine.
 *
 * Layout on the VM:
 *   ~/.agent-machines/chats/_index.json    -- ChatSummary[] (newest first)
 *   ~/.agent-machines/chats/<chatId>.json  -- ChatRecord (full message bodies)
 */

import type { Message } from "@/lib/types";

import {
	deletePath,
	ensureAppDataLayout,
	listDir,
	readJsonFile,
	writeJsonFile,
	type MachineStorageContext,
} from "./machine-fs";

export type ChatSummary = {
	id: string;
	title: string;
	machineId: string | null;
	model: string | null;
	createdAt: string;
	updatedAt: string;
	messageCount: number;
};

export type ChatRecord = ChatSummary & {
	messages: Message[];
};

function chatsDir(ctx: MachineStorageContext): string {
	return `${ctx.appDataRoot}/chats`;
}

function chatsIndex(ctx: MachineStorageContext): string {
	return `${chatsDir(ctx)}/_index.json`;
}

function chatPath(chatId: string, ctx: MachineStorageContext): string {
	const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "");
	if (safe.length === 0) throw new Error("invalid chat id");
	return `${chatsDir(ctx)}/${safe}.json`;
}

function stripMessages(record: ChatRecord): ChatSummary {
	const { messages, ...summary } = record;
	void messages;
	return summary;
}

export async function listChats(ctx: MachineStorageContext): Promise<ChatSummary[]> {
	const indexPath = chatsIndex(ctx);
	const fromIndex = await readJsonFile<ChatSummary[]>(indexPath, ctx);
	if (fromIndex && Array.isArray(fromIndex)) {
		return [...fromIndex].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
	}
	const dir = chatsDir(ctx);
	const files = await listDir(dir, ctx);
	const summaries: ChatSummary[] = [];
	for (const file of files) {
		if (!file.name.endsWith(".json") || file.name === "_index.json") continue;
		const path = `${dir}/${file.name}`;
		const record = await readJsonFile<ChatRecord>(path, ctx);
		if (record) summaries.push(stripMessages(record));
	}
	const sorted = summaries.sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt),
	);
	if (sorted.length > 0) await writeJsonFile(indexPath, sorted, ctx);
	return sorted;
}

export async function loadChat(
	chatId: string,
	ctx: MachineStorageContext,
): Promise<ChatRecord | null> {
	return readJsonFile<ChatRecord>(chatPath(chatId, ctx), ctx);
}

export async function saveChat(
	record: ChatRecord,
	ctx: MachineStorageContext,
): Promise<void> {
	await ensureAppDataLayout(ctx);
	await writeJsonFile(chatPath(record.id, ctx), record, ctx);
	const existing = (await listChats(ctx)).filter((c) => c.id !== record.id);
	const next = [stripMessages(record), ...existing].sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt),
	);
	await writeJsonFile(chatsIndex(ctx), next, ctx);
}

export async function deleteChat(
	chatId: string,
	ctx: MachineStorageContext,
): Promise<void> {
	await deletePath(chatPath(chatId, ctx), ctx);
	const existing = (await listChats(ctx)).filter((c) => c.id !== chatId);
	await writeJsonFile(chatsIndex(ctx), existing, ctx);
}

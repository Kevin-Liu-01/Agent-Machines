/**
 * Chat persistence on the user's active Dedalus machine.
 *
 * Layout on the VM:
 *   ~/.agent-machines/chats/_index.json    -- ChatSummary[] (newest first)
 *   ~/.agent-machines/chats/<chatId>.json  -- ChatRecord (full message bodies)
 *
 * Why two files: listing the sidebar is one read of the index, not 30
 * reads of every chat file. Saving a chat re-writes both the body and
 * the index in a single round-trip so the sidebar stays consistent.
 *
 * The agent (Hermes / OpenClaw) lives on the same VM and can `cat
 * ~/.agent-machines/chats/_index.json` to enumerate its user's history,
 * or `cat ~/.agent-machines/chats/<chatId>.json` to load full context.
 */

import type { Message } from "@/lib/types";

import {
	APP_DATA_ROOT,
	deletePath,
	ensureAppDataLayout,
	listDir,
	readJsonFile,
	writeJsonFile,
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

const CHATS_DIR = `${APP_DATA_ROOT}/chats`;
const CHATS_INDEX = `${CHATS_DIR}/_index.json`;

function chatPath(chatId: string): string {
	const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "");
	if (safe.length === 0) throw new Error("invalid chat id");
	return `${CHATS_DIR}/${safe}.json`;
}

function stripMessages(record: ChatRecord): ChatSummary {
	const { messages, ...summary } = record;
	void messages;
	return summary;
}

export async function listChats(): Promise<ChatSummary[]> {
	const fromIndex = await readJsonFile<ChatSummary[]>(CHATS_INDEX);
	if (fromIndex && Array.isArray(fromIndex)) {
		return [...fromIndex].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
	}
	// Index missing or corrupt -- rebuild by walking the directory.
	const files = await listDir(CHATS_DIR);
	const summaries: ChatSummary[] = [];
	for (const file of files) {
		if (!file.name.endsWith(".json") || file.name === "_index.json") continue;
		const path = `${CHATS_DIR}/${file.name}`;
		const record = await readJsonFile<ChatRecord>(path);
		if (record) summaries.push(stripMessages(record));
	}
	const sorted = summaries.sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt),
	);
	if (sorted.length > 0) await writeJsonFile(CHATS_INDEX, sorted);
	return sorted;
}

export async function loadChat(chatId: string): Promise<ChatRecord | null> {
	return readJsonFile<ChatRecord>(chatPath(chatId));
}

export async function saveChat(record: ChatRecord): Promise<void> {
	await ensureAppDataLayout();
	await writeJsonFile(chatPath(record.id), record);
	const existing = (await listChats()).filter((c) => c.id !== record.id);
	const next = [stripMessages(record), ...existing].sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt),
	);
	await writeJsonFile(CHATS_INDEX, next);
}

export async function deleteChat(chatId: string): Promise<void> {
	await deletePath(chatPath(chatId));
	const existing = (await listChats()).filter((c) => c.id !== chatId);
	await writeJsonFile(CHATS_INDEX, existing);
}

/**
 * Demo chat session overlay — seed from demo-config.json, runtime saves in config.ts.
 */

import type { ChatRecord, ChatSummary } from "@/lib/storage/machine-chats";

import {
	deleteDemoChat as deleteChatRecord,
	listDemoChatSummaries as listSummaries,
	loadDemoChat as loadChatRecord,
	resetDemoConfigSession,
	saveDemoChat as saveChatRecord,
} from "./config";
import { resolveDemoMachineId } from "./machine-narratives";
import { allDemoMachines } from "./state";

export function listDemoChatSummaries(machineId?: string | null): ChatSummary[] {
	const id = resolveDemoMachineId(machineId);
	const machine = allDemoMachines().find((m) => m.id === id);
	return listSummaries(id, machine);
}

export function loadDemoChat(chatId: string): ChatRecord | null {
	for (const machine of allDemoMachines()) {
		const hit = listSummaries(machine.id, machine).some((c) => c.id === chatId);
		if (hit) return loadChatRecord(chatId, machine);
	}
	return loadChatRecord(chatId);
}

export function saveDemoChat(record: ChatRecord): ChatRecord {
	return saveChatRecord(record);
}

export function deleteDemoChat(chatId: string): void {
	deleteChatRecord(chatId);
}

export function resetDemoChatRecords(): void {
	resetDemoConfigSession();
}

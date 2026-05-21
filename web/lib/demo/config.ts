/**
 * Demo config loader — single JSON source of truth for all demo API responses.
 *
 * Edit `demo-config.json` to change demo stories. Re-run
 * `npx tsx scripts/export-demo-config.ts` only when bootstrapping from TS fixtures.
 */

import type { CronRunDetail } from "@/lib/dashboard/types";
import type {
	CursorRunsPayload,
	LogLine,
	LogsPayload,
	SessionsPayload,
} from "@/lib/dashboard/types";
import type { ChatRecord, ChatSummary } from "@/lib/storage/machine-chats";
import type { Message } from "@/lib/types";
import {
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MODEL,
	INITIAL_BOOTSTRAP_STATE,
	type AgentKind,
	type MachineRef,
	type ProviderKind,
} from "@/lib/user-config/schema";

import rawConfig from "./demo-config.json";
import { demoCreatedAtForMachine, demoDaysAgo } from "./dates";
import { provisionNarrativeFor } from "./provision-narrative";

export type DemoMachineUsage = {
	ok: true;
	machineId: string;
	resources: {
		cpu: { totalVcpuSeconds: number; buckets: Array<{ date: string; vcpuSeconds: number }> };
		memory: { totalGibSeconds: number; buckets: Array<{ date: string; gibSeconds: number }> };
		storage: { totalGibHours: number; buckets: Array<{ date: string; gibHours: number }> };
	};
	transitions: Array<{ label: string; timestamp: string }>;
};

/* ------------------------------------------------------------------ */
/* JSON schema types                                                   */
/* ------------------------------------------------------------------ */

type JsonChat = ChatSummary & { messages: Message[] };

type JsonMachineBundle = {
	headline: string;
	starterPrompts: Array<{ label: string; prompt: string }>;
	chats: JsonChat[];
	sessions: SessionsPayload;
	logs: LogsPayload;
	cursor: CursorRunsPayload;
	artifacts: Array<{
		id: string;
		name: string;
		mime: string;
		bytes: number;
		chatId: string | null;
		createdAt: string;
	}>;
	exec: { defaultStdout: string; commands?: Record<string, string> };
	usage: {
		scale: number;
		transitions: Array<{ label: string; timestamp: string }>;
		bucketDays?: number;
	};
	machineSummary: {
		phase: string;
		desired: string;
		vcpu: number;
		memoryMib: number;
		storageGib: number;
	};
};

type JsonFleetMachine = {
	id: string;
	name: string;
	providerKind: ProviderKind;
	agentKind: AgentKind;
	model: string;
	spec: MachineRef["spec"];
	createdAtDaysAgo?: number;
	live: { state: string; rawPhase: string };
};

type DemoConfigRoot = {
	version: number;
	fleet: {
		activeMachineId: string;
		gateway: Record<string, unknown>;
		metricsSummary: Record<string, unknown>;
		usage: Record<string, unknown>;
		cronRuns: Array<Record<string, unknown>>;
		cronDetails: Record<string, CronRunDetail>;
		machines: JsonFleetMachine[];
		providers: Record<string, { apiKey: string }>;
	};
	machines: Record<string, JsonMachineBundle>;
};

const CONFIG = rawConfig as DemoConfigRoot;

/* ------------------------------------------------------------------ */
/* Runtime session overlays (saved chats, deletes)                     */
/* ------------------------------------------------------------------ */

const savedChats = new Map<string, ChatRecord>();
const deletedChatIds = new Set<string>();

export function resetDemoConfigSession(): void {
	savedChats.clear();
	deletedChatIds.clear();
}

/* ------------------------------------------------------------------ */
/* Fleet accessors                                                     */
/* ------------------------------------------------------------------ */

export function getDemoGatewayConfig(): typeof CONFIG.fleet.gateway {
	return CONFIG.fleet.gateway;
}

export function getDemoMetricsSummaryConfig(): typeof CONFIG.fleet.metricsSummary {
	return {
		...CONFIG.fleet.metricsSummary,
		lastCollectedAt: new Date().toISOString(),
	};
}

export function getDemoUsageConfig(): typeof CONFIG.fleet.usage {
	return CONFIG.fleet.usage;
}

export function getDemoCronRunsConfig(): typeof CONFIG.fleet.cronRuns {
	return CONFIG.fleet.cronRuns;
}

export function getDemoCronDetailConfig(name: string): CronRunDetail | null {
	return CONFIG.fleet.cronDetails[name] ?? null;
}

export function listDemoCronDetailNames(): string[] {
	return Object.keys(CONFIG.fleet.cronDetails);
}

export function getDemoProvidersConfig(): typeof CONFIG.fleet.providers {
	return CONFIG.fleet.providers;
}

export function getDemoSeedActiveMachineId(): string {
	return CONFIG.fleet.activeMachineId;
}

/* ------------------------------------------------------------------ */
/* Machine refs from JSON fleet table                                  */
/* ------------------------------------------------------------------ */

const BOOTSTRAP_SUCCEEDED = {
	...INITIAL_BOOTSTRAP_STATE,
	phase: "succeeded" as const,
};

export function buildDemoMachineRef(entry: JsonFleetMachine): MachineRef {
	const createdAt =
		entry.createdAtDaysAgo !== undefined
			? demoDaysAgo(entry.createdAtDaysAgo)
			: demoCreatedAtForMachine(entry.id);
	return {
		id: entry.id,
		name: entry.name,
		providerKind: entry.providerKind,
		agentKind: entry.agentKind,
		model: entry.model ?? DEFAULT_MODEL,
		spec: entry.spec ?? DEFAULT_MACHINE_SPEC,
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt,
		apiUrl: "https://demo.agent-machines.dev/v1",
		apiKey: "demo-key",
		bootstrapState: {
			...BOOTSTRAP_SUCCEEDED,
			startedAt: createdAt,
			finishedAt: new Date(new Date(createdAt).getTime() + 30_000).toISOString(),
		},
		archived: false,
	};
}

export function getDemoSeedMachines(): MachineRef[] {
	return CONFIG.fleet.machines.map(buildDemoMachineRef);
}

export function getDemoSeedLiveState(machineId: string): {
	state: string;
	rawPhase: string;
	lastError: string | null;
} {
	const entry = CONFIG.fleet.machines.find((m) => m.id === machineId);
	if (!entry) {
		return { state: "ready", rawPhase: "running", lastError: null };
	}
	return { ...entry.live, lastError: null };
}

/* ------------------------------------------------------------------ */
/* Per-machine narrative resolution                                    */
/* ------------------------------------------------------------------ */

export type MachineNarrative = {
	machineId: string;
	headline: string;
	chats: ChatSummary[];
	sessions: SessionsPayload;
	logs: LogsPayload;
	cursor: CursorRunsPayload;
	artifacts: JsonMachineBundle["artifacts"];
	execStdout: string;
	execCommands: Record<string, string>;
	usage: DemoMachineUsage;
	starterPrompts: JsonMachineBundle["starterPrompts"];
};

function usageForMachine(
	machineId: string,
	scale: number,
	transitions: DemoMachineUsage["transitions"],
	bucketDays = 7,
): DemoMachineUsage {
	const buckets = Array.from({ length: bucketDays }, (_, i) => {
		const d = new Date();
		d.setDate(d.getDate() - (bucketDays - 1 - i));
		const date = d.toISOString().slice(0, 10);
		const factor = 0.6 + (i / bucketDays) * 0.4;
		return {
			date,
			vcpuSeconds: Math.round(3600 * scale * factor),
			gibSeconds: Math.round(7200 * scale * factor),
			gibHours: Math.round(24 * scale * 0.3),
		};
	});
	const totalVcpu = buckets.reduce((n, b) => n + b.vcpuSeconds, 0);
	const totalMem = buckets.reduce((n, b) => n + b.gibSeconds, 0);
	const totalStorage = buckets.reduce((n, b) => n + b.gibHours, 0);
	return {
		ok: true,
		machineId,
		resources: {
			cpu: {
				totalVcpuSeconds: totalVcpu,
				buckets: buckets.map(({ date, vcpuSeconds }) => ({ date, vcpuSeconds })),
			},
			memory: {
				totalGibSeconds: totalMem,
				buckets: buckets.map(({ date, gibSeconds }) => ({ date, gibSeconds })),
			},
			storage: {
				totalGibHours: totalStorage,
				buckets: buckets.map(({ date, gibHours }) => ({ date, gibHours })),
			},
		},
		transitions,
	};
}

function genericBundle(machine: MachineRef): JsonMachineBundle {
	const now = new Date().toISOString();
	const chatId = `chat-${machine.id.slice(-6)}`;
	const narrative = provisionNarrativeFor(machine);
	return {
		headline: narrative.headline,
		starterPrompts: [...narrative.starterPrompts],
		chats: [
			{
				id: chatId,
				title: `Welcome — ${machine.name}`,
				machineId: machine.id,
				model: machine.model,
				createdAt: now,
				updatedAt: now,
				messageCount: 2,
				messages: [
					{
						id: `msg-${chatId}-u`,
						role: "user",
						content: "What can this agent do?",
						createdAt: Date.now(),
					},
					{
						id: `msg-${chatId}-a`,
						role: "assistant",
						content: narrative.welcomeChat,
						createdAt: Date.now() + 1200,
						durationMs: 1200,
					},
				],
			},
		],
		sessions: {
			sessions: [
				{
					id: `sess-${machine.id.slice(-6)}`,
					preview: `${machine.agentKind} session — ${machine.name}`,
					updatedAt: now,
					bytes: 32_768,
				},
			],
			totalSessions: 1,
			totalBytes: 32_768,
			dbPath: "~/.agent-machines/sessions/",
		},
		logs: {
			lines: [],
			files: [],
			tailLines: 20,
		},
		cursor: { runs: [], totalRuns: 0, logPath: "~/.agent-machines/cursor-runs.jsonl" },
		artifacts: [],
		exec: { defaultStdout: `$ hostname\n${machine.name}\n$ pwd\n/home/machine\n` },
		usage: {
			scale: 0.3,
			transitions: [
				{ label: "Machine provisioned", timestamp: machine.createdAt },
				{ label: "Bootstrap running", timestamp: now },
			],
			bucketDays: 7,
		},
		machineSummary: {
			phase: "running",
			desired: "running",
			vcpu: machine.spec.vcpu,
			memoryMib: machine.spec.memoryMib,
			storageGib: machine.spec.storageGib,
		},
	};
}

function bundleToNarrative(machineId: string, bundle: JsonMachineBundle): MachineNarrative {
	const chatSummaries = bundle.chats.map(({ messages: _m, ...summary }) => summary);
	return {
		machineId,
		headline: bundle.headline,
		chats: chatSummaries,
		sessions: bundle.sessions,
		logs: bundle.logs,
		cursor: bundle.cursor,
		artifacts: bundle.artifacts,
		execStdout: bundle.exec.defaultStdout,
		execCommands: bundle.exec.commands ?? {},
		usage: usageForMachine(
			machineId,
			bundle.usage.scale,
			bundle.usage.transitions,
			bundle.usage.bucketDays ?? 7,
		),
		starterPrompts: bundle.starterPrompts,
	};
}

export function getMachineBundle(machineId: string, machine?: MachineRef): JsonMachineBundle {
	return CONFIG.machines[machineId] ?? (machine ? genericBundle(machine) : genericBundle(buildDemoMachineRef({
		id: machineId,
		name: machineId,
		providerKind: "dedalus",
		agentKind: "hermes",
		model: DEFAULT_MODEL,
		spec: DEFAULT_MACHINE_SPEC,
		live: { state: "ready", rawPhase: "running" },
	})));
}

export function getMachineNarrative(
	machineId: string,
	machine?: MachineRef,
): MachineNarrative {
	return bundleToNarrative(machineId, getMachineBundle(machineId, machine));
}

/* ------------------------------------------------------------------ */
/* Chat CRUD (session overlay on JSON seed)                            */
/* ------------------------------------------------------------------ */

function chatFromJson(chat: JsonChat): ChatRecord {
	const { messages, ...summary } = chat;
	return { ...summary, messages };
}

export function listDemoChatSummaries(
	machineId: string,
	machine?: MachineRef,
): ChatSummary[] {
	const narrative = getMachineNarrative(machineId, machine);
	const seen = new Set<string>();
	const out: ChatSummary[] = [];

	for (const chat of narrative.chats) {
		if (deletedChatIds.has(chat.id)) continue;
		if (savedChats.has(chat.id)) {
			const { messages: _m, ...summary } = savedChats.get(chat.id)!;
			out.push(summary);
		} else {
			out.push(chat);
		}
		seen.add(chat.id);
	}

	for (const record of savedChats.values()) {
		if (record.machineId !== machineId) continue;
		if (seen.has(record.id) || deletedChatIds.has(record.id)) continue;
		const { messages: _m, ...summary } = record;
		out.push(summary);
	}

	return out.sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

export function loadDemoChat(
	chatId: string,
	machine?: MachineRef,
): ChatRecord | null {
	if (deletedChatIds.has(chatId)) return null;
	const saved = savedChats.get(chatId);
	if (saved) return saved;

	for (const [machineId, bundle] of Object.entries(CONFIG.machines)) {
		const match = bundle.chats.find((c) => c.id === chatId);
		if (match) return chatFromJson(match);
		if (machine) {
			const generic = genericBundle(machine).chats.find((c) => c.id === chatId);
			if (generic && machineId === machine.id) return chatFromJson(generic);
		}
	}
	return null;
}

export function saveDemoChat(record: ChatRecord): ChatRecord {
	deletedChatIds.delete(record.id);
	savedChats.set(record.id, record);
	return record;
}

export function deleteDemoChat(chatId: string): void {
	deletedChatIds.add(chatId);
	savedChats.delete(chatId);
}

/* ------------------------------------------------------------------ */
/* Exec stdout routing — see exec-replies.ts                           */
/* ------------------------------------------------------------------ */

export function getStarterPromptsForMachine(machineId: string): ReadonlyArray<{
	label: string;
	prompt: string;
}> {
	return getMachineNarrative(machineId).starterPrompts;
}

export function getDemoMachineSummary(
	machineId: string,
	machine?: MachineRef,
): Record<string, unknown> {
	const bundle = getMachineBundle(machineId, machine);
	const createdAt = machine?.createdAt ?? demoCreatedAtForMachine(machineId);
	const configuredAt = new Date(new Date(createdAt).getTime() + 30_000).toISOString();
	return {
		machineId,
		phase: bundle.machineSummary.phase,
		desired: bundle.machineSummary.desired,
		vcpu: bundle.machineSummary.vcpu,
		memoryMib: bundle.machineSummary.memoryMib,
		storageGib: bundle.machineSummary.storageGib,
		createdAt,
		configuredAt,
		reason: null,
		statusReason: bundle.machineSummary.phase,
		lastTransitionAt: configuredAt,
		lastProgressAt: new Date().toISOString(),
	};
}

/** Public snapshot for GET /api/dashboard/demo — safe to expose to client. */
export function getPublicDemoConfigSnapshot(activeMachineId: string | null): {
	version: number;
	activeMachineId: string | null;
	machineIds: string[];
	fleet: typeof CONFIG.fleet;
} {
	return {
		version: CONFIG.version,
		activeMachineId,
		machineIds: Object.keys(CONFIG.machines),
		fleet: CONFIG.fleet,
	};
}

export { CONFIG as RAW_DEMO_CONFIG };

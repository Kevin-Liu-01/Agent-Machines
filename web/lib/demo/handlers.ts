/**
 * Demo API response builders — imported at the top of live routes.
 */

import type { ProviderCapabilities } from "@/lib/providers";
import {
	DEFAULT_MACHINE_SPEC,
	type MachineSpec,
} from "@/lib/user-config/schema";
import { PROVIDER_LABEL, toPublicConfig } from "@/lib/user-config/schema";

import {
	getDemoMachineSummary,
	getPublicDemoConfigSnapshot,
} from "./config";
import {
	deleteDemoChat,
	listDemoChatSummaries,
	loadDemoChat,
	saveDemoChat,
} from "./chat-records";
import { createDemoExecStream, resolveDemoExec } from "./exec-replies";
import { DEMO_GATEWAY, DEMO_METRICS_SUMMARY, DEMO_USAGE } from "./fixtures";
import { getCronRunDetail } from "./cron-details";
import { createDemoChatResponse } from "./chat-stream";
import {
	getMachineNarrative,
	resolveDemoMachineId,
} from "./machine-narratives";
import { isDemoMode } from "./mode";
import {
	allDemoMachines,
	applyDemoConfigPatch,
	getDemoUserConfig,
	provisionDemoMachine,
	resolveDemoLiveState,
} from "./state";

const DEMO_CAPABILITIES: ProviderCapabilities = {
	runtime: "persistent-machine",
	canProvision: true,
	canWake: true,
	canSleep: true,
	canDestroy: true,
	canExec: true,
	hasPersistentDisk: true,
	usesExternalStorage: false,
};

export function isDemoMachineReady(machineId?: string | null): boolean {
	const id = resolveDemoMachineId(machineId);
	return resolveDemoLiveState(id).state === "ready";
}

export function demoMachinesResponse(activeMachineId?: string | null): Response {
	const config = getDemoUserConfig();
	const machines = allDemoMachines();
	const active = activeMachineId ?? config.activeMachineId ?? machines[0]?.id ?? null;
	return Response.json({
		ok: true,
		activeMachineId: active,
		machines: machines.map((m) => ({
			id: m.id,
			providerKind: m.providerKind,
			providerLabel: PROVIDER_LABEL[m.providerKind],
			capabilities: DEMO_CAPABILITIES,
			agentKind: m.agentKind,
			name: m.name,
			spec: m.spec,
			model: m.model,
			agentProfileId: m.agentProfileId,
			gatewayProfileId: m.gatewayProfileId,
			environmentProfileId: m.environmentProfileId,
			bootstrapPresetId: m.bootstrapPresetId,
			createdAt: m.createdAt,
			apiUrl: m.apiUrl,
			bootstrapState: m.bootstrapState,
			archived: m.archived,
			hasApiKey: true,
			live: { ok: true, ...resolveDemoLiveState(m.id) },
		})),
	});
}

export function demoMachineSummaryResponse(machineId?: string | null): Response {
	const id = resolveDemoMachineId(machineId);
	const machine = allDemoMachines().find((m) => m.id === id);
	const live = resolveDemoLiveState(id);
	const summary = getDemoMachineSummary(id, machine);
	return Response.json(
		{
			...summary,
			phase: live.rawPhase === "running" ? "running" : live.rawPhase,
			statusReason: live.state,
			lastProgressAt: new Date().toISOString(),
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}

export function demoConfigResponse(activeMachineId?: string | null): Response {
	const config = getDemoUserConfig();
	const active = activeMachineId ?? config.activeMachineId;
	return Response.json(getPublicDemoConfigSnapshot(active), {
		headers: { "Cache-Control": "no-store" },
	});
}

export function demoGatewayResponse(): Response {
	return Response.json(DEMO_GATEWAY, { headers: { "Cache-Control": "no-store" } });
}

export function demoSessionsResponse(machineId?: string | null): Response {
	const narrative = getMachineNarrative(machineId);
	return Response.json({
		ok: true,
		data: narrative.sessions,
		fetchedAt: new Date().toISOString(),
	});
}

export function demoLogsResponse(
	machineId?: string | null,
	cron = false,
): Response {
	const narrative = getMachineNarrative(machineId);
	const lines = cron
		? narrative.logs.lines.filter((l) => l.source === "cron")
		: [
				{
					at: new Date().toISOString(),
					level: "info" as const,
					source: "gateway",
					message: `gateway healthy — ${narrative.headline}`,
				},
				...narrative.logs.lines,
			];
	return Response.json({
		ok: true,
		data: { ...narrative.logs, lines, tailLines: lines.length },
		fetchedAt: new Date().toISOString(),
	});
}

export function demoChatsResponse(machineId?: string | null): Response {
	const id = resolveDemoMachineId(machineId);
	return Response.json({ ok: true, chats: listDemoChatSummaries(id), machineId: id });
}

export function demoChatLoadResponse(chatId: string): Response {
	const chat = loadDemoChat(chatId);
	if (!chat) {
		return Response.json({ ok: false, reason: "not_found", message: "Chat not found" }, { status: 404 });
	}
	return Response.json({ ok: true, chat });
}

export function demoChatSaveResponse(record: {
	id: string;
	title?: string;
	machineId?: string | null;
	model?: string | null;
	createdAt?: string;
	updatedAt?: string;
	messageCount?: number;
	messages: unknown[];
}): Response {
	const machineId = resolveDemoMachineId(record.machineId);
	const now = new Date().toISOString();
	const saved = saveDemoChat({
		id: record.id,
		title: (record.title ?? "untitled chat").slice(0, 120),
		machineId,
		model: record.model ?? null,
		createdAt: record.createdAt ?? now,
		updatedAt: now,
		messageCount: record.messages.length,
		messages: record.messages as import("@/lib/types").Message[],
	});
	return Response.json({ ok: true, chat: saved });
}

export function demoChatDeleteResponse(chatId: string): Response {
	deleteDemoChat(chatId);
	return Response.json({ ok: true });
}

export function demoCursorResponse(machineId?: string | null): Response {
	const narrative = getMachineNarrative(machineId);
	return Response.json({
		ok: true,
		data: narrative.cursor,
		fetchedAt: new Date().toISOString(),
	});
}

export function demoArtifactsResponse(machineId?: string | null): Response {
	const id = resolveDemoMachineId(machineId);
	const narrative = getMachineNarrative(id);
	return Response.json({
		ok: true,
		artifacts: narrative.artifacts,
		machineId: id,
	});
}

export function demoMachineUsageResponse(
	machineId: string,
	days = 7,
): Response {
	const narrative = getMachineNarrative(machineId);
	const usage = narrative.usage;
	const slice = Math.min(days, usage.resources.cpu.buckets.length);
	return Response.json({
		...usage,
		resources: {
			cpu: {
				totalVcpuSeconds: usage.resources.cpu.buckets
					.slice(-slice)
					.reduce((n, b) => n + b.vcpuSeconds, 0),
				buckets: usage.resources.cpu.buckets.slice(-slice),
			},
			memory: {
				totalGibSeconds: usage.resources.memory.buckets
					.slice(-slice)
					.reduce((n, b) => n + b.gibSeconds, 0),
				buckets: usage.resources.memory.buckets.slice(-slice),
			},
			storage: {
				totalGibHours: usage.resources.storage.buckets
					.slice(-slice)
					.reduce((n, b) => n + b.gibHours, 0),
				buckets: usage.resources.storage.buckets.slice(-slice),
			},
		},
	});
}

export function demoChatPostResponse(
	messages: Array<{ role: string; content: string }>,
	machineId?: string,
): Response {
	return createDemoChatResponse(messages, machineId);
}

export function demoMachineDetailResponse(machineId: string): Response {
	const config = getDemoUserConfig();
	const machine = config.machines.find((m) => m.id === machineId);
	if (!machine) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	const { apiKey, ...rest } = machine;
	return Response.json({
		ok: true,
		machine: { ...rest, hasApiKey: Boolean(apiKey) },
		live: { ok: true, ...resolveDemoLiveState(machineId) },
	});
}

export function demoProvisionResponse(body: {
	name?: string;
	providerKind?: "dedalus" | "e2b" | "sprites";
	agentKind?: "hermes" | "openclaw" | "claude-code" | "codex";
	model?: string;
	spec?: Partial<MachineSpec>;
}): Response {
	const spec: MachineSpec = {
		vcpu: body.spec?.vcpu ?? DEFAULT_MACHINE_SPEC.vcpu,
		memoryMib: body.spec?.memoryMib ?? DEFAULT_MACHINE_SPEC.memoryMib,
		storageGib: body.spec?.storageGib ?? DEFAULT_MACHINE_SPEC.storageGib,
	};
	const ref = provisionDemoMachine({ ...body, spec });
	const live = resolveDemoLiveState(ref.id);
	return Response.json({
		ok: true,
		machineId: ref.id,
		phase: live.rawPhase,
		state: live.state,
		message:
			"Machine accepted. Run browser bootstrap from the dashboard to install the selected agent runtime.",
	});
}

export function demoBootstrapResponse(machineId?: string): Response {
	const config = getDemoUserConfig();
	const id = machineId ?? config.activeMachineId ?? "demo-fullstack";
	const now = new Date().toISOString();
	applyDemoConfigPatch({
		patchMachine: {
			id,
			patch: {
				bootstrapState: {
					phase: "running",
					current: "start-gateway",
					completed: ["system-deps", "install-uv", "clone-hermes"],
					startedAt: now,
					finishedAt: null,
					lastError: null,
				},
			},
		},
	});
	return Response.json({
		ok: true,
		machineId: id,
		phase: "running",
		message: "Bootstrap started — installing agent runtime.",
	});
}

export function demoWakeSleepResponse(machineId?: string | null): Response {
	return demoMachineSummaryResponse(machineId);
}

export function demoMetricsSummaryResponse(): Response {
	const machines = allDemoMachines();
	const running = machines.filter((m) => resolveDemoLiveState(m.id).state === "ready").length;
	return Response.json({
		...DEMO_METRICS_SUMMARY,
		running,
		totalMachines: machines.length,
		lastCollectedAt: new Date().toISOString(),
	});
}

export function demoUsageResponse(): Response {
	return Response.json(DEMO_USAGE);
}

export function demoExecResponse(options: {
	machineId?: string | null;
	command?: string;
} = {}): Response {
	const command = options.command ?? "";
	const result = resolveDemoExec(command, options.machineId);
	const now = new Date().toISOString();
	return Response.json({
		ok: true,
		command,
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode,
		startedAt: now,
		finishedAt: now,
		elapsedMs: 420,
	});
}

export function demoExecStreamResponse(options: {
	command: string;
	machineId?: string | null;
}): Response {
	return new Response(createDemoExecStream(options.command, options.machineId), {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}

export function demoSetupGetResponse(): Response {
	const config = getDemoUserConfig();
	return Response.json({
		config: toPublicConfig(config),
		defaults: {
			machineSpec: config.draftSpec,
			model: config.draftModel,
			hasOwnerDedalusKey: true,
			hasOwnerCursorKey: true,
			hasOwnerMachine: true,
		},
	});
}

export function demoCronDetailResponse(name: string): Response {
	const detail = getCronRunDetail(name);
	if (!detail) {
		return Response.json({ error: "not_found", message: `Unknown cron: ${name}` }, { status: 404 });
	}
	return Response.json({
		ok: true,
		detail,
		fetchedAt: new Date().toISOString(),
	});
}

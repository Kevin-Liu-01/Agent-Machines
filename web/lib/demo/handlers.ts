/**
 * Demo API response builders — imported at the top of live routes.
 */

import type { ProviderCapabilities } from "@/lib/providers";
import { buildDemoActivityPayload } from "@/lib/dashboard/activity/build-demo-activity";
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
import { DEMO_GATEWAY, DEMO_METRICS_SUMMARY } from "./fixtures";
import { getCronRunDetail } from "./cron-details";
import { createDemoChatResponse } from "./chat-stream";
import {
	getMachineNarrative,
	resolveDemoMachineId,
} from "./machine-narratives";
import { isDemoMode } from "./mode";
import {
	allDemoMachines,
	allDemoMachinesIncludingArchived,
	applyDemoConfigPatch,
	finishDemoBootstrap,
	getDemoRuntimeLogs,
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

export async function demoMachinesResponse(activeMachineId?: string | null): Promise<Response> {
	const { hydrateDemoFleetFromCookie, buildDemoFleetSnapshotForCookie, demoJsonResponse } =
		await import("./demo-fleet-persist");
	await hydrateDemoFleetFromCookie();
	const config = getDemoUserConfig();
	const machines = allDemoMachines();
	const active = activeMachineId ?? config.activeMachineId ?? machines[0]?.id ?? null;
	const snapshot = buildDemoFleetSnapshotForCookie();
	return demoJsonResponse(
		{
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
		},
		snapshot,
	);
}

export async function demoMachineSummaryResponse(machineId?: string | null): Promise<Response> {
	const { hydrateDemoFleetFromCookie } = await import("./demo-fleet-persist");
	await hydrateDemoFleetFromCookie();
	const id = resolveDemoMachineId(machineId);
	const machine = allDemoMachinesIncludingArchived().find((m) => m.id === id);
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
	const id = resolveDemoMachineId(machineId);
	const narrative = getMachineNarrative(id);
	const runtime = getDemoRuntimeLogs(id);
	const base = cron
		? narrative.logs.lines.filter((l) => l.source === "cron")
		: [...narrative.logs.lines, ...runtime];
	const lines =
		base.length === 0
			? []
			: [
					{
						at: new Date().toISOString(),
						level: "info" as const,
						source: "gateway",
						message: `gateway healthy — ${narrative.headline}`,
					},
					...base,
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
		days,
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

export async function demoMachineDetailResponse(machineId: string): Promise<Response> {
	const { hydrateDemoFleetFromCookie } = await import("./demo-fleet-persist");
	await hydrateDemoFleetFromCookie();
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

export async function demoProvisionResponse(body: {
	name?: string;
	providerKind?: "dedalus" | "e2b" | "sprites";
	agentKind?: "hermes" | "openclaw" | "claude-code" | "codex";
	model?: string;
	spec?: Partial<MachineSpec>;
}): Promise<Response> {
	const spec: MachineSpec = {
		vcpu: body.spec?.vcpu ?? DEFAULT_MACHINE_SPEC.vcpu,
		memoryMib: body.spec?.memoryMib ?? DEFAULT_MACHINE_SPEC.memoryMib,
		storageGib: body.spec?.storageGib ?? DEFAULT_MACHINE_SPEC.storageGib,
	};
	const ref = provisionDemoMachine({ ...body, spec });
	const live = resolveDemoLiveState(ref.id);
	const {
		buildDemoFleetSnapshotForCookie,
		demoJsonResponse,
		persistDemoFleetToCookie,
	} = await import("./demo-fleet-persist");
	const snapshot = (await persistDemoFleetToCookie()) ?? buildDemoFleetSnapshotForCookie();
	return demoJsonResponse(
		{
			ok: true,
			machineId: ref.id,
			phase: live.rawPhase,
			state: live.state,
			message:
				"Persistent agent provisioned — 155 skills, 17 MCP services, and full harness deploying in ~30s.",
		},
		snapshot,
	);
}

export async function demoBootstrapResponseAsync(machineId?: string): Promise<Response> {
	const config = getDemoUserConfig();
	const id = machineId ?? config.activeMachineId ?? "demo-fullstack";
	const now = new Date().toISOString();
	finishDemoBootstrap(id);
	applyDemoConfigPatch({
		patchMachine: {
			id,
			patch: {
				bootstrapState: {
					phase: "succeeded",
					current: "start-gateway",
					completed: ["system-deps", "install-uv", "clone-hermes", "seed-knowledge", "start-gateway"],
					startedAt: now,
					finishedAt: now,
					lastError: null,
				},
			},
		},
	});
	const { buildDemoFleetSnapshotForCookie, demoJsonResponse, persistDemoFleetToCookie } =
		await import("./demo-fleet-persist");
	const snapshot = (await persistDemoFleetToCookie()) ?? buildDemoFleetSnapshotForCookie();
	return demoJsonResponse(
		{
			ok: true,
			machineId: id,
			phase: "running",
			message: "Harness online — gateway, skills, MCP integrations, and cron scheduler ready.",
		},
		snapshot,
	);
}

/** @deprecated Use demoBootstrapResponseAsync — kept as alias for existing imports. */
export const demoBootstrapResponse = demoBootstrapResponseAsync;

export async function demoWakeSleepResponse(machineId?: string | null): Promise<Response> {
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

export function demoActivityResponse(): Response {
	return Response.json(buildDemoActivityPayload(), {
		headers: { "Cache-Control": "no-store" },
	});
}

export function demoUsageResponse(days = 7): Response {
	const machines = allDemoMachines();
	const dailyMap = new Map<
		string,
		{ vcpuSeconds: number; gibSeconds: number; gibHours: number }
	>();
	const machineBreakdown: Array<{
		machineId: string;
		vcpu: number;
		memoryMib: number;
		awakeSeconds: number;
		cpuVcpuSeconds: number;
		memoryGibSeconds: number;
	}> = [];

	let totalCostMillicents = 0;

	for (const machine of machines) {
		const narrative = getMachineNarrative(machine.id);
		const usage = narrative.usage;
		const slice = Math.min(days, usage.resources.cpu.buckets.length);
		const cpuBuckets = usage.resources.cpu.buckets.slice(-slice);
		const memBuckets = usage.resources.memory.buckets.slice(-slice);
		const storageBuckets = usage.resources.storage.buckets.slice(-slice);

		let machineCpu = 0;
		let machineMem = 0;
		for (let i = 0; i < slice; i++) {
			const cpu = cpuBuckets[i];
			const mem = memBuckets[i];
			if (!cpu || !mem) continue;
			machineCpu += cpu.vcpuSeconds;
			machineMem += mem.gibSeconds;
			const existing = dailyMap.get(cpu.date) ?? {
				vcpuSeconds: 0,
				gibSeconds: 0,
				gibHours: 0,
			};
			existing.vcpuSeconds += cpu.vcpuSeconds;
			existing.gibSeconds += mem.gibSeconds;
			existing.gibHours += storageBuckets[i]?.gibHours ?? 0;
			dailyMap.set(cpu.date, existing);
		}

		machineBreakdown.push({
			machineId: machine.id,
			vcpu: machine.spec.vcpu,
			memoryMib: machine.spec.memoryMib,
			awakeSeconds: Math.round(machineCpu * 0.85),
			cpuVcpuSeconds: machineCpu,
			memoryGibSeconds: machineMem,
		});
		totalCostMillicents += Math.round(machineCpu * 0.0028);
	}

	const resources = {
		cpu: {
			totalVcpuSeconds: 0,
			buckets: [] as Array<{ date: string; vcpuSeconds: number }>,
		},
		memory: {
			totalGibSeconds: 0,
			buckets: [] as Array<{ date: string; gibSeconds: number }>,
		},
		storage: {
			totalGibHours: 0,
			buckets: [] as Array<{ date: string; gibHours: number }>,
		},
	};

	for (const [date, totals] of dailyMap) {
		resources.cpu.buckets.push({ date, vcpuSeconds: totals.vcpuSeconds });
		resources.memory.buckets.push({ date, gibSeconds: totals.gibSeconds });
		resources.storage.buckets.push({ date, gibHours: totals.gibHours });
		resources.cpu.totalVcpuSeconds += totals.vcpuSeconds;
		resources.memory.totalGibSeconds += totals.gibSeconds;
		resources.storage.totalGibHours += totals.gibHours;
	}

	return Response.json({
		ok: true,
		days,
		resources,
		machineBreakdown,
		totalCostMillicents,
		totalCostFormatted: `$${(totalCostMillicents / 100_000).toFixed(2)}`,
	});
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

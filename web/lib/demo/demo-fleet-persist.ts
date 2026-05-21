import "server-only";

import { NextResponse } from "next/server";

import type { MachineRef } from "@/lib/user-config/schema";

import type { DemoFleetSnapshot } from "./demo-types";
import {
	applyDemoFleetSnapshot,
	buildDemoFleetSnapshot,
	pruneJunkDemoExtraMachines,
	resetDemoState,
	sanitizeDemoFleetSnapshot,
} from "./state";
import {
	attachDemoFleetSnapshotCookie,
	clearDemoFleetSnapshot,
	demoFleetCookiePayload,
	readDemoFleetSnapshot,
	writeDemoFleetSnapshot,
} from "./session-store";

function compactMachine(m: MachineRef): MachineRef {
	return {
		id: m.id,
		providerKind: m.providerKind,
		agentKind: m.agentKind,
		name: m.name,
		spec: m.spec,
		model: m.model,
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: m.createdAt,
		apiUrl: m.apiUrl ?? "https://demo.agent-machines.dev/v1",
		apiKey: "demo-key",
		bootstrapState: {
			phase: m.bootstrapState?.phase ?? "running",
			current: m.bootstrapState?.current ?? null,
			completed: [],
			startedAt: m.bootstrapState?.startedAt ?? m.createdAt,
			finishedAt: m.bootstrapState?.finishedAt ?? null,
			lastError: m.bootstrapState?.lastError ?? null,
		},
		archived: m.archived,
	};
}

function compactSnapshot(snapshot: DemoFleetSnapshot): DemoFleetSnapshot {
	return {
		activeMachineId: snapshot.activeMachineId,
		extraMachines: snapshot.extraMachines.map(compactMachine),
		live: snapshot.live,
	};
}

function syncLiveToMachines(snapshot: DemoFleetSnapshot): DemoFleetSnapshot {
	const ids = new Set(snapshot.extraMachines.map((m) => m.id));
	const live: DemoFleetSnapshot["live"] = {};
	for (const id of ids) {
		const entry = snapshot.live[id];
		if (entry) live[id] = entry;
	}
	return { ...snapshot, live };
}

function snapshotFitsCookie(snapshot: DemoFleetSnapshot): boolean {
	const payload = demoFleetCookiePayload(snapshot);
	return payload !== null;
}

function fitSnapshotToCookie(snapshot: DemoFleetSnapshot): DemoFleetSnapshot {
	let compact = syncLiveToMachines(compactSnapshot(snapshot));
	const activeId = compact.activeMachineId;

	while (!snapshotFitsCookie(compact) && compact.extraMachines.length > 0) {
		const removable = compact.extraMachines.filter((m) => m.id !== activeId);
		if (removable.length === 0) break;

		const dropId = removable[removable.length - 1]?.id;
		if (!dropId) break;

		const nextLive = { ...compact.live };
		delete nextLive[dropId];
		compact = {
			...compact,
			extraMachines: compact.extraMachines.filter((m) => m.id !== dropId),
			live: nextLive,
		};
	}

	return compact;
}

function minimalActiveSnapshot(snapshot: DemoFleetSnapshot): DemoFleetSnapshot | null {
	const activeId = snapshot.activeMachineId;
	if (!activeId) return null;

	const machine = snapshot.extraMachines.find((m) => m.id === activeId);
	if (!machine) return null;

	const liveEntry = snapshot.live[activeId];
	return fitSnapshotToCookie({
		activeMachineId: activeId,
		extraMachines: [compactMachine(machine)],
		live: liveEntry ? { [activeId]: liveEntry } : {},
	});
}

export async function hydrateDemoFleetFromCookie(): Promise<void> {
	const snapshot = await readDemoFleetSnapshot();
	if (!snapshot) return;
	const cleaned = sanitizeDemoFleetSnapshot(snapshot);
	applyDemoFleetSnapshot(cleaned);
	const pruned = pruneJunkDemoExtraMachines();
	const changed =
		cleaned.extraMachines.length !== snapshot.extraMachines.length || pruned;
	if (changed) {
		await persistDemoFleetToCookie();
	}
}

export function buildDemoFleetSnapshotForCookie(): DemoFleetSnapshot | null {
	const full = buildDemoFleetSnapshot();
	const fitted = fitSnapshotToCookie(full);
	if (snapshotFitsCookie(fitted)) return fitted;

	const minimal = minimalActiveSnapshot(full);
	if (minimal && snapshotFitsCookie(minimal)) return minimal;

	return null;
}

export async function persistDemoFleetToCookie(): Promise<DemoFleetSnapshot | null> {
	pruneJunkDemoExtraMachines();
	const snapshot = buildDemoFleetSnapshotForCookie();
	if (!snapshot) return null;
	await writeDemoFleetSnapshot(snapshot);
	return snapshot;
}

export function demoJsonResponse(
	body: unknown,
	snapshot: DemoFleetSnapshot | null,
	init?: ResponseInit,
): NextResponse {
	const response = NextResponse.json(body, init);
	if (snapshot) attachDemoFleetSnapshotCookie(response, snapshot);
	return response;
}

export async function resolveDemoMachineForPage(
	machineId: string,
): Promise<MachineRef | null> {
	await hydrateDemoFleetFromCookie();

	const { getDemoUserConfig } = await import("./state");
	const fromState = getDemoUserConfig().machines.find((m) => m.id === machineId);
	if (fromState) return fromState;

	const snapshot = await readDemoFleetSnapshot();
	if (!snapshot) return null;

	applyDemoFleetSnapshot(snapshot);

	const afterHydrate = getDemoUserConfig().machines.find((m) => m.id === machineId);
	if (afterHydrate) return afterHydrate;

	return snapshot.extraMachines.find((m) => m.id === machineId) ?? null;
}

export async function resetDemoFleet(): Promise<void> {
	resetDemoState();
	await clearDemoFleetSnapshot();
}

/**
 * Mutable demo fleet state — provisions, active machine, live phases.
 */

import { randomUUID } from "node:crypto";

import {
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MODEL,
	DEFAULT_USER_CONFIG,
	INITIAL_BOOTSTRAP_STATE,
	type AgentKind,
	type MachineRef,
	type MachineSpec,
	type ProviderKind,
	type UserConfig,
} from "@/lib/user-config/schema";

import { getDemoSeedMachines, getDemoProvidersConfig, resetDemoConfigSession } from "./config";

const BOOTSTRAP_SUCCEEDED = {
	...INITIAL_BOOTSTRAP_STATE,
	phase: "succeeded" as const,
	startedAt: "2026-05-01T12:00:00.000Z",
	finishedAt: "2026-05-01T12:00:30.000Z",
};

/** How long a freshly provisioned machine stays in `starting` before `ready`. */
const PROVISION_BOOT_MS = 3200;

export type DemoProvisionRequest = {
	name?: string;
	providerKind?: ProviderKind;
	agentKind?: AgentKind;
	model?: string;
	spec?: MachineSpec;
};

export type DemoLiveState = {
	state: string;
	rawPhase: string;
	lastError: string | null;
};

type LiveEntry = DemoLiveState & { provisionedAt?: number };

const extraMachines: MachineRef[] = [];
const machinePatches = new Map<string, Partial<MachineRef>>();
const liveById = new Map<string, LiveEntry>();
let demoActiveMachineId: string | null = null;

let liveStatesSeeded = false;

function seedLiveStates(): void {
	for (const m of getDemoSeedMachines()) {
		if (!liveById.has(m.id)) {
			liveById.set(m.id, {
				state: "ready",
				rawPhase: "running",
				lastError: null,
			});
		}
	}
}

function ensureLiveStatesSeeded(): void {
	if (liveStatesSeeded) return;
	seedLiveStates();
	liveStatesSeeded = true;
}

function applyPatch(ref: MachineRef): MachineRef {
	const patch = machinePatches.get(ref.id);
	return patch ? { ...ref, ...patch } : ref;
}

export function allDemoMachines(): MachineRef[] {
	ensureLiveStatesSeeded();
	const merged = [...extraMachines, ...getDemoSeedMachines()].map(applyPatch);
	return merged.filter((m) => !m.archived);
}

export function allDemoMachinesIncludingArchived(): MachineRef[] {
	ensureLiveStatesSeeded();
	return [...extraMachines, ...getDemoSeedMachines()].map(applyPatch);
}

export function getDemoActiveMachineId(): string | null {
	const machines = allDemoMachines();
	if (demoActiveMachineId && machines.some((m) => m.id === demoActiveMachineId)) {
		return demoActiveMachineId;
	}
	return machines[0]?.id ?? null;
}

export function getDemoUserConfig(): UserConfig {
	const machines = allDemoMachinesIncludingArchived();
	return {
		...DEFAULT_USER_CONFIG,
		providers: getDemoProvidersConfig() as UserConfig["providers"],
		machines,
		activeMachineId: getDemoActiveMachineId(),
		setupStep: "provisioned",
		draftAgentKind: "hermes",
		draftProviderKind: "dedalus",
		draftSpec: DEFAULT_MACHINE_SPEC,
		draftModel: DEFAULT_MODEL,
	};
}

export function resolveDemoLiveState(machineId: string): DemoLiveState {
	const entry = liveById.get(machineId);
	if (!entry) {
		return { state: "ready", rawPhase: "running", lastError: null };
	}
	if (entry.provisionedAt !== undefined) {
		const elapsed = Date.now() - entry.provisionedAt;
		if (elapsed < PROVISION_BOOT_MS) {
			return { state: "starting", rawPhase: "placement_pending", lastError: null };
		}
		return { state: "ready", rawPhase: "running", lastError: null };
	}
	return {
		state: entry.state,
		rawPhase: entry.rawPhase,
		lastError: entry.lastError,
	};
}

export function provisionDemoMachine(req: DemoProvisionRequest = {}): MachineRef {
	const id = `demo-${randomUUID().slice(0, 8)}`;
	const now = new Date().toISOString();
	const ref: MachineRef = {
		id,
		providerKind: req.providerKind ?? "dedalus",
		agentKind: req.agentKind ?? "hermes",
		name: req.name?.trim() || `agent-${id.slice(-6)}`,
		spec: req.spec ?? DEFAULT_MACHINE_SPEC,
		model: req.model?.trim() || DEFAULT_MODEL,
		agentProfileId: null,
		gatewayProfileId: null,
		environmentProfileId: null,
		bootstrapPresetId: null,
		createdAt: now,
		apiUrl: "https://demo.agent-machines.dev/v1",
		apiKey: "demo-key",
		bootstrapState: {
			phase: "running",
			current: "start-gateway",
			completed: ["system-deps", "install-uv", "clone-hermes"],
			startedAt: now,
			finishedAt: null,
			lastError: null,
		},
	};
	extraMachines.unshift(ref);
	demoActiveMachineId = id;
	liveById.set(id, {
		state: "starting",
		rawPhase: "placement_pending",
		lastError: null,
		provisionedAt: Date.now(),
	});
	return ref;
}

export type DemoConfigPatch = {
	activeMachineId?: string | null;
	upsertMachine?: MachineRef;
	patchMachine?: { id: string; patch: Partial<MachineRef> };
	removeMachine?: string;
	archiveMachine?: string;
	unarchiveMachine?: string;
	setupStep?: string;
};

export function applyDemoConfigPatch(patch: DemoConfigPatch): UserConfig {
	if (patch.activeMachineId !== undefined) {
		demoActiveMachineId = patch.activeMachineId;
	}

	if (patch.upsertMachine) {
		const upsert = patch.upsertMachine;
		const idx = extraMachines.findIndex((m) => m.id === upsert.id);
		if (idx >= 0) extraMachines[idx] = upsert;
		else extraMachines.unshift(upsert);
	}

	if (patch.patchMachine) {
		const { id, patch: mp } = patch.patchMachine;
		const existing = machinePatches.get(id) ?? {};
		machinePatches.set(id, { ...existing, ...mp });
		const inExtra = extraMachines.findIndex((m) => m.id === id);
		if (inExtra >= 0) {
			extraMachines[inExtra] = { ...extraMachines[inExtra], ...mp };
		}
	}

	if (patch.removeMachine) {
		const id = patch.removeMachine;
		const idx = extraMachines.findIndex((m) => m.id === id);
		if (idx >= 0) extraMachines.splice(idx, 1);
		machinePatches.delete(id);
		liveById.delete(id);
		if (demoActiveMachineId === id) demoActiveMachineId = null;
	}

	if (patch.archiveMachine) {
		const id = patch.archiveMachine;
		const existing = machinePatches.get(id) ?? {};
		machinePatches.set(id, { ...existing, archived: true });
		if (demoActiveMachineId === id) demoActiveMachineId = null;
	}

	if (patch.unarchiveMachine) {
		const id = patch.unarchiveMachine;
		const existing = machinePatches.get(id) ?? {};
		machinePatches.set(id, { ...existing, archived: false });
	}

	if (patch.setupStep !== undefined) {
		// no-op — demo config always provisioned
	}

	return getDemoUserConfig();
}

export function resetDemoState(): void {
	extraMachines.length = 0;
	machinePatches.clear();
	liveById.clear();
	demoActiveMachineId = null;
	resetDemoConfigSession();
	liveStatesSeeded = false;
	seedLiveStates();
	liveStatesSeeded = true;
}

/** Mark bootstrap complete for a machine that was mid-provision. */
export function finishDemoBootstrap(machineId: string): void {
	const entry = liveById.get(machineId);
	if (entry?.provisionedAt !== undefined) {
		liveById.set(machineId, {
			state: "ready",
			rawPhase: "running",
			lastError: null,
			provisionedAt: entry.provisionedAt,
		});
	}
	const inExtra = extraMachines.find((m) => m.id === machineId);
	if (inExtra) {
		inExtra.bootstrapState = { ...BOOTSTRAP_SUCCEEDED };
	}
}

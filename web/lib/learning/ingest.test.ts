import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	type CronEntry,
	type MachineRef,
	type UserConfig,
} from "@/lib/user-config/schema";
import { readTraceOutcome } from "@/lib/learning/route-outcomes";
import type { RunTrace } from "@/lib/learning/types";

const mocks = vi.hoisted(() => ({
	getProvider: vi.fn(),
	exec: vi.fn(),
	emitRunTraces: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
	getProvider: mocks.getProvider,
	MachineProviderError: class MachineProviderError extends Error {},
}));

vi.mock("@/lib/learning/trace", () => ({
	emitRunTraces: mocks.emitRunTraces,
}));

import { ingestRunTracesForUser } from "./ingest";

const MACHINE: MachineRef = {
	id: "am-1",
	providerKind: "e2b",
	agentKind: "claude-code",
	name: "box",
	spec: { vcpu: 2, memoryMib: 4096, storageGib: 20 },
	model: "claude-opus-4-8",
	agentProfileId: null,
	gatewayProfileId: null,
	environmentProfileId: null,
	bootstrapPresetId: null,
	createdAt: "2026-07-01T00:00:00.000Z",
	apiUrl: null,
	apiKey: null,
	bootstrapState: {
		phase: "succeeded",
		current: null,
		completed: [],
		startedAt: "2026-07-01T00:00:00.000Z",
		finishedAt: "2026-07-01T00:00:00.000Z",
		lastError: null,
	},
};

const CRON: CronEntry = {
	id: "cron-1",
	name: "nightly",
	machineId: MACHINE.id,
	schedule: "0 3 * * *",
	prompt: "run the suite",
	enabled: true,
	createdAt: "2026-07-01T00:00:00.000Z",
	lastRunAt: null,
	lastStatus: null,
	lastSummary: null,
	skills: ["deepsec"],
};

const CONFIG: UserConfig = {
	...DEFAULT_USER_CONFIG,
	machines: [MACHINE],
	crons: [CRON],
};

/** One completed run: 60s wall clock, exit 0. */
const RUN_LINE = JSON.stringify({
	id: "cron-1",
	startedAt: "2026-07-20T03:00:00Z",
	finishedAt: "2026-07-20T03:01:00Z",
	exitCode: 0,
	arm: { runtime: "claude-code", substrate: "e2b", model: "claude-opus-4-8", router: null },
});

function emitted(): RunTrace[] {
	expect(mocks.emitRunTraces).toHaveBeenCalledTimes(1);
	return mocks.emitRunTraces.mock.calls[0][0] as RunTrace[];
}

describe("ingestRunTracesForUser -- outcome block on the write path", () => {
	beforeEach(() => {
		mocks.exec.mockReset();
		mocks.emitRunTraces.mockReset();
		mocks.emitRunTraces.mockResolvedValue(undefined);
		mocks.getProvider.mockReturnValue({ exec: mocks.exec });
		mocks.exec.mockResolvedValue({ stdout: `${RUN_LINE}\n`, stderr: "", exitCode: 0 });
	});

	it("labels the cost it writes as the sandbox half, with the model half null", async () => {
		const count = await ingestRunTracesForUser("user-1", CONFIG);
		expect(count).toBe(1);
		const [trace] = emitted();
		const outcome = readTraceOutcome(trace.extra);
		// 60 awake seconds at the estimator's rates: cpu 2*60*0.0046 = 0.552,
		// memory 4*60*0.0023 = 0.552, storage 20*(60/3600)*0.015 = 0.005 -> 1.109,
		// rounded to 1 millicent.
		expect(trace.costMillicents).toBe(1);
		expect(outcome).toEqual({
			v: 1,
			sandboxCostMillicents: 1,
			sandboxCostBasis: "estimated",
			modelCostMillicents: null,
			timeToFirstOutputMs: null,
			resumed: null,
		});
	});

	it("keeps the pre-existing extra fields alongside the outcome block", async () => {
		await ingestRunTracesForUser("user-1", CONFIG);
		const [trace] = emitted();
		expect(trace.extra?.cronId).toBe("cron-1");
		expect(trace.extra?.skills).toEqual(["deepsec"]);
	});

	it("writes a null sandbox cost rather than 0 when the run has no usable window", async () => {
		mocks.exec.mockResolvedValue({
			stdout: `${JSON.stringify({
				id: "cron-1",
				startedAt: "not-a-date",
				finishedAt: "not-a-date",
				exitCode: 0,
			})}\n`,
			stderr: "",
			exitCode: 0,
		});
		await ingestRunTracesForUser("user-1", CONFIG);
		const [trace] = emitted();
		expect(trace.latencyMs).toBeNull();
		expect(trace.costMillicents).toBeNull();
		expect(readTraceOutcome(trace.extra)?.sandboxCostMillicents).toBeNull();
	});
});

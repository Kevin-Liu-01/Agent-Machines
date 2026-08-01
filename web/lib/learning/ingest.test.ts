import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_USER_CONFIG,
	type CronEntry,
	type MachineRef,
	type UserConfig,
} from "@/lib/user-config/schema";
import { readTraceOutcome } from "@/lib/learning/route-outcomes";
import { readTraceLanePrice } from "@/lib/learning/trace-price";
import { estimateCost } from "@/lib/metrics/cost";
import { sandboxCostMillicents } from "@/lib/metrics/prices";
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
		// 60s on E2B's published rates at the machine's 2 vCPU / 4 GiB spec:
		// cpu (1/60)h * 2 * $0.0504 = $0.00168, memory 4 GiB * (1/60)h * $0.0162
		// = $0.00108 -> $0.00276 -> 276 millicents.
		expect(trace.costMillicents).toBe(276);
		expect(outcome).toEqual({
			v: 1,
			sandboxCostMillicents: 276,
			// The FIGURE is still an estimate -- modeled against a requested spec,
			// not a provider bill. The RATE behind it is published, which is a
			// different axis and rides in extra.price.
			sandboxCostBasis: "estimated",
			modelCostMillicents: null,
			timeToFirstOutputMs: null,
			resumed: null,
		});
	});

	it("prices the run at the provider's published rate, not the retired table", async () => {
		await ingestRunTracesForUser("user-1", CONFIG);
		const [trace] = emitted();
		const legacy = Math.round(estimateCost(MACHINE.spec, 60).totalMillicents);
		expect(legacy).toBe(1);
		expect(trace.costMillicents).not.toBe(legacy);
		expect(trace.costMillicents).toBe(
			sandboxCostMillicents("e2b", { durationMs: 60_000, vcpu: 2, memoryMib: 4096 }),
		);
	});

	it("records the rate provenance next to the figure", async () => {
		await ingestRunTracesForUser("user-1", CONFIG);
		const [trace] = emitted();
		expect(readTraceLanePrice(trace.extra)).toEqual({
			v: 1,
			substrate: "e2b",
			rateBasis: "published",
			costRanked: true,
			reason: null,
		});
	});

	it("writes no cost at all on a lane with no published rate, and says why", async () => {
		mocks.exec.mockResolvedValue({
			stdout: `${JSON.stringify({
				id: "cron-1",
				startedAt: "2026-07-20T03:00:00Z",
				finishedAt: "2026-07-20T03:01:00Z",
				exitCode: 0,
				arm: { runtime: "claude-code", substrate: "sprites", model: "claude-opus-4-8" },
			})}\n`,
			stderr: "",
			exitCode: 0,
		});
		await ingestRunTracesForUser("user-1", CONFIG);
		const [trace] = emitted();
		expect(trace.substrate).toBe("sprites");
		// Not 0, and not the E2B or Dedalus number: an unpriced lane gets no
		// figure, because a substituted one is what made it look precisely priced.
		expect(trace.costMillicents).toBeNull();
		expect(readTraceOutcome(trace.extra)?.sandboxCostMillicents).toBeNull();
		const price = readTraceLanePrice(trace.extra);
		expect(price?.costRanked).toBe(false);
		expect(price?.rateBasis).toBe("unknown");
		expect(price?.reason).toContain("profiles[sprites].pricing.cpuPerVcpuHour.basis");
		// The run itself still counts: the lane is routable, just not cost-ranked.
		expect(trace.success).toBe(true);
		expect(trace.latencyMs).toBe(60_000);
	});

	it("keeps the sandbox and model halves separate on every path", async () => {
		await ingestRunTracesForUser("user-1", CONFIG);
		const [trace] = emitted();
		const outcome = readTraceOutcome(trace.extra);
		// The cron log carries no token usage, so the model half is null and the
		// sandbox half is never allowed to stand in for a total.
		expect(outcome?.modelCostMillicents).toBeNull();
		expect(outcome?.sandboxCostMillicents).toBe(trace.costMillicents);
		expect(trace.extra).not.toHaveProperty("totalCostMillicents");
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
		// Unpriceable because of the RUN, not the lane: e2b's rate stays published
		// on the row, and only this row is refused.
		const price = readTraceLanePrice(trace.extra);
		expect(price?.rateBasis).toBe("published");
		expect(price?.costRanked).toBe(false);
		expect(price?.reason).toContain("run window is unusable");
	});
});

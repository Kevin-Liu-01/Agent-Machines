import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MachineRef, ProviderCredentials } from "@/lib/user-config/schema";

const providerMocks = vi.hoisted(() => ({
	getProvider: vi.fn(),
	state: vi.fn(),
	exec: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
	getProvider: providerMocks.getProvider,
	MachineProviderError: class MachineProviderError extends Error {},
}));

import { buildDailyRollupRows, observedIntervalSeconds, probeMachine } from "./collector";

const MACHINE: MachineRef = {
	id: "am-openclaw",
	providerKind: "sprites",
	agentKind: "openclaw",
	name: "openclaw",
	spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
	model: "openclaw",
	agentProfileId: null,
	gatewayProfileId: null,
	environmentProfileId: null,
	bootstrapPresetId: null,
	createdAt: "2026-06-23T00:00:00.000Z",
	apiUrl: null,
	apiKey: null,
	bootstrapState: {
		phase: "succeeded",
		current: null,
		completed: [],
		startedAt: "2026-06-23T00:00:00.000Z",
		finishedAt: "2026-06-23T00:00:00.000Z",
		lastError: null,
	},
};

const CREDS = {} as ProviderCredentials;

describe("probeMachine", () => {
	beforeEach(() => {
		providerMocks.state.mockReset();
		providerMocks.exec.mockReset();
		providerMocks.getProvider.mockReturnValue({
			state: providerMocks.state,
			exec: providerMocks.exec,
		});
	});

	it("keeps a ready sample when the optional resource probe fails", async () => {
		providerMocks.state.mockResolvedValue({
			id: MACHINE.id,
			state: "ready",
			rawPhase: "warm",
			spec: MACHINE.spec,
			createdAt: MACHINE.createdAt,
			lastError: null,
		});
		providerMocks.exec.mockRejectedValue(new Error("exec unavailable"));

		await expect(probeMachine(MACHINE, CREDS)).resolves.toMatchObject({
			machineId: MACHINE.id,
			phase: "ready",
			snapshot: null,
		});
	});

	it("does not exec sleeping machines", async () => {
		providerMocks.state.mockResolvedValue({
			id: MACHINE.id,
			state: "sleeping",
			rawPhase: "warm",
			spec: MACHINE.spec,
			createdAt: MACHINE.createdAt,
			lastError: null,
		});

		await expect(probeMachine(MACHINE, CREDS)).resolves.toMatchObject({
			machineId: MACHINE.id,
			phase: "warm",
			snapshot: null,
		});
		expect(providerMocks.exec).not.toHaveBeenCalled();
	});

	it("invariant_provider_reported_allocation_overrides_requested_shape", async () => {
		providerMocks.state.mockResolvedValue({ state: "ready", rawPhase: "running", spec: { vcpu: 4, memoryMib: 8192 } });
		providerMocks.exec.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
		expect(await probeMachine(MACHINE, CREDS)).toMatchObject({ vcpu: 4, specMemoryMib: 8192, specStorageGib: 0 });
		expect(providerMocks.exec.mock.calls[0][1]).toContain('df -B1 "$HOME"');
	});

	it("invariant_unreported_allocation_is_not_filled_from_requested_spec", async () => {
		providerMocks.state.mockResolvedValue({ state: "ready", rawPhase: "running", spec: {} });
		providerMocks.exec.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
		expect(await probeMachine(MACHINE, CREDS)).toMatchObject({ vcpu: 0, specMemoryMib: 0, specStorageGib: 0 });
	});
});

describe("buildDailyRollupRows", () => {
	it("invariant_rollup_accumulates_observed_resource_time_without_repricing_history", () => {
		const samples = [
			{
				machineId: "machine-1",
				machineName: "one",
				phase: "ready",
				vcpu: 2,
				specMemoryMib: 2048,
				specStorageGib: 10,
				snapshot: null,
			},
		];
		const { usageRows } = buildDailyRollupRows(
			"user-1",
			samples,
			[
				{
					machine_id: "machine-1",
					awake_seconds: 600,
					cpu_vcpu_seconds: 1200,
					memory_gib_seconds: 1200,
					storage_gib_hours: 1,
					sample_count: 2,
				},
			],
			"2026-07-23",
			new Map([["machine-1", 1800]]),
		);

		expect(usageRows).toEqual([
			expect.objectContaining({
				awake_seconds: 2400,
				cpu_vcpu_seconds: 4800,
				memory_gib_seconds: 4800,
				storage_gib_hours: 6,
				sample_count: 3,
			}),
		]);
	});
});

describe("observed collection intervals", () => {
	const sample = { machineId: "m", machineName: "m", phase: "ready", vcpu: 2, specMemoryMib: 4096, specStorageGib: 20, snapshot: null };
	const now = "2026-09-09T10:00:30Z";
	const previous = { recorded_at: "2026-09-09T10:00:15Z", phase: "ready", vcpu: 2, spec_memory_mib: 4096 };
	it("invariant_first_observation_does_not_invent_prior_usage", () => {
		expect(observedIntervalSeconds(null, sample, now, 1800)).toBe(0);
	});
	it("invariant_foreground_refresh_cannot_count_a_full_cadence_twice", () => {
		expect(observedIntervalSeconds(previous, sample, now, 30)).toBe(15);
		expect(observedIntervalSeconds({ ...previous, recorded_at: now }, sample, now, 30)).toBe(0);
	});
	it("invariant_sleep_resize_and_missing_observation_gaps_are_not_charged", () => {
		expect(observedIntervalSeconds({ ...previous, phase: "sleeping" }, sample, now, 30)).toBe(0);
		expect(observedIntervalSeconds({ ...previous, vcpu: 1 }, sample, now, 30)).toBe(0);
		expect(observedIntervalSeconds({ ...previous, recorded_at: "2026-09-01T00:00:00Z" }, sample, now, 30)).toBe(0);
	});
});

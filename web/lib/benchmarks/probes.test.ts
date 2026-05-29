import { describe, expect, it } from "vitest";

import { FakeProvider } from "./fake-provider";
import { ExecLatencyProbe, parseCpuNanos, parseDdMbps } from "./probes";

describe("parseCpuNanos", () => {
	it("extracts NS from bench output", () => {
		expect(parseCpuNanos("NS=123456789")).toBe(123456789);
	});
	it("returns null when absent", () => {
		expect(parseCpuNanos("garbage")).toBeNull();
	});
});

describe("parseDdMbps", () => {
	it("parses MB/s", () => {
		const out =
			"268435456 bytes (268 MB, 256 MiB) copied, 0.43 s, 624 MB/s";
		expect(parseDdMbps(out)).toBe(624);
	});
	it("normalizes GB/s to MB/s", () => {
		const out = "1073741824 bytes copied, 0.5 s, 2.1 GB/s";
		expect(parseDdMbps(out)).toBeCloseTo(2100, 5);
	});
	it("returns null without a throughput trailer", () => {
		expect(parseDdMbps("no rate here")).toBeNull();
	});
});

describe("ExecLatencyProbe", () => {
	it("collects N samples and reports a p50", async () => {
		const provider = new FakeProvider("e2b", {
			provisionMs: 0,
			readyDelayMs: 0,
			execMs: 5,
			wakeMs: 0,
			teardownMs: 0,
			cpuMops: 90,
			diskWriteMbps: 500,
			diskReadMbps: 1000,
		});
		const probe = new ExecLatencyProbe(5);
		const result = await probe.run({
			provider,
			machineId: "m1",
			spec: { vcpu: 2, memoryMib: 4096, storageGib: 10 },
		});
		expect(result.ok).toBe(true);
		expect(result.id).toBe("execP50Ms");
		expect(result.rawSamples.length).toBe(5);
		expect(result.stats?.successRate).toBe(1);
	});

	it("surfaces an error when every exec fails", async () => {
		const provider = new FakeProvider("e2b", {
			provisionMs: 0,
			readyDelayMs: 0,
			execMs: 0,
			wakeMs: 0,
			teardownMs: 0,
			cpuMops: 90,
			diskWriteMbps: 500,
			diskReadMbps: 1000,
			failRate: 1,
		});
		const probe = new ExecLatencyProbe(3);
		const result = await probe.run({
			provider,
			machineId: "m1",
			spec: { vcpu: 2, memoryMib: 4096, storageGib: 10 },
		});
		expect(result.ok).toBe(false);
		expect(result.stats).toBeNull();
		expect(result.error).toBeTruthy();
	});
});

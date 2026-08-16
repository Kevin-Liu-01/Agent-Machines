import { describe, expect, it } from "vitest";

import {
	DIRECT_TERMINAL_LANE_COUNT,
	DIRECT_TERMINAL_RETRY_MS,
	parseTerminalSocketMessage,
	TERMINAL_LATENCY_BUDGET_MS,
	terminalLatencyP95,
} from "./terminal-socket";

it("enforces the direct-terminal 50ms budget", () => {
	expect(TERMINAL_LATENCY_BUDGET_MS).toBe(50);
	expect(DIRECT_TERMINAL_LANE_COUNT).toBe(6);
	expect(DIRECT_TERMINAL_RETRY_MS).toBeLessThan(TERMINAL_LATENCY_BUDGET_MS / 2);
});

describe("parseTerminalSocketMessage", () => {
	it("accepts bounded input with a correlation id", () => {
		expect(
			parseTerminalSocketMessage(
				JSON.stringify({ type: "input", data: "echo ok\r", inputId: "i_123" }),
			),
		).toEqual({ type: "input", data: "echo ok\r", inputId: "i_123" });
	});

	it("rejects malformed, oversized, and uncorrelated input", () => {
		expect(parseTerminalSocketMessage("not-json")).toBeNull();
		expect(
			parseTerminalSocketMessage(
				JSON.stringify({ type: "input", data: "x", inputId: "bad id" }),
			),
		).toBeNull();
		expect(
			parseTerminalSocketMessage(
				JSON.stringify({ type: "input", data: "x".repeat(8_193), inputId: "i" }),
			),
		).toBeNull();
	});

	it("clamps resize frames to the tmux bounds", () => {
		expect(
			parseTerminalSocketMessage(
				JSON.stringify({ type: "resize", cols: 99_999, rows: 0 }),
			),
		).toEqual({ type: "resize", cols: 500, rows: 5 });
	});
});

describe("terminalLatencyP95", () => {
	it("uses the conservative nearest-rank percentile", () => {
		expect(terminalLatencyP95([10, 30, 20])).toBe(30);
		expect(terminalLatencyP95(Array.from({ length: 20 }, (_, index) => index + 1))).toBe(19);
	});

	it("ignores invalid samples and reports no synthetic zero", () => {
		expect(terminalLatencyP95([])).toBeNull();
		expect(terminalLatencyP95([Number.NaN, -1, 12])).toBe(12);
	});
});

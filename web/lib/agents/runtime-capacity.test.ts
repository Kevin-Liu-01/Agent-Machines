import { describe, expect, it } from "vitest";
import { assertRuntimeCapacity, runtimeCapacity } from "./runtime-capacity";

describe("observed runtime capacity", () => {
	it.each([256, 478, 512])("blocks observed OpenClaw RAM of %i MiB", (memory) => {
		expect(runtimeCapacity("openclaw", memory)).toMatchObject({ status: "blocked", memoryMib: memory });
		expect(() => assertRuntimeCapacity("openclaw", memory)).toThrow(/larger allocation/);
	});
	it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, "2048"])("leaves unreported or invalid RAM unverified: %s", (memory) => {
		expect(runtimeCapacity("openclaw", memory)).toMatchObject({ status: "unverified", memoryMib: null });
		expect(() => assertRuntimeCapacity("openclaw", memory)).not.toThrow();
	});
	it("does not turn a larger allocation into an unsupported reliability guarantee", () => {
		expect(runtimeCapacity("openclaw", 2048)).toEqual({ status: "not-blocked", memoryMib: 2048 });
	});
	it.each(["hermes", "claude-code", "codex"] as const)("does not apply OpenClaw-only evidence to %s", (agent) => {
		expect(runtimeCapacity(agent, 512)).toEqual({ status: "not-applicable", memoryMib: null });
	});
});

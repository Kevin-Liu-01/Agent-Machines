import { describe, expect, it } from "vitest";

import {
	bootstrapLogPath,
	machineHomeForProvider,
	wrapPhaseCommand,
} from "@/lib/bootstrap/bootstrap-log";

describe("bootstrap-log", () => {
	it("maps vercel home to /vercel/sandbox", () => {
		expect(machineHomeForProvider("vercel")).toBe("/vercel/sandbox");
		expect(bootstrapLogPath("vercel")).toBe(
			"/vercel/sandbox/.agent-machines/logs/bootstrap.log",
		);
	});

	it("wraps phase commands with log markers", () => {
		const wrapped = wrapPhaseCommand(
			"install-hermes",
			"echo hello",
			"/tmp/bootstrap.log",
		);
		expect(wrapped).toContain("phase: install-hermes");
		expect(wrapped).toContain("echo hello");
		expect(wrapped).toContain("phase install-hermes exit");
	});
});

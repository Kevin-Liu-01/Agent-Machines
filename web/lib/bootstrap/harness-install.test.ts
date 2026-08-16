import { describe, expect, it } from "vitest";

import { idempotentHarnessInstallCommand } from "./runner";

describe("idempotentHarnessInstallCommand", () => {
	it("reuses an installed OpenClaw runtime during forced reconciliation", () => {
		const command = idempotentHarnessInstallCommand("openclaw", "/home/user");

		expect(command).toContain("command -v openclaw");
		expect(command).toContain("openclaw --version");
		expect(command).toContain("else");
		expect(command).toContain("openclaw@");
		expect(command).toContain(".agent-machines/pkgs/node_modules/.bin");
	});

	it("keeps Hermes installation idempotent too", () => {
		const command = idempotentHarnessInstallCommand("hermes", "/home/machine");

		expect(command).toContain("command -v hermes");
		expect(command).toContain("hermes --version");
		expect(command).toContain("else");
	});
});

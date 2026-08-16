import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getUserConfigCached: vi.fn(),
	getProvider: vi.fn(),
	exec: vi.fn(),
	execBackground: vi.fn(),
}));

vi.mock("@/lib/user-config/request-cache", () => ({
	getUserConfigCached: mocks.getUserConfigCached,
}));
vi.mock("@/lib/providers", () => ({
	getProvider: mocks.getProvider,
}));

import { execBackgroundOnMachine, execOnMachine } from "./exec";

describe("dashboard exec live-migration gate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getUserConfigCached.mockResolvedValue({
			providers: {},
			machines: [{ id: "machine-1", providerKind: "e2b" }],
			activeMachineId: "machine-1",
		});
		mocks.exec.mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 });
		mocks.execBackground.mockResolvedValue(undefined);
		mocks.getProvider.mockReturnValue({
			exec: mocks.exec,
			execBackground: mocks.execBackground,
		});
	});

	it("leases a foreground command before user work starts", async () => {
		await execOnMachine("echo foreground", { machineId: "machine-1", timeoutMs: 12_345 });
		const command = mocks.exec.mock.calls[0][1] as string;
		expect(command).toContain("AM_MIGRATION_DRAINING");
		expect(command).toContain('am_migration_lease="$am_migration_root/runs/');
		expect(command.indexOf("am_migration_lease=")).toBeLessThan(command.indexOf("echo foreground"));
	});

	it("keeps the lease inside a provider background command", async () => {
		await execBackgroundOnMachine("echo background", { machineId: "machine-1" });
		const command = mocks.execBackground.mock.calls[0][1] as string;
		expect(command).toContain("AM_MIGRATION_DRAINING");
		expect(command).toContain("trap am_release_migration_lease EXIT");
		expect(command).toContain("echo background");
	});
});

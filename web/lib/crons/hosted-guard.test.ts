import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type CronEntry, type MachineRef, type UserConfig } from "@/lib/user-config/schema";
const mocks = vi.hoisted(() => ({ config: vi.fn(), exec: vi.fn() }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: mocks.config, setOperationalUserConfigById: vi.fn() }));
vi.mock("@/lib/providers", () => ({ getProvider: () => ({ exec: mocks.exec }) }));
vi.mock("@/lib/storage/workspace-capture", () => ({
	beginWorkspaceCapture: async () => ({ available: false, warnings: [] }),
	finishWorkspaceCapture: async () => ({ artifacts: [], warnings: [] }),
}));
import { HostedWorkerRuntimeDriver } from "@/lib/control-plane/hosted-driver";

const schedule = { id: "schedule", enabled: true, machineId: "machine" } as CronEntry;
function config(crons = [schedule]): UserConfig { return { ...structuredClone(DEFAULT_USER_CONFIG), crons, aiProviderKeys: { anthropic: "fixture-key" }, machines: [{ id: "machine", agentKind: "claude-code", providerKind: "e2b", model: "claude-sonnet-4-6" } as MachineRef] }; }
const placement = { workerId: "worker", sandboxId: "machine", sandbox: "e2b" as const, runtime: "claude-code" as const };
beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); mocks.config.mockResolvedValue(config()); mocks.exec.mockResolvedValue({ stdout: '{"type":"result","result":"done","is_error":false}', stderr: "", exitCode: 0 }); });

describe("queued hosted schedule guard", () => {
	it.each([{ current: [] }, { current: [{ ...schedule, enabled: false }] }, { current: [{ ...schedule, machineId: "new-machine" }] }])("rechecks current permissions, not the cached enabled schedule", async ({ current }) => {
		mocks.config.mockResolvedValue(config(current));
		const driver = new HostedWorkerRuntimeDriver("tenant", config());
		await expect(driver.run(placement, "queued prompt", { scheduleId: "schedule", runKey: "queued" })).rejects.toThrow(/removed, disabled, or moved/);
		expect(mocks.exec).not.toHaveBeenCalled();
	});
	it("includes occurrence identity in the on-box run record", async () => {
		await new HostedWorkerRuntimeDriver("tenant", config()).run(placement, "run", { scheduleId: "schedule", runKey: "occurrence", scheduledFor: "2026-09-09T06:20:00Z" });
		const logCommand = mocks.exec.mock.calls.find((call) => call[1].includes("runs.jsonl"))![1] as string;
		const encoded = logCommand.match(/printf %s '([A-Za-z0-9+/=]+)'/)![1];
		expect(JSON.parse(Buffer.from(encoded, "base64").toString())).toMatchObject({ id: "schedule", runKey: "occurrence", scheduledFor: "2026-09-09T06:20:00Z", exitCode: 0 });
	});
	it("does not start an on-box log exec after its request deadline", async () => {
		const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		mocks.exec.mockImplementation(async () => {
			clock.mockReturnValue(1_300_000);
			return { stdout: '{"type":"result","result":"done","is_error":false}', stderr: "", exitCode: 0 };
		});
		const result = await new HostedWorkerRuntimeDriver("tenant", config(), { executionDeadlineMs: 1_260_000 }).run(placement, "run", { scheduleId: "schedule", runKey: "occurrence" });
		expect(mocks.exec).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ exitCode: 0, warnings: [expect.stringMatching(/log was skipped.*deadline/)] });
	});
	it("retains a successful paid result with an inspectable warning if its extra on-box log fails", async () => {
		mocks.exec.mockResolvedValueOnce({ stdout: '{"type":"result","result":"done","is_error":false}', stderr: "", exitCode: 0 }).mockRejectedValueOnce(new Error("Log storage failed"));
		const result = await new HostedWorkerRuntimeDriver("tenant", config()).run(placement, "run", { scheduleId: "schedule", runKey: "occurrence" });
		expect(result).toMatchObject({ exitCode: 0, warnings: [expect.stringMatching(/log could not be saved/)] });
		expect(mocks.exec).toHaveBeenCalledTimes(2);
	});
	it("records a runtime error as failure even when its shell process exited zero", async () => {
		mocks.exec.mockResolvedValueOnce({ stdout: '{"type":"result","result":"failed","is_error":true}', stderr: "", exitCode: 0 });
		await expect(new HostedWorkerRuntimeDriver("tenant", config()).run(placement, "run", { scheduleId: "schedule", runKey: "occurrence" })).rejects.toThrow(/exit 1/);
		const encoded = mocks.exec.mock.calls[1][1].match(/printf %s '([A-Za-z0-9+/=]+)'/)![1];
		expect(JSON.parse(Buffer.from(encoded, "base64").toString()).exitCode).toBe(1);
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type CronEntry, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ user: vi.fn(), config: vi.fn(), save: vi.fn(), operations: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.user }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config, setUserConfig: mocks.save }));
vi.mock("@/lib/control-plane/service", () => ({ createHostedControlPlane: () => ({ store: { listOperations: mocks.operations } }) }));
vi.mock("@/lib/control-plane/adopt-machine", () => ({ submitMachineIntent: vi.fn() }));
import { GET, POST } from "@/app/api/dashboard/crons/route";
import { PATCH, DELETE } from "@/app/api/dashboard/crons/[name]/route";

const cron: CronEntry = { id: "schedule", name: "Audit", schedule: "*/5 * * * *", prompt: "Check files", machineId: "machine", skills: [], enabled: true, createdAt: "2026-09-09T00:00:00Z", lastRunAt: "2026-09-09T00:05:00Z", lastStatus: "running", lastSummary: "dispatched" };
const ctx = { params: Promise.resolve({ name: "schedule" }) };
function request(body: unknown) { return new Request("https://agent-machines.test/api/dashboard/crons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => {
	vi.clearAllMocks();
	mocks.user.mockResolvedValue("tenant");
	mocks.config.mockResolvedValue({ ...structuredClone(DEFAULT_USER_CONFIG), crons: [cron], machines: [{ id: "machine", providerKind: "e2b" } as MachineRef] });
	mocks.operations.mockResolvedValue([]);
});

describe("hosted cron contracts", () => {
	it("projects a completed scheduled operation into visible status and inspectable run history", async () => {
		mocks.operations.mockResolvedValue([{ id: "run-1", workerId: "worker", createdAt: "2026-09-09T00:05:00Z", startedAt: "2026-09-09T00:05:01Z", finishedAt: "2026-09-09T00:05:15Z", status: "succeeded", payload: { type: "run", scheduleId: "schedule", scheduledFor: "2026-09-09T00:05:00Z" }, result: { text: "Audit complete: proof.txt exists", exitCode: 0 } }]);
		const response = await GET();
		const body = await response.json();
		expect(body.crons[0].lastStatus).toBe("success");
		expect(body.runs[0]).toMatchObject({ operationId: "run-1", scheduleId: "schedule", status: "success", output: "Audit complete: proof.txt exists" });
	});
	it.each([null, [], "not a body"])("rejects malformed create and edit bodies", async (body) => {
		expect((await POST(request(body))).status).toBe(400);
		expect((await PATCH(request(body), ctx)).status).toBe(400);
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it("rejects empty edited prompts rather than creating an unexecutable schedule", async () => {
		expect((await PATCH(request({ prompt: "   " }), ctx)).status).toBe(400);
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it("delete removes only the selected schedule and retains unrelated user data", async () => {
		mocks.config.mockResolvedValue({ ...structuredClone(DEFAULT_USER_CONFIG), crons: [cron, { ...cron, id: "other" }] });
		expect((await DELETE(request({}), ctx)).status).toBe(200);
		expect(mocks.save).toHaveBeenCalledWith({ crons: [expect.objectContaining({ id: "other" })] });
	});
});

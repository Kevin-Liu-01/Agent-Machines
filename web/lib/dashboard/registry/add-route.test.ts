import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG as DEFAULT_CONFIG } from "@/lib/user-config/schema";
import type { RegistryItem } from "./types";

const mocks = vi.hoisted(() => ({ user: vi.fn(), get: vi.fn(), set: vi.fn(), exec: vi.fn(), running: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.user }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.get, setUserConfig: mocks.set }));
vi.mock("@/lib/dashboard/exec", () => ({
	execOnMachine: mocks.exec, isMachineRunning: mocks.running,
	resolveMachine: (config: typeof DEFAULT_CONFIG, id: string) => config.machines.find((machine) => machine.id === id),
}));
import { POST } from "@/app/api/dashboard/registry/add/route";

const item: RegistryItem = { id: "qa-cli", name: "QA CLI", kind: "cli", description: "A test command", installCommand: "printf installed", source: "npm", provider: "QA", logoUrl: null, brand: null, stars: null, version: null, homepage: null, installed: false };
const config = () => ({ ...structuredClone(DEFAULT_CONFIG), activeMachineId: "other-machine", machines: [{ id: "chosen-worker", name: "Chosen", archived: false }, { id: "other-machine", name: "Other", archived: false }, { id: "archived-worker", archived: true }] });
function request(body: unknown) { return new Request("https://example.test/api/dashboard/registry/add", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => {
	vi.resetAllMocks(); mocks.user.mockResolvedValue("qa-user"); mocks.get.mockResolvedValue(config());
	mocks.set.mockImplementation(async (patch) => ({ ...config(), ...patch }));
	mocks.running.mockResolvedValue(true); mocks.exec.mockResolvedValue({ exitCode: 0, stdout: "done", stderr: "" });
});
it("rejects signed-out callers without reading configuration", async () => {
	mocks.user.mockResolvedValue(null);
	expect((await POST(request({ item }))).status).toBe(401);
	expect(mocks.get).not.toHaveBeenCalled();
});
it.each([null, {}, { item: { ...item, id: {} } }, { item: { ...item, kind: "bogus" } }, { item, install: "true" }, { item, machineId: {} }])("rejects malformed input %j", async (body) => {
	expect((await POST(request(body))).status).toBe(400);
	expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.exec).not.toHaveBeenCalled();
});
it("saving is config-only and never reports installed", async () => {
	const response = await POST(request({ item }));
	expect(await response.json()).toMatchObject({ ok: true, status: "saved", installOk: false, machineId: null });
	expect(mocks.exec).not.toHaveBeenCalled(); expect(mocks.running).not.toHaveBeenCalled();
});
it.each([undefined, "other-tenant-worker", "archived-worker"])("requires an explicit owned non-archived target: %s", async (machineId) => {
	expect((await POST(request({ item, install: true, machineId }))).status).toBe(400);
	expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.exec).not.toHaveBeenCalled();
});
it("pins the reviewed install to its chosen Worker, not account-active", async () => {
	const body = await (await POST(request({ item, install: true, machineId: "chosen-worker" }))).json();
	expect(body).toMatchObject({ status: "command_succeeded", installOk: true, machineId: "chosen-worker" });
	expect(body.installLog).toContain("have not been verified");
	expect(mocks.running).toHaveBeenCalledWith("chosen-worker");
	expect(mocks.exec).toHaveBeenCalledWith(item.installCommand, { machineId: "chosen-worker", timeoutMs: 120_000 });
});
it("retries an existing saved entry instead of pretending it was already installed", async () => {
	mocks.get.mockResolvedValue({ ...config(), customLoadout: [{ id: item.id, createdAt: "2026-01-01T00:00:00Z" }] });
	await POST(request({ item, install: true, machineId: "chosen-worker" }));
	expect(mocks.exec).toHaveBeenCalledTimes(1);
	expect(mocks.set.mock.calls[0][0].customLoadout).toHaveLength(1);
	expect(mocks.set.mock.calls[0][0].customLoadout[0].createdAt).toBe("2026-01-01T00:00:00Z");
});
it("offline means retry explicitly, not a fictitious queued wake install", async () => {
	mocks.running.mockResolvedValue(false);
	const body = await (await POST(request({ item, install: true, machineId: "chosen-worker" }))).json();
	expect(body).toMatchObject({ status: "machine_offline", installOk: false });
	expect(body.installLog).toContain("Nothing is queued"); expect(mocks.exec).not.toHaveBeenCalled();
});
it.each(["mcp", "plugin", "provider", "source"] as const)("does not run a %s launch command as an installer", async (kind) => {
	const body = await (await POST(request({ item: { ...item, kind }, install: true, machineId: "chosen-worker" }))).json();
	expect(body).toMatchObject({ status: "manual_setup", installOk: false }); expect(mocks.exec).not.toHaveBeenCalled();
});
it("does not run after failed configuration persistence", async () => {
	mocks.set.mockRejectedValue(new Error("storage unavailable"));
	expect((await POST(request({ item, install: true, machineId: "chosen-worker" }))).status).toBe(500);
	expect(mocks.exec).not.toHaveBeenCalled();
});
it("reports exit failure without undoing a saved entry and bounds logs", async () => {
	mocks.exec.mockResolvedValue({ exitCode: 7, stdout: "x".repeat(40_000), stderr: "failed" });
	const body = await (await POST(request({ item, install: true, machineId: "chosen-worker" }))).json();
	expect(body).toMatchObject({ ok: true, status: "failed", installOk: false });
	expect(body.installLog).toContain("exit 7"); expect(body.installLog).toContain("truncated"); expect(body.installLog.length).toBeLessThan(33_000);
});
it("reports thrown execution errors as retryable failure", async () => {
	mocks.exec.mockRejectedValue(new Error("Worker stopped"));
	expect(await (await POST(request({ item, install: true, machineId: "chosen-worker" }))).json()).toMatchObject({ ok: true, status: "failed", installOk: false });
});

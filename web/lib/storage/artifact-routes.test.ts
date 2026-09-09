import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), machine: vi.fn(), list: vi.fn(), load: vi.fn(), remove: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.user }));
vi.mock("@/lib/storage/machine-fs", () => ({ withActiveMachine: mocks.machine }));
vi.mock("@/lib/storage/machine-artifacts", () => ({ listArtifactInventory: mocks.list, loadArtifactBytes: mocks.load, deleteArtifact: mocks.remove, saveArtifact: mocks.save }));
import { GET as list } from "@/app/api/dashboard/artifacts/route";
import { GET as download } from "@/app/api/dashboard/artifacts/[id]/download/route";
import { DELETE as remove } from "@/app/api/dashboard/artifacts/[id]/route";
const storage = { machineId: "viewed", appDataRoot: "/home/user/.agent-machines" };
const ctx = { params: Promise.resolve({ id: "file" }) };
const request = () => new Request("https://example.test/api/dashboard/artifacts/file?machineId=viewed");
beforeEach(() => {
	vi.resetAllMocks(); mocks.user.mockResolvedValue("tenant");
	mocks.machine.mockResolvedValue({ machine: { id: "viewed" }, storage });
	mocks.list.mockResolvedValue({ artifacts: [], warnings: ["Some files could not be listed."] });
	mocks.load.mockResolvedValue({ ref: { name: "output.html", mime: "text/html", bytes: 1000 }, bytes: Buffer.from("<script>alert(1)</script>") });
});
describe("artifact route boundaries", () => {
	it("uses the explicitly viewed machine for every action", async () => {
		await list(request()); await download(request(), ctx); await remove(request(), ctx);
		expect(mocks.machine.mock.calls).toEqual([["viewed"], ["viewed"], ["viewed"]]);
		expect(mocks.load).toHaveBeenCalledWith("file", storage);
		expect(mocks.remove).toHaveBeenCalledWith("file", storage);
	});
	it("keeps generated HTML passive and sends the actual byte length", async () => {
		const response = await download(request(), ctx);
		expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
		expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
		expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(Number(response.headers.get("Content-Length"))).toBe((await response.text()).length);
	});
	it("returns inventory coverage warnings", async () => {
		expect(await (await list(request())).json()).toMatchObject({ ok: true, machineId: "viewed", warnings: ["Some files could not be listed."] });
	});
	it("never touches a machine without authentication", async () => {
		mocks.user.mockResolvedValue(null);
		expect((await list(request())).status).toBe(401);
		expect((await download(request(), ctx)).status).toBe(401);
		expect((await remove(request(), ctx)).status).toBe(401);
		expect(mocks.machine).not.toHaveBeenCalled();
	});
	it("does not fall back when the requested machine is unavailable", async () => {
		mocks.machine.mockResolvedValue({ ok: false, reason: "no_active_machine" });
		await list(request()); await download(request(), ctx); await remove(request(), ctx);
		expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
	});
});

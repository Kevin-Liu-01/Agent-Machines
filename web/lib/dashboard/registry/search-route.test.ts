import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), config: vi.fn(), running: vi.fn(), exec: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.user }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config }));
vi.mock("@/lib/dashboard/exec", () => ({ isMachineRunning: mocks.running, execOnMachine: mocks.exec,
	resolveMachine: (config: { machines: { id: string }[]; activeMachineId: string }, id?: string) =>
		config.machines.find((machine) => machine.id === (id || config.activeMachineId)) ?? null,
}));
import { GET } from "@/app/api/dashboard/registry/search/route";
import { cursorPluginsAdapter } from "./cursor-plugins";

const config = (id: string) => ({ machines: [{ id }], activeMachineId: id, customLoadout: [] });
const request = (machineId = "a") => new Request(`https://example.org/api/dashboard/registry/search?source=cursor-plugins&q=private-&machineId=${machineId}`);
beforeEach(() => {
	vi.resetAllMocks(); mocks.user.mockResolvedValue("tenant"); mocks.config.mockResolvedValue(config("a"));
	mocks.running.mockResolvedValue(true);
	mocks.exec.mockImplementation((_command, options) => Promise.resolve({ exitCode: 0, stdout: `vendor/private-${options.machineId}\t1\tConfidential machine ${options.machineId}`, stderr: "" }));
});
describe("registry search tenant boundary", () => {
	it("keeps overlapping authorized machine scans request-local", async () => {
		mocks.config.mockResolvedValueOnce(config("a")).mockResolvedValueOnce(config("b"));
		const [a, b] = await Promise.all([GET(request("a")), GET(request("b"))]);
		expect((await a.json()).items.map((item: { name: string }) => item.name)).toEqual(["private-a"]);
		expect((await b.json()).items.map((item: { name: string }) => item.name)).toEqual(["private-b"]);
		expect(mocks.running.mock.calls).toEqual([["a"], ["b"]]);
		expect(mocks.exec.mock.calls.map((call) => call[1].machineId)).toEqual(["a", "b"]);
		expect(await cursorPluginsAdapter.search({ query: "private-" })).toEqual([]);
		expect(a.headers.get("cache-control")).toBe("private, no-store");
	});
	it("never scans a machine outside the caller's account or silently falls back", async () => {
		const response = await GET(request("foreign"));
		expect(response.status).toBe(200); expect((await response.json()).items).toEqual([]);
		expect(mocks.running).not.toHaveBeenCalled(); expect(mocks.exec).not.toHaveBeenCalled();
	});
	it("never returns a previous scan when the next user's machine is offline", async () => {
		await GET(request()); mocks.config.mockResolvedValue(config("b")); mocks.running.mockResolvedValue(false);
		const response = await GET(request("b"));
		expect((await response.json()).items).toEqual([]); expect(mocks.exec).toHaveBeenCalledTimes(1);
	});
	it("does not touch config or machines before authentication", async () => {
		mocks.user.mockResolvedValue(null);
		expect((await GET(request())).status).toBe(401);
		expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.exec).not.toHaveBeenCalled();
	});
});

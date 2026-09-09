import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_USER_CONFIG, INITIAL_BOOTSTRAP_STATE, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	identity: vi.fn(), config: vi.fn(), exec: vi.fn(), running: vi.fn(),
}));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.identity }));
vi.mock("@/lib/user-config/request-cache", () => ({ getUserConfigCached: mocks.config }));
vi.mock("@/lib/dashboard/exec", async (importOriginal) => ({
	...await importOriginal<typeof import("@/lib/dashboard/exec")>(),
	execOnMachine: mocks.exec,
	isMachineRunning: mocks.running,
}));

import { GET } from "@/app/api/dashboard/sessions/route";

const machine: MachineRef = {
	id: "owned-machine", providerKind: "e2b", agentKind: "claude-code", name: "Researcher",
	spec: { vcpu: 2, memoryMib: 2048, storageGib: 10 }, model: "claude-sonnet-4-6",
	agentProfileId: null, gatewayProfileId: null, environmentProfileId: null, bootstrapPresetId: null,
	createdAt: "2026-09-08T00:00:00Z", apiUrl: null, apiKey: null,
	bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" },
};
const sessionId = "a".repeat(64);

function request(params = "") {
	return new Request(`https://example.invalid/api/dashboard/sessions${params ? `?${params}` : ""}`);
}
function result(data: unknown) {
	return { stdout: JSON.stringify(data), stderr: "", exitCode: 0 };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.identity.mockResolvedValue("user-1");
	mocks.config.mockResolvedValue({ ...structuredClone(DEFAULT_USER_CONFIG), machines: [machine], activeMachineId: machine.id });
	mocks.running.mockResolvedValue(true);
	mocks.exec.mockResolvedValue(result({ sessions: [], totalSessions: 0, totalBytes: 0, dbPath: "Native histories", warnings: [] }));
});

describe("owned-machine Sessions API", () => {
	it("requires authentication before resolving machine credentials", async () => {
		mocks.identity.mockResolvedValue(null);
		expect((await GET(request())).status).toBe(401);
		expect(mocks.config).not.toHaveBeenCalled();
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it("rejects other tenants' machine IDs without a provider probe or execution", async () => {
		const response = await GET(request("machineId=another-users-machine"));
		expect(response.status).toBe(404);
		expect(mocks.running).not.toHaveBeenCalled();
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it("pins both the state probe and read to the resolved active machine", async () => {
		const response = await GET(request());
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(mocks.running).toHaveBeenCalledWith(machine.id);
		expect(mocks.exec).toHaveBeenCalledWith(expect.any(String), { machineId: machine.id, timeoutMs: 20_000 });
		expect(await response.json()).toMatchObject({ ok: true, data: { sessions: [], totalSessions: 0 } });
	});

	it("does not wake or invoke a sleeping machine", async () => {
		mocks.running.mockResolvedValue(false);
		const response = await GET(request(`machineId=${machine.id}`));
		expect(await response.json()).toMatchObject({ ok: false, reason: "machine_offline" });
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it.each(["../../.env", "'; cat ~/.env #", "", "0".repeat(65)])("rejects invalid session IDs before execution: %s", async (id) => {
		const response = await GET(request(`sessionId=${encodeURIComponent(id)}`));
		expect(response.status).toBe(400);
		expect(mocks.exec).not.toHaveBeenCalled();
	});

	it("returns the actual normalized transcript without fabricating a successful empty result", async () => {
		const data = { session: { id: sessionId, runtime: "claude-code", source: "~/.claude/projects/work/session.jsonl" }, messages: [{ role: "assistant", text: "Research complete.", at: null }], truncated: false, warnings: [] };
		mocks.exec.mockResolvedValue(result(data));
		const response = await GET(request(`machineId=${machine.id}&sessionId=${sessionId}`));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, data });
	});

	it("returns 404 for a valid opaque ID not found in this machine's inventory", async () => {
		mocks.exec.mockResolvedValue(result({ error: "session_not_found" }));
		const response = await GET(request(`sessionId=${sessionId}`));
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ error: expect.stringContaining("no longer exists") });
	});

	it.each([
		{ stdout: "", stderr: "python3: not found", exitCode: 127 },
		result({ error: "history_read_failed", message: "Database is locked." }),
		{ stdout: "not JSON", stderr: "", exitCode: 0 },
		result({}),
	])("surfaces command and parse failures instead of claiming zero sessions", async (execution) => {
		mocks.exec.mockResolvedValue(execution);
		const response = await GET(request());
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ ok: false, reason: "exec_failed" });
	});
});

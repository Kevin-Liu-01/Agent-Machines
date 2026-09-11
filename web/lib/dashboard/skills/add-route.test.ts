import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ user: vi.fn(), get: vi.fn(), set: vi.fn(), running: vi.fn(), exec: vi.fn(), resolve: vi.fn(), shell: vi.fn() }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.user }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.get, setUserConfig: mocks.set }));
vi.mock("@/lib/dashboard/exec", () => ({ execOnMachine: mocks.exec, isMachineRunning: mocks.running }));
vi.mock("@/lib/dashboard/skills/custom-skill", () => ({
	resolveSkillInput: mocks.resolve, buildInstallSkillShell: mocks.shell,
	customSkillId: (slug: string) => `custom-skill:custom/${slug}`,
	customSkillPath: (slug: string) => `~/.agent-machines/skills/custom/${slug}/SKILL.md`,
}));
import { POST } from "@/app/api/dashboard/skills/add/route";

const content = "# Test-only instructions that must not be mistaken for saved account metadata";
function request(body = { mode: "paste", content }) { return new Request("https://example.invalid/api/dashboard/skills/add", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => {
	vi.resetAllMocks();
	mocks.user.mockResolvedValue("test-user");
	mocks.get.mockResolvedValue(structuredClone(DEFAULT_USER_CONFIG));
	mocks.set.mockImplementation(async (patch) => ({ ...structuredClone(DEFAULT_USER_CONFIG), ...patch }));
	mocks.resolve.mockResolvedValue({ slug: "test-skill", name: "Test skill", description: "Test metadata", sourceUrl: null, content });
	mocks.shell.mockReturnValue("test-only-install-command");
	mocks.running.mockResolvedValue(true);
	mocks.exec.mockResolvedValue({ exitCode: 0, stdout: "installed", stderr: "" });
});

describe("custom skill save-versus-install response", () => {
	it("preserves authentication and never resolves or saves for signed-out requests", async () => {
		mocks.user.mockResolvedValue(null);
		expect((await POST(request())).status).toBe(401);
		expect(mocks.resolve).not.toHaveBeenCalled();
		expect(mocks.set).not.toHaveBeenCalled();
		expect(mocks.exec).not.toHaveBeenCalled();
	});
	it("reports metadata-only persistence without an automatic wake-install promise", async () => {
		mocks.running.mockResolvedValue(false);
		const result = await (await POST(request())).json();
		expect(result).toMatchObject({ ok: true, installOk: false });
		expect(result.installLog).toContain("Skill metadata saved");
		expect(result.installLog).toContain("Pasted instructions are not stored in account settings");
		expect(result.installLog).toContain("Nothing is queued for automatic installation");
		expect(result.installLog).not.toMatch(/will install|next wake|ask the agent to sync/i);
		expect(mocks.set).toHaveBeenCalledOnce();
		expect(JSON.stringify(mocks.set.mock.calls[0][0])).not.toContain(content);
		expect(mocks.exec).not.toHaveBeenCalled();
	});
	it("reports success only when the installation command succeeds", async () => {
		const result = await (await POST(request())).json();
		expect(result).toMatchObject({ ok: true, installOk: true });
		expect(mocks.shell).toHaveBeenCalledWith("test-skill", content);
		expect(mocks.exec).toHaveBeenCalledWith("test-only-install-command", { machineId: undefined, timeoutMs: 60_000 });
		expect(mocks.set.mock.invocationCallOrder[0]).toBeLessThan(mocks.exec.mock.invocationCallOrder[0]);
	});
	it.each(["exit", "throw"])("keeps saved metadata distinct from an installation %s failure", async (failure) => {
		if (failure === "exit") mocks.exec.mockResolvedValue({ exitCode: 7, stdout: "", stderr: "Test install failed" });
		else mocks.exec.mockRejectedValue(new Error("Test machine unavailable"));
		const result = await (await POST(request())).json();
		expect(result).toMatchObject({ ok: true, installOk: false });
		expect(mocks.set).toHaveBeenCalledOnce();
		expect(result.installLog).toContain(failure === "exit" ? "Test install failed" : "Test machine unavailable");
	});
});

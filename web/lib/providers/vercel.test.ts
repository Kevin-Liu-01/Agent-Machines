import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MachineProviderError } from "./types";
import { VercelProvider } from "./vercel";

const mockGetOrCreate = vi.fn();
const mockGet = vi.fn();
const mockList = vi.fn();

vi.mock("@vercel/sandbox", () => ({
	Sandbox: {
		getOrCreate: (...args: unknown[]) => mockGetOrCreate(...args),
		get: (...args: unknown[]) => mockGet(...args),
		list: (...args: unknown[]) => mockList(...args),
	},
}));

function makeSandbox(overrides: Record<string, unknown> = {}) {
	return {
		name: "am-test-sandbox",
		status: "running",
		vcpus: 2,
		memory: 4096,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		stop: vi.fn().mockResolvedValue({}),
		delete: vi.fn().mockResolvedValue(undefined),
		domain: vi.fn().mockReturnValue("https://8642-sbx.vercel.run"),
		runCommand: vi.fn().mockResolvedValue({
			stdout: vi.fn().mockResolvedValue("hello\n"),
			stderr: vi.fn().mockResolvedValue(""),
			exitCode: 0,
		}),
		...overrides,
	};
}

const TEST_CREDS = {
	token: "test-token",
	teamId: "team_test",
	projectId: "prj_test",
};

describe("VercelProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.VERCEL_OIDC_TOKEN;
		delete process.env.VERCEL_TOKEN;
		delete process.env.VERCEL_TEAM_ID;
		delete process.env.VERCEL_PROJECT_ID;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("requires credentials when neither explicit creds nor OIDC env exist", () => {
		expect(() => new VercelProvider(null)).toThrow(MachineProviderError);
	});

	it("accepts OIDC-only credentials from environment", () => {
		process.env.VERCEL_OIDC_TOKEN = "oidc-token";
		const provider = new VercelProvider(null);
		expect(provider.hasCredentials).toBe(true);
	});

	it("provisions a persistent named sandbox with gateway ports", async () => {
		const sandbox = makeSandbox();
		mockGetOrCreate.mockResolvedValue(sandbox);

		const provider = new VercelProvider(TEST_CREDS);
		const result = await provider.provision({
			spec: { vcpu: 2, memoryMib: 4096, storageGib: 10 },
			name: "my-agent",
			agentKind: "hermes",
			model: "anthropic/claude-opus-4-7",
		});

		expect(result.id).toBe("am-test-sandbox");
		expect(result.state).toBe("ready");
		expect(mockGetOrCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "my-agent",
				persistent: true,
				runtime: "node24",
				resources: { vcpus: 2 },
				ports: [8642, 18789],
				tags: expect.objectContaining({ "agent-machines": "true" }),
			}),
		);
	});

	it("maps stopped sandbox status to sleeping", async () => {
		mockGet.mockResolvedValue(
			makeSandbox({ status: "stopped" }),
		);

		const provider = new VercelProvider(TEST_CREDS);
		const summary = await provider.state("am-test-sandbox");

		expect(summary.state).toBe("sleeping");
		expect(summary.rawPhase).toBe("stopped");
	});

	it("exec returns stdout/stderr/exitCode", async () => {
		mockGet.mockResolvedValue(makeSandbox());

		const provider = new VercelProvider(TEST_CREDS);
		const result = await provider.exec("am-test-sandbox", "echo hello");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("hello\n");
	});

	it("sleep stops the sandbox session", async () => {
		const sandbox = makeSandbox({ status: "running" });
		mockGet
			.mockResolvedValueOnce(sandbox)
			.mockResolvedValueOnce(makeSandbox({ status: "stopped" }));

		const provider = new VercelProvider(TEST_CREDS);
		const summary = await provider.sleep("am-test-sandbox");

		expect(sandbox.stop).toHaveBeenCalled();
		expect(summary.state).toBe("sleeping");
	});

	it("destroy deletes the sandbox", async () => {
		const sandbox = makeSandbox();
		mockGet.mockResolvedValue(sandbox);

		const provider = new VercelProvider(TEST_CREDS);
		await provider.destroy("am-test-sandbox");

		expect(sandbox.delete).toHaveBeenCalled();
	});

	it("getPublicUrl returns sandbox.domain for exposed port", async () => {
		mockGet.mockResolvedValue(makeSandbox());

		const provider = new VercelProvider(TEST_CREDS);
		const url = await provider.getPublicUrl("am-test-sandbox", 8642);

		expect(url).toBe("https://8642-sbx.vercel.run");
	});

	it("reports persistent-machine capabilities", () => {
		const provider = new VercelProvider(TEST_CREDS);
		expect(provider.capabilities).toMatchObject({
			runtime: "persistent-machine",
			canWake: true,
			canSleep: true,
			hasPersistentDisk: true,
		});
	});
});

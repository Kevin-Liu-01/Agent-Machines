import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onboardingProviderReady, submitOnboardingLaunch, type OnboardingLaunch } from "./launch";

const fetchMock = vi.fn<typeof fetch>();
const input = {
	setup: { draftAgentKind: "codex" },
	presetId: "coding-agent",
	agentKind: "codex" as const,
	providerKind: "e2b" as const,
	gatewayProfileId: "vercel-ai-gateway",
};
const response = (body: unknown, status = 200) => Response.json(body, { status });

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("onboarding provider readiness", () => {
	it("requires token, team, and project for a new Vercel credential", () => {
		expect(onboardingProviderReady("vercel", false, "token", {})).toBe(false);
		expect(onboardingProviderReady("vercel", false, "token", { teamId: "team" })).toBe(false);
		expect(onboardingProviderReady("vercel", false, "token", { teamId: "team", projectId: " " })).toBe(false);
		expect(onboardingProviderReady("vercel", false, "token", { teamId: "team", projectId: "project" })).toBe(true);
	});
	it("allows existing credentials but validates a token replacement", () => {
		expect(onboardingProviderReady("vercel", true, "", {})).toBe(true);
		expect(onboardingProviderReady("vercel", true, "replacement", {})).toBe(false);
		expect(onboardingProviderReady("e2b", false, "new-key", {})).toBe(true);
		expect(onboardingProviderReady("sprites", false, " ", {})).toBe(false);
	});
});

describe("onboarding launch recovery", () => {
	it("saves the recipe before one idempotent provisioning request", async () => {
		const launch: OnboardingLaunch = { workerId: "worker-1", operationId: null };
		fetchMock
			.mockResolvedValueOnce(response({ ok: true }))
			.mockResolvedValueOnce(response({ workerId: launch.workerId }))
			.mockResolvedValueOnce(response({ operation: { id: "op-1", status: "queued" } }, 202))
			.mockResolvedValueOnce(response({ operation: { id: "op-1", status: "running" } }));
		expect(await submitOnboardingLaunch(launch, input)).toBe("op-1");
		expect(launch.operationId).toBe("op-1");
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"/api/dashboard/admin/setup",
			"/api/dashboard/admin/apply-preset",
			"/api/dashboard/admin/provision-machine",
			"/api/dashboard/control-plane/operations/op-1",
		]);
		expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toMatchObject({ workerId: "worker-1", presetId: "coding-agent" });
		expect(fetchMock.mock.calls[2][1]!.headers).toMatchObject({ "Idempotency-Key": "onboarding:worker-1" });
	});

	it("reconnects to a pending operation without creating another worker or sandbox", async () => {
		const launch: OnboardingLaunch = { workerId: "worker-1", operationId: "op-1" };
		fetchMock
			.mockResolvedValueOnce(response({ ok: true }))
			.mockResolvedValueOnce(response({ operation: { id: "op-1", status: "running" } }));
		expect(await submitOnboardingLaunch(launch, input)).toBe("op-1");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("uses the journal retry endpoint only after confirming failure", async () => {
		const launch: OnboardingLaunch = { workerId: "worker-1", operationId: "op-1" };
		fetchMock
			.mockResolvedValueOnce(response({ ok: true }))
			.mockResolvedValueOnce(response({ operation: { id: "op-1", status: "failed" } }))
			.mockResolvedValueOnce(response({ operation: { id: "op-2" } }, 202));
		expect(await submitOnboardingLaunch(launch, input)).toBe("op-2");
		expect(launch.operationId).toBe("op-2");
		expect(fetchMock.mock.calls[2]).toEqual([
			"/api/dashboard/control-plane/operations/op-1",
			{ method: "POST", headers: { "Content-Type": "application/json" } },
		]);
	});

	it("retains the operation when observation fails, then reconnects on retry", async () => {
		const launch: OnboardingLaunch = { workerId: "worker-1", operationId: "op-1" };
		fetchMock
			.mockResolvedValueOnce(response({ ok: true }))
			.mockRejectedValueOnce(new Error("network interrupted"));
		await expect(submitOnboardingLaunch(launch, input)).rejects.toThrow("network interrupted");
		expect(launch.operationId).toBe("op-1");
		fetchMock
			.mockResolvedValueOnce(response({ ok: true }))
			.mockResolvedValueOnce(response({ operation: { id: "op-1", status: "succeeded" } }));
		expect(await submitOnboardingLaunch(launch, input)).toBe("op-1");
		expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("provision"))).toHaveLength(0);
	});

	it("reuses the Worker and idempotency key when a provisioning response is lost", async () => {
		const launch: OnboardingLaunch = { workerId: "worker-1", operationId: null };
		fetchMock
			.mockResolvedValueOnce(response({ ok: true }))
			.mockResolvedValueOnce(response({ workerId: "worker-1" }))
			.mockRejectedValueOnce(new Error("response lost"));
		await expect(submitOnboardingLaunch(launch, input)).rejects.toThrow("response lost");
		fetchMock
			.mockResolvedValueOnce(response({ ok: true }))
			.mockResolvedValueOnce(response({ workerId: "worker-1" }))
			.mockResolvedValueOnce(response({ operation: { id: "op-1", status: "running" } }, 202))
			.mockResolvedValueOnce(response({ operation: { id: "op-1", status: "running" } }));
		await submitOnboardingLaunch(launch, input);
		expect(fetchMock.mock.calls[2][1]).toEqual(fetchMock.mock.calls[5][1]);
	});

	it("shows a useful status error if setup returns a non-JSON error page", async () => {
		fetchMock.mockResolvedValueOnce(new Response("upstream failed", { status: 502 }));
		await expect(submitOnboardingLaunch({ workerId: "worker-1", operationId: null }, input)).rejects.toThrow("HTTP 502");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

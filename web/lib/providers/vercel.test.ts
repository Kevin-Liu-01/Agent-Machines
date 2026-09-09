/**
 * Vercel binding gates, run against the REAL mux provider (no vendor SDK is
 * touched by any of these paths: construction, ready() and capabilities are
 * pure). The vendor-interaction coverage that used to live here moved to two
 * places in the swap: bindings.test.ts proves the binding's wiring against a
 * fake mux provider, and src/mux/providers/conformance.test.ts proves the mux
 * adapter itself never resumes on describe/remove/park.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { MachineProviderError } from "./types";
import { VercelProvider } from "./vercel";

const TEST_CREDS = {
	token: "test-token",
	teamId: "team_test",
	projectId: "prj_test",
};

describe("VercelProvider credential gates", () => {
	beforeEach(() => {
		delete process.env.VERCEL_OIDC_TOKEN;
		delete process.env.VERCEL_TOKEN;
		delete process.env.VERCEL_TEAM_ID;
		delete process.env.VERCEL_PROJECT_ID;
	});

	it("requires credentials when neither explicit creds nor OIDC env exist", () => {
		expect(() => new VercelProvider(null)).toThrow(MachineProviderError);
	});

	it("rejects deployment OIDC for tenants without their own credentials", () => {
		process.env.VERCEL_OIDC_TOKEN = "oidc-token";
		expect(() => new VercelProvider(null)).toThrow(MachineProviderError);
		delete process.env.VERCEL_OIDC_TOKEN;
	});

	it("accepts deployment OIDC only with the server-resolved owner marker", () => {
		process.env.VERCEL_OIDC_TOKEN = "oidc-token";
		const provider = new VercelProvider({ token: "", teamId: "", projectId: "", allowDeploymentCredentials: true });
		expect(provider.hasCredentials).toBe(true);
		delete process.env.VERCEL_OIDC_TOKEN;
	});

	it("rejects the host's env triple when the tenant has not connected Vercel", () => {
		process.env.VERCEL_TOKEN = "host-token";
		process.env.VERCEL_TEAM_ID = "host-team";
		process.env.VERCEL_PROJECT_ID = "host-project";
		expect(() => new VercelProvider(null)).toThrow(MachineProviderError);
		expect(() => new VercelProvider({ token: "tenant-token", teamId: "", projectId: "" })).toThrow(MachineProviderError);
	});

	it("reports a full triple as credentialed", () => {
		expect(new VercelProvider(TEST_CREDS).hasCredentials).toBe(true);
	});

	it("rejects a vck_ AI-Gateway key by name instead of failing at first use", () => {
		// New with the mux swap: a vck_ token is Vercel AI Gateway auth, not
		// Sandbox auth. The construction gate passes (a triple exists) but
		// ready() names the problem, so hasCredentials fails closed here rather
		// than as a confusing vendor 401 mid-provision.
		const provider = new VercelProvider({ ...TEST_CREDS, token: "vck_nope" });
		expect(provider.hasCredentials).toBe(false);
	});

	it("reports persistent-machine capabilities", () => {
		expect(new VercelProvider(TEST_CREDS).capabilities).toMatchObject({
			runtime: "persistent-machine",
			canWake: true,
			canSleep: true,
			hasPersistentDisk: true,
		});
	});
});

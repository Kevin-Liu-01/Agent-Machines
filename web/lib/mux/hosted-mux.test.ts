/**
 * The hosted mux installer: tenant scoping and credential mapping.
 *
 * The property under test is the one that made this file necessary at all --
 * `setPlacementStore()` is a module singleton, so the obvious install ("set the
 * global to this user's store, then run their operation") races concurrent
 * requests in one serverless process. These tests assert the global is never
 * touched and that two users' muxes cannot see each other's placements.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	Mux: vi.fn(),
	createSupabasePlacementStore: vi.fn((tenantId: string) => ({
		kind: "supabase-fake",
		tenantId,
	})),
	setPlacementStore: vi.fn(),
}));

vi.mock("agent-machines/mux", () => ({
	Mux: mocks.Mux,
	// Exported by the real module; a test that let this through to the real
	// singleton would be asserting nothing about scoping.
	setPlacementStore: mocks.setPlacementStore,
}));
vi.mock("@/lib/mux/placement-store", () => ({
	createSupabasePlacementStore: mocks.createSupabasePlacementStore,
}));

import { createHostedMux, muxConfigForUser } from "./hosted-mux";
import type { UserConfig } from "@/lib/user-config/schema";

function config(providers: Partial<UserConfig["providers"]> = {}): UserConfig {
	return {
		providers,
		machines: [],
	} as unknown as UserConfig;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.Mux.mockImplementation(function (_config, options) { return { options }; });
});
afterEach(() => vi.unstubAllEnvs());

describe("createHostedMux", () => {
	it("passes a tenant-scoped store per instance and NEVER sets the global", () => {
		createHostedMux("user-alpha", config({ e2b: { apiKey: "k" } }));
		const [, options] = mocks.Mux.mock.calls[0];
		expect(options.placementStore).toEqual({
			kind: "supabase-fake",
			tenantId: "user-alpha",
		});
		// The whole reason this module exists: the process-global store is a
		// cross-tenant hazard under concurrency, so it must stay untouched.
		expect(mocks.setPlacementStore).not.toHaveBeenCalled();
	});

	it("gives two users two stores, so concurrent requests cannot cross", () => {
		createHostedMux("user-alpha", config({ e2b: { apiKey: "k" } }));
		createHostedMux("user-beta", config({ e2b: { apiKey: "k" } }));
		const tenants = mocks.Mux.mock.calls.map(
			([, options]) => options.placementStore.tenantId,
		);
		expect(tenants).toEqual(["user-alpha", "user-beta"]);
		expect(mocks.setPlacementStore).not.toHaveBeenCalled();
	});

	it("refuses an empty userId instead of building an unscoped mux", () => {
		for (const bad of ["", "   "]) {
			expect(() => createHostedMux(bad, config())).toThrow(/non-empty userId/);
		}
		expect(mocks.Mux).not.toHaveBeenCalled();
	});

	it("persists health, and only ever into the tenant's own store", () => {
		createHostedMux("user-alpha", config({ e2b: { apiKey: "k" } }));
		const [, options] = mocks.Mux.mock.calls[0];
		// The breaker row is per tenant (migration 006's kind='health' row), so a
		// sample can only reach the store handed to THIS instance. It used to be
		// false on the grounds that no hosted breaker table existed; it does.
		expect(options.persistHealth).toBe(true);
		expect(options.placementStore.tenantId).toBe("user-alpha");
		// The saving property: the router writes health through the instance
		// store, so persistence cannot leak across tenants via the global.
		expect(mocks.setPlacementStore).not.toHaveBeenCalled();
	});
});

describe("muxConfigForUser", () => {
	it("re-spells stored credentials into the mux's vocabulary", () => {
		const input = muxConfigForUser(
			config({
				e2b: { apiKey: "e2b-key" },
				// user config says apiKey; the mux says token
				sprites: { apiKey: "sprites-key" },
				daytona: { apiKey: "daytona-key", apiUrl: "https://app.daytona.io/api", target: "us" },
			}),
		);
		expect(input.providers).toEqual({
			e2b: { apiKey: "e2b-key" },
			sprites: { token: "sprites-key" },
			daytona: { apiKey: "daytona-key", apiUrl: "https://app.daytona.io/api", target: "us" },
		});
	});

	it("omits a lane the user has no credential for, rather than sending empties", () => {
		const input = muxConfigForUser(config({ e2b: { apiKey: "k" } }));
		expect(Object.keys(input.providers ?? {})).toEqual(["e2b"]);
	});

	it("opens on a CREDENTIALED primary, not a fixed default", () => {
		// e2b is first in DEFAULT_ROUTE_ORDER; with only sprites credentialed the
		// primary must be sprites, or every hosted create would open against a
		// lane the user cannot authenticate against.
		const input = muxConfigForUser(config({ sprites: { apiKey: "k" } }));
		expect(input.sandboxes?.primary).toBe("sprites");
		expect(input.sandboxes?.backups).not.toContain("sprites");
	});

	it("falls back to the default order when nothing is credentialed", () => {
		// Fail closed happens downstream (the mux's ready() gate names the
		// missing keys); an empty sandboxes block would instead throw a config
		// error that says nothing useful.
		const input = muxConfigForUser(config());
		expect(input.sandboxes?.primary).toBe("e2b");
		expect(input.sandboxes?.backups?.length).toBeGreaterThan(0);
	});

	it("omits vercel unless a token is stored, and carries the whole triple", () => {
		expect(muxConfigForUser(config()).providers?.vercel).toBeUndefined();
		const input = muxConfigForUser(
			config({ vercel: { token: "t", teamId: "team", projectId: "proj" } }),
		);
		expect(input.providers?.vercel).toEqual({
			token: "t",
			teamId: "team",
			projectId: "proj",
		});
	});

	it("does not inherit deployment credentials through the real SDK constructor", async () => {
		vi.stubEnv("E2B_API_KEY", "host-e2b");
		vi.stubEnv("ANTHROPIC_API_KEY", "host-anthropic");
		vi.stubEnv("VERCEL_OIDC_TOKEN", "host-oidc");
		const { Mux } = await vi.importActual<typeof import("agent-machines/mux")>("agent-machines/mux");
		const resolved = muxConfigForUser(config());
		const mux = new Mux(resolved, { persistHealth: false, selection: null });
		expect(mux.provider("e2b").ready().ok).toBe(false);
		expect(mux.provider("vercel").ready().ok).toBe(false);
		expect(resolved.keys.anthropic).toBeUndefined();
		expect(JSON.stringify(resolved)).not.toContain("host-");
	});

	it("treats user credential values as literal strings rather than env references", () => {
		vi.stubEnv("E2B_API_KEY", "host-e2b");
		const input = muxConfigForUser({
			...config({ e2b: { apiKey: "env:E2B_API_KEY" } }),
			aiProviderKeys: { anthropic: "env:ANTHROPIC_API_KEY" },
		});
		expect(input.providers.e2b?.apiKey).toBe("env:E2B_API_KEY");
		expect(input.keys.anthropic).toBe("env:ANTHROPIC_API_KEY");
	});
});

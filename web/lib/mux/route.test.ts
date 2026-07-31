import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE_ORDER, resolveRoute, nativePtyLanes } from "@/lib/mux/route";
import type { UserConfig } from "@/lib/user-config/schema";

/**
 * Deliberately loose: stored configs predate schema tightening and can
 * carry a partial vercel credential set, which is exactly the case
 * resolveRoute has to report on.
 */
type LooseProviders = {
	e2b?: { apiKey?: string };
	sprites?: { apiKey?: string };
	vercel?: { token?: string; teamId?: string; projectId?: string };
	dedalus?: { apiKey?: string };
};

function configWith(providers: LooseProviders): UserConfig {
	return { providers } as unknown as UserConfig;
}

describe("resolveRoute", () => {
	it("drops every lane when nothing is configured", () => {
		const { route, skipped } = resolveRoute(configWith({}));
		expect(route).toEqual([]);
		expect(skipped.map((entry) => entry.substrate)).toEqual([
			...DEFAULT_ROUTE_ORDER,
		]);
	});

	it("keeps credentialed lanes in preference order", () => {
		const { route, skipped } = resolveRoute(
			configWith({
				e2b: { apiKey: "e2b_live" },
				sprites: { apiKey: "sprites_live" },
			}),
		);
		expect(route).toEqual(["e2b", "sprites"]);
		expect(skipped.map((entry) => entry.substrate)).toEqual(["vercel", "dedalus"]);
	});

	it("promotes an explicit primary ahead of the default order", () => {
		const { route } = resolveRoute(
			configWith({
				e2b: { apiKey: "e2b_live" },
				sprites: { apiKey: "sprites_live" },
			}),
			{ primary: "sprites" },
		);
		expect(route).toEqual(["sprites", "e2b"]);
	});

	it("reports each missing part of the vercel credential triple", () => {
		const { skipped } = resolveRoute(
			configWith({ vercel: { token: "tok", teamId: "team_1" } }),
		);
		const vercel = skipped.find((entry) => entry.substrate === "vercel");
		expect(vercel?.missing).toContain("VERCEL_PROJECT_ID");
		expect(vercel?.missing).not.toContain("VERCEL_TOKEN");
	});

	it("treats a complete vercel triple as credentialed", () => {
		const saved = process.env.VERCEL_OIDC_TOKEN;
		delete process.env.VERCEL_OIDC_TOKEN;
		try {
			const { route } = resolveRoute(
				configWith({
					vercel: { token: "tok", teamId: "team_1", projectId: "prj_1" },
				}),
			);
			expect(route).toEqual(["vercel"]);
		} finally {
			if (saved !== undefined) process.env.VERCEL_OIDC_TOKEN = saved;
		}
	});

	it("identifies which lanes have a native pty", () => {
		expect(nativePtyLanes(["e2b", "sprites", "vercel", "dedalus"])).toEqual([
			"e2b",
			"sprites",
		]);
	});
});

describe("vercel accepts either auth shape", () => {
	it("treats an OIDC token in the environment as credentialed", () => {
		const saved = process.env.VERCEL_OIDC_TOKEN;
		process.env.VERCEL_OIDC_TOKEN = "oidc-jwt";
		try {
			const { route, skipped } = resolveRoute(configWith({}));
			expect(route).toEqual(["vercel"]);
			expect(skipped.some((entry) => entry.substrate === "vercel")).toBe(false);
		} finally {
			if (saved === undefined) delete process.env.VERCEL_OIDC_TOKEN;
			else process.env.VERCEL_OIDC_TOKEN = saved;
		}
	});

	it("names OIDC as an alternative when the triple is incomplete", () => {
		const saved = process.env.VERCEL_OIDC_TOKEN;
		delete process.env.VERCEL_OIDC_TOKEN;
		try {
			const { skipped } = resolveRoute(configWith({ vercel: { token: "tok" } }));
			const vercel = skipped.find((entry) => entry.substrate === "vercel");
			expect(vercel?.missing).toContain("VERCEL_TEAM_ID");
			expect(vercel?.missing.join(" ")).toContain("VERCEL_OIDC_TOKEN");
		} finally {
			if (saved !== undefined) process.env.VERCEL_OIDC_TOKEN = saved;
		}
	});
});

import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE_ORDER, resolveRoute, nativePtyLanes } from "@/lib/mux/route";
import type { UserConfig } from "@/lib/user-config/schema";

/**
 * Deliberately loose: stored configs predate schema tightening and can
 * carry a partial vercel credential set, which is exactly the case
 * resolveRoute has to report on.
 */
type LooseProviders = {
	daytona?: { apiKey?: string };
	e2b?: { apiKey?: string };
	sprites?: { apiKey?: string };
	vercel?: { token?: string; teamId?: string; projectId?: string; allowDeploymentCredentials?: boolean };
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
		expect(skipped.map((entry) => entry.substrate)).toEqual(["vercel", "daytona"]);
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
		expect(nativePtyLanes(["e2b", "sprites", "vercel", "daytona", "dedalus"])).toEqual([
			"e2b",
			"sprites",
			"daytona",
		]);
	});
	it("never routes legacy keys to Daytona or selects the retired provider", () => {
		expect(resolveRoute(configWith({ dedalus: { apiKey: "legacy-key" } }), { primary: "dedalus" }).route).toEqual([]);
		expect(resolveRoute(configWith({ daytona: { apiKey: "tenant-key" }, dedalus: { apiKey: "legacy-key" } })).route).toEqual(["daytona"]);
	});
});

describe("vercel tenant isolation", () => {
	it("does not route an unconfigured tenant onto deployment OIDC", () => {
		const saved = process.env.VERCEL_OIDC_TOKEN;
		process.env.VERCEL_OIDC_TOKEN = "oidc-jwt";
		try {
			const { route, skipped } = resolveRoute(configWith({}));
			expect(route).toEqual([]);
			expect(skipped.some((entry) => entry.substrate === "vercel")).toBe(true);
		} finally {
			if (saved === undefined) delete process.env.VERCEL_OIDC_TOKEN;
			else process.env.VERCEL_OIDC_TOKEN = saved;
		}
	});

	it("requires all tenant credential fields when the triple is incomplete", () => {
		const saved = process.env.VERCEL_OIDC_TOKEN;
		delete process.env.VERCEL_OIDC_TOKEN;
		try {
			const { skipped } = resolveRoute(configWith({ vercel: { token: "tok" } }));
			const vercel = skipped.find((entry) => entry.substrate === "vercel");
			expect(vercel?.missing).toContain("VERCEL_TEAM_ID");
			expect(vercel?.missing.join(" ")).not.toContain("VERCEL_OIDC_TOKEN");
		} finally {
			if (saved !== undefined) process.env.VERCEL_OIDC_TOKEN = saved;
		}
	});

	it("allows owner OIDC only when the server projection explicitly authorizes it", () => {
		const saved = process.env.VERCEL_OIDC_TOKEN;
		process.env.VERCEL_OIDC_TOKEN = "owner-oidc";
		try {
			const { route } = resolveRoute(configWith({ vercel: { allowDeploymentCredentials: true } }));
			expect(route).toEqual(["vercel"]);
		} finally {
			if (saved === undefined) delete process.env.VERCEL_OIDC_TOKEN;
			else process.env.VERCEL_OIDC_TOKEN = saved;
		}
	});
});

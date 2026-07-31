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
		expect(vercel?.missing).toEqual(["VERCEL_PROJECT_ID"]);
	});

	it("treats a complete vercel triple as credentialed", () => {
		const { route } = resolveRoute(
			configWith({
				vercel: { token: "tok", teamId: "team_1", projectId: "prj_1" },
			}),
		);
		expect(route).toEqual(["vercel"]);
	});

	it("identifies which lanes have a native pty", () => {
		expect(nativePtyLanes(["e2b", "sprites", "vercel", "dedalus"])).toEqual([
			"e2b",
			"sprites",
		]);
	});
});

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DASHBOARD_CAPABILITIES } from "./capabilities";
import { CAPABILITY_GROUPS } from "../../components/CapabilityAtlas";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function pageForHref(href: string): string {
	const route = href === "/dashboard" ? "dashboard" : href.replace(/^\//, "");
	return resolve(WEB_ROOT, "app", route, "page.tsx");
}

function publicPageForHref(href: string): string {
	if (href.startsWith("/product/")) {
		return resolve(WEB_ROOT, "app/product/[slug]/page.tsx");
	}
	return pageForHref(href);
}

describe("dashboard capability catalog", () => {
	it("only advertises routes backed by real dashboard pages", () => {
		const missing = DASHBOARD_CAPABILITIES
			.map((capability) => ({ id: capability.id, page: pageForHref(capability.href) }))
			.filter(({ page }) => !existsSync(page));
		expect(missing).toEqual([]);
	});

	it("keeps every claim actionable and explicit about provider-dependent behavior", () => {
		for (const capability of DASHBOARD_CAPABILITIES) {
			expect(capability.description.length).toBeGreaterThan(24);
			expect(capability.proof.length).toBeGreaterThan(4);
			if (capability.id === "migration" || capability.id === "machines") {
				expect(capability.providerAware).toBe(true);
			}
		}
	});

	it("keeps the active-machine shortcuts backed by machine-scoped pages", () => {
		for (const slug of ["console", "terminal", "logs", "sessions", "artifacts", "loadout"]) {
			expect(existsSync(resolve(WEB_ROOT, "app/dashboard/machines/[machineId]", slug, "page.tsx"))).toBe(true);
		}
	});

	it("maps every public landing-page claim to a working dashboard surface", () => {
		const dashboardIds = new Set(DASHBOARD_CAPABILITIES.map((capability) => capability.id));
		const publicClaims = CAPABILITY_GROUPS.flatMap((group) => group.capabilities);

		expect(publicClaims).toHaveLength(24);
		expect(publicClaims.filter((claim) => !dashboardIds.has(claim.dashboardId))).toEqual([]);

		const missingPublicPages = publicClaims
			.map((claim) => ({ title: claim.title, page: publicPageForHref(claim.href) }))
			.filter(({ page }) => !existsSync(page));
		expect(missingPublicPages).toEqual([]);
	});
});

import { describe, expect, it } from "vitest";

import { buildPool } from "@/lib/dashboard/pool";
import { newBundle } from "@/lib/memory/bundle";
import { DEFAULT_USER_CONFIG } from "@/lib/user-config/schema";

import { findPackage, listPackages } from "./catalog";
import { injectSessionAbilities, formatAbilityInfoBlock, resolveSessionPackages } from "./inject";
import { collectActiveAbilityIds, matchPackages, scorePackageMatch } from "./match";

describe("listPackages", () => {
	it("loads full Cursor marketplace catalog from API sync", () => {
		expect(listPackages().length).toBeGreaterThanOrEqual(140);
		expect(findPackage("stripe")).toBeTruthy();
		expect(findPackage("heygen")).toBeTruthy();
		expect(findPackage("stripe")?.docsUrl).toMatch(/^https:\/\//);
		expect(findPackage("heygen")?.logoUrl).toMatch(/^https:\/\//);
	});
});

describe("scorePackageMatch", () => {
	it("scores trigger hits in draft text", () => {
		const stripe = findPackage("stripe");
		expect(stripe).toBeTruthy();
		expect(scorePackageMatch("check stripe subscriptions", stripe!)).toBeGreaterThan(0);
		expect(scorePackageMatch("hello world", stripe!)).toBe(0);
	});
});

describe("matchPackages", () => {
	const pool = buildPool(DEFAULT_USER_CONFIG);
	const memory = newBundle({ name: "test", skillIds: ["rtfm"], mcpServerIds: [] });

	it("suggests stripe when draft mentions billing (install chip when plugin skills not in pool)", () => {
		const hits = matchPackages({
			draft: "look up stripe invoice for customer",
			memory,
			sessionPackageIds: [],
			pool,
		});
		const stripe = hits.find((h) => h.packageId === "stripe");
		expect(stripe).toBeTruthy();
		expect(stripe?.kind).toBe("matched_registry");
		expect(stripe?.registryItemIds).toContain("plugin-stripe");
		expect(stripe?.docsUrl).toContain("docs.stripe.com");
	});

	it("does not suggest packages already in sessionPackageIds", () => {
		const hits = matchPackages({
			draft: "stripe invoice",
			memory,
			sessionPackageIds: ["stripe"],
			pool,
		});
		expect(hits.some((h) => h.packageId === "stripe")).toBe(false);
	});

	// Ability ids come from the catalog rather than a literal list. The
	// catalog is generated (web/data/packages.json <- knowledge/
	// cursor-plugins.json), so a marketplace refresh that adds a skill to a
	// package used to silently turn a hard-coded list into a stale subset
	// and fail this test for the wrong reason.
	it("does not suggest when all package abilities are already active in memory", () => {
		const stripe = findPackage("stripe");
		expect(stripe).toBeTruthy();
		// Guard against a vacuous pass if the package ever loses its abilities.
		expect(stripe!.skillIds.length + stripe!.mcpServerIds.length).toBeGreaterThan(0);

		const stripeMemory = newBundle({
			name: "pay",
			skillIds: [...stripe!.skillIds],
			mcpServerIds: [...stripe!.mcpServerIds],
		});
		const hits = matchPackages({
			draft: "stripe invoice webhook",
			memory: stripeMemory,
			sessionPackageIds: [],
			pool,
		});
		expect(hits.some((h) => h.packageId === "stripe")).toBe(false);
	});

	it("still suggests a package when only some of its abilities are active", () => {
		// The boundary of packageFullyActive: partial coverage must still
		// produce a chip, otherwise attaching one skill would hide the rest
		// of the package.
		const stripe = findPackage("stripe");
		expect(stripe).toBeTruthy();
		const allIds = [...stripe!.skillIds, ...stripe!.mcpServerIds];
		expect(allIds.length).toBeGreaterThan(1);

		const partialMemory = newBundle({
			name: "pay-partial",
			skillIds: stripe!.skillIds.slice(0, -1),
			mcpServerIds: [...stripe!.mcpServerIds],
		});
		const hits = matchPackages({
			draft: "stripe invoice webhook",
			memory: partialMemory,
			sessionPackageIds: [],
			pool,
		});
		expect(hits.some((h) => h.packageId === "stripe")).toBe(true);
	});
});

describe("collectActiveAbilityIds", () => {
	it("merges memory baseline with session packages", () => {
		const pool = buildPool(DEFAULT_USER_CONFIG);
		const memory = newBundle({ name: "m", skillIds: ["rtfm"], mcpServerIds: [] });
		const active = collectActiveAbilityIds({
			memory,
			sessionPackageIds: ["stripe"],
			pool,
		});
		expect(active.skillSlugs.has("rtfm")).toBe(true);
		expect(active.mcpNames.has("stripe")).toBe(true);
	});
});

describe("injectSessionAbilities", () => {
	it("prepends ability_info blocks before user text", () => {
		const pool = buildPool(DEFAULT_USER_CONFIG);
		const text = injectSessionAbilities("check subscriptions", ["stripe"], pool);
		expect(text).toContain("<ability_info kind=\"session_attached\">");
		expect(text).toContain("display_name: Stripe");
		expect(text).toContain("check subscriptions");
	});

	it("returns plain text when no session packages", () => {
		const pool = buildPool(DEFAULT_USER_CONFIG);
		expect(injectSessionAbilities("hello", [], pool)).toBe("hello");
	});
});

describe("formatAbilityInfoBlock", () => {
	it("includes skills and mcps", () => {
		const pool = buildPool(DEFAULT_USER_CONFIG);
		const resolved = resolveSessionPackages(["vercel"], pool);
		expect(resolved.length).toBe(1);
		const block = formatAbilityInfoBlock(resolved[0]!);
		expect(block).toContain("mcp_servers:");
		expect(block).toContain("vercel");
	});
});

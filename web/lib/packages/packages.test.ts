import { describe, expect, it } from "vitest";

import { buildPool } from "@/lib/dashboard/pool";
import { newBundle } from "@/lib/memory/bundle";
import { DEFAULT_USER_CONFIG } from "@/lib/user-config/schema";

import { findPackage, listPackages } from "./catalog";
import { injectSessionAbilities, formatAbilityInfoBlock, resolveSessionPackages } from "./inject";
import { collectActiveAbilityIds, matchPackages, scorePackageMatch } from "./match";

describe("listPackages", () => {
	it("loads synced Cursor marketplace packages", () => {
		expect(listPackages().length).toBeGreaterThanOrEqual(20);
		expect(findPackage("stripe")).toBeTruthy();
		expect(findPackage("granola")).toBeTruthy();
		expect(findPackage("stripe")?.docsUrl).toMatch(/^https:\/\//);
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

	it("does not suggest when all package abilities are already active in memory", () => {
		const stripeMemory = newBundle({
			name: "pay",
			skillIds: ["stripe-best-practices", "stripe-projects", "upgrade-stripe"],
			mcpServerIds: ["stripe"],
		});
		const hits = matchPackages({
			draft: "stripe invoice webhook",
			memory: stripeMemory,
			sessionPackageIds: [],
			pool,
		});
		expect(hits.some((h) => h.packageId === "stripe")).toBe(false);
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

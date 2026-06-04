import { describe, expect, it } from "vitest";

import { lookupRegistryItem } from "@/lib/dashboard/registry/bundled";
import { findPackage } from "@/lib/packages/catalog";

describe("lookupRegistryItem", () => {
	it("finds bundled mcp-stripe", () => {
		const item = lookupRegistryItem("mcp-stripe");
		expect(item?.name).toBe("Stripe MCP");
	});

	it("finds skill-deepsec for install flow", () => {
		const item = lookupRegistryItem("skill-deepsec");
		expect(item?.kind).toBe("skill");
	});
});

describe("package registry ids", () => {
	it("stripe package references mcp-stripe", () => {
		const pkg = findPackage("stripe");
		expect(pkg?.registryItemIds).toContain("mcp-stripe");
	});
});

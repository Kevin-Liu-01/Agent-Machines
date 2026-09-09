import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeManifest, urlManifestAdapter } from "./url-manifest";

afterEach(() => vi.unstubAllGlobals());
describe("public URL manifest boundary", () => {
	it("refuses a loopback manifest before making an outbound request", async () => {
		const fetch = vi.fn().mockResolvedValue(Response.json({ items: [{ name: "Private service" }] }));
		vi.stubGlobal("fetch", fetch);
		await expect(urlManifestAdapter.search({ query: "http://127.0.0.1/manifest" })).rejects.toThrow();
		expect(fetch).not.toHaveBeenCalled();
	});
	it("whitelists typed manifest fields and refuses active links", () => {
		const items = normalizeManifest({ name: { secret: "not text" }, items: [null, {}, { name: "Good tool", kind: "mcp",
			description: { nested: true }, provider: ["bad"], command: { execute: "bad" }, logo: "data:image/svg+xml,bad",
			homepage: "javascript:alert(1)", version: 42, installed: true,
		}] }, "https://catalog.company.org/manifest");
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ name: "Good tool", kind: "mcp", description: "", provider: "URL manifest",
			installCommand: null, logoUrl: null, homepage: null, version: null, installed: false });
	});
	it("preserves valid install recipes and public links without executing them", () => {
		expect(normalizeManifest({ items: [{ name: "A tool", command: "npx good-tool", homepage: "https://company.org/docs" }] }, "https://company.org/catalog")[0])
			.toMatchObject({ installCommand: "npx good-tool", homepage: "https://company.org/docs" });
	});
	it("rejects invalid or excessive item collections", () => {
		for (const value of [null, [], {}, { items: "bad" }, { items: Array(1001).fill({ name: "Tool" }) }]) {
			expect(() => normalizeManifest(value, "https://company.org/catalog")).toThrow();
		}
	});
});

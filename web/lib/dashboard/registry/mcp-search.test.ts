import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheClear } from "./cache";
import { mcpRegistryAdapter } from "./mcp-registry";

beforeEach(() => cacheClear());
afterEach(() => { cacheClear(); vi.unstubAllGlobals(); });

function mockRegistry(servers: Array<{ name: string; description: string }>) {
	const fetch = vi.fn().mockResolvedValue(Response.json({ servers: servers.map(server => ({ server })) }));
	vi.stubGlobal("fetch", fetch);
	return fetch;
}

describe("MCP registry search respects the query after curated seed merge", () => {
	it("excludes unrelated curated seeds from a successful Playwright search", async () => {
		const fetch = mockRegistry([
			{ name: "io.github.microsoft/playwright", description: "Browser automation" },
			{ name: "io.github.example/unrelated-tool", description: "Calendar reminders" },
		]);
		const items = await mcpRegistryAdapter.search({ query: "playwright", limit: 500 });
		expect(items.map(item => item.name)).toEqual(["Playwright"]);
		expect(items[0]).toMatchObject({ provider: "microsoft", kind: "mcp", source: "mcp-registry" });
		expect(items.some(item => item.id === "mcp-registry:filesystem")).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("filters successful results by description and normalized provider as well as name", async () => {
		mockRegistry([
			{ name: "io.github.example/browser-helper", description: "Connects to Playwright" },
			{ name: "io.github.playwright-labs/inspector", description: "Page inspection" },
			{ name: "io.github.example/unrelated-tool", description: "Calendar reminders" },
		]);
		const items = await mcpRegistryAdapter.search({ query: "PLAYWRIGHT" });
		expect(items.map(item => item.name)).toEqual(["Browser Helper", "Inspector"]);
	});

	it("deduplicates fetched and seed identities while blank queries still browse the merged catalog", async () => {
		mockRegistry([
			{ name: "github", description: "Fresh registry description" },
			{ name: "github", description: "Duplicate upstream record" },
			{ name: "io.github.example/new-tool", description: "A new registry tool" },
		]);
		const items = await mcpRegistryAdapter.search({ query: "", limit: 500 });
		expect(new Set(items.map(item => item.id)).size).toBe(items.length);
		expect(items.filter(item => item.id === "mcp-registry:github")).toEqual([
			expect.objectContaining({ description: "Fresh registry description" }),
		]);
		expect(items.some(item => item.id === "mcp-registry:filesystem")).toBe(true);
		expect(items.some(item => item.id === "mcp-registry:io-github-example-new-tool")).toBe(true);
		expect(items.length).toBeGreaterThan(2);
	});

	it("applies each request's limit without poisoning the cached full list", async () => {
		const fetch = mockRegistry([{ name: "io.github.example/new-tool", description: "A registry tool" }]);
		const small = await mcpRegistryAdapter.search({ query: "", limit: 1 });
		const full = await mcpRegistryAdapter.search({ query: "", limit: 8 });
		expect(small).toHaveLength(1);
		expect(full).toHaveLength(8);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("MCP registry fallback uses the same filter and limit contract", () => {
	it.each([
		{ query: "GitHub", expectedName: "GitHub", field: "name" },
		{ query: "geocoding", expectedName: "Google Maps", field: "description" },
		{ query: "MCP", expectedName: "GitHub", field: "provider" },
	])("filters curated fallback by $field", async ({ query, expectedName }) => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Registry unavailable")));
		const items = await mcpRegistryAdapter.search({ query, limit: 500 });
		expect(items.some(item => item.name === expectedName)).toBe(true);
		for (const item of items) expect([item.name, item.description, item.provider].join(" ").toLowerCase()).toContain(query.toLowerCase());
	});

	it("bounds both blank browsing and filtered fallback when the registry is unavailable", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 })));
		expect(await mcpRegistryAdapter.search({ query: "", limit: 2 })).toHaveLength(2);
		expect(await mcpRegistryAdapter.search({ query: "MCP", limit: 2 })).toHaveLength(2);
		expect(await mcpRegistryAdapter.search({ query: "", limit: 0 })).toEqual([]);
		expect(await mcpRegistryAdapter.search({ query: "nonexistent-distinctive-server", limit: 5 })).toEqual([]);
	});
});

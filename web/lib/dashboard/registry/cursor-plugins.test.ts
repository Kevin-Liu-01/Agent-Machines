import { describe, expect, it } from "vitest";
import { createCursorPluginsAdapter, cursorPluginsAdapter, parseScanOutput } from "./cursor-plugins";

describe("Cursor plugin scan isolation", () => {
	it("keeps concurrent private scans out of each other and the public adapter", async () => {
		const alice = createCursorPluginsAdapter(parseScanOutput("alice/private-payroll\t1\tAlice confidential"));
		const bob = createCursorPluginsAdapter(parseScanOutput("bob/private-client\t1\tBob confidential"));
		const [a, b, publicItems] = await Promise.all([
			alice.search({ query: "private-" }), bob.search({ query: "private-" }), cursorPluginsAdapter.search({ query: "private-" }),
		]);
		expect(a.map((item) => item.name)).toEqual(["private-payroll"]);
		expect(b.map((item) => item.name)).toEqual(["private-client"]);
		expect(publicItems).toEqual([]);
		expect(await createCursorPluginsAdapter().search({ query: "Alice confidential" })).toEqual([]);
	});
	it("does not let a small previous limit poison later catalog searches", async () => {
		const small = await cursorPluginsAdapter.search({ query: "", limit: 1 });
		const full = await cursorPluginsAdapter.search({ query: "", limit: 20 });
		expect(small).toHaveLength(1); expect(full).toHaveLength(20);
	});
	it("does not falsely attribute private plugins to the public marketplace", async () => {
		const adapter = createCursorPluginsAdapter(parseScanOutput("private/custom\t2\tMy custom skills"));
		const [item] = await adapter.search({ query: "My custom skills" });
		expect(item).toMatchObject({ provider: "private · machine scan", homepage: null, installCommand: null });
	});
	it("bounds scan output parsing", () => {
		expect(parseScanOutput("a/b\t1\tdescription\n".repeat(2000))).toHaveLength(1000);
	});
});

import { describe, expect, it } from "vitest";

import type { Pool } from "@/lib/dashboard/pool";
import type { MemoryBundle } from "@/lib/user-config/schema";

import { computeLoadoutHash } from "./loadout-hash";

const pool: Pool = {
	skills: [
		{ slug: "deepsec", name: "deepsec", description: "scan", version: "", category: "review", tags: [], related: [], bytes: 0 },
		{ slug: "rtfm", name: "rtfm", description: "docs", version: "", category: "docs", tags: [], related: [], bytes: 0 },
	],
	mcps: [{ name: "vercel", transport: "http", source: "vercel", tools: [] }],
};

function bundle(skillIds: string[]): MemoryBundle {
	return {
		id: "b",
		name: "B",
		description: "",
		source: "custom",
		docs: { soul: "", agentDocs: "", memory: "", user: "" },
		skillIds,
		toolIds: [],
		mcpServerIds: [],
		createdAt: "1970-01-01T00:00:00.000Z",
		updatedAt: "1970-01-01T00:00:00.000Z",
	};
}

describe("computeLoadoutHash", () => {
	it("is stable for the same bundle + pool", () => {
		expect(computeLoadoutHash(bundle(["deepsec"]), pool)).toBe(
			computeLoadoutHash(bundle(["deepsec"]), pool),
		);
	});

	it("changes when the resolved skill set changes", () => {
		expect(computeLoadoutHash(bundle(["deepsec"]), pool)).not.toBe(
			computeLoadoutHash(bundle(["rtfm"]), pool),
		);
	});

	it("is order-independent in skillIds", () => {
		expect(computeLoadoutHash(bundle(["deepsec", "rtfm"]), pool)).toBe(
			computeLoadoutHash(bundle(["rtfm", "deepsec"]), pool),
		);
	});

	it("resolves the wildcard to the full pool", () => {
		expect(computeLoadoutHash(bundle(["*"]), pool)).toBe(
			computeLoadoutHash(bundle(["deepsec", "rtfm"]), pool),
		);
	});
});

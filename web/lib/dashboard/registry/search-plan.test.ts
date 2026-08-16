import { describe, expect, it } from "vitest";

import { REGISTRY_SOURCE_IDS, registrySearchPlan } from "./search-plan";

describe("registrySearchPlan", () => {
	it("uses only the local catalog for an empty all-source browse", () => {
		expect(registrySearchPlan("", "all")).toEqual({
			sourceIds: ["bundled"],
			scanLiveCursorPlugins: false,
		});
	});

	it("fans a real query out without touching the active machine", () => {
		expect(registrySearchPlan("postgres", "all")).toEqual({
			sourceIds: REGISTRY_SOURCE_IDS,
			scanLiveCursorPlugins: false,
		});
	});

	it("scans the machine only when Cursor Plugins is selected explicitly", () => {
		expect(registrySearchPlan("", ["cursor-plugins"])).toEqual({
			sourceIds: ["cursor-plugins"],
			scanLiveCursorPlugins: true,
		});
	});
});

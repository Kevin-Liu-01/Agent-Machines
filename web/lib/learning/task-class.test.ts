import { describe, expect, it } from "vitest";

import { deriveTaskClass } from "./task-class";

describe("deriveTaskClass", () => {
	it("classifies by skill/name signature", () => {
		expect(deriveTaskClass({ skills: ["vercel-deploy"], name: "nightly deploy" })).toBe("deploy");
		expect(deriveTaskClass({ skills: ["code-review"], name: "review PRs" })).toBe("code");
		expect(deriveTaskClass({ skills: ["web-search"], name: "research digest" })).toBe("research");
		expect(deriveTaskClass({ skills: ["supabase"], name: "sync warehouse" })).toBe("data");
	});

	it("falls back to unknown when nothing matches", () => {
		expect(deriveTaskClass({ skills: [], name: "misc chore" })).toBe("unknown");
	});

	it("is deterministic", () => {
		const input = { skills: ["build", "lint"], name: "ci" };
		expect(deriveTaskClass(input)).toBe(deriveTaskClass(input));
	});
});

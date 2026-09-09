import { describe, expect, it } from "vitest";
import { HARNESS, PRODUCT } from "./harness";
import { PROVIDER_LABELS, RUNTIME } from "./runtime";
import { PROVIDER_KINDS } from "@/lib/user-config/schema";
import { SUBSTRATE_CAPABILITIES } from "@/lib/mux/capabilities";

describe("current platform provider inventory", () => {
	it("aligns onboarding, platform copy, and capability selectors on the active four", () => {
		expect(HARNESS.providersLive).toEqual(PROVIDER_KINDS);
		expect(RUNTIME.providersLive).toBe(HARNESS.providersLive);
		expect(Object.keys(PROVIDER_LABELS)).toEqual(PROVIDER_KINDS);
		expect([...SUBSTRATE_CAPABILITIES.map((item) => item.kind)].sort()).toEqual([...PROVIDER_KINDS].sort());
		expect(PROVIDER_LABELS.daytona).toBe("Daytona");
		expect(JSON.stringify(PRODUCT)).not.toMatch(/dedalus/i);
	});
});

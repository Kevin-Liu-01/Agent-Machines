import { describe, expect, it } from "vitest";

import { getProvider } from "./index";
import { PROVIDER_KINDS, type ProviderKind } from "@/lib/user-config/schema";

describe("provider registry", () => {
	it("includes vercel in PROVIDER_KINDS", () => {
		expect(PROVIDER_KINDS).toContain("vercel");
	});

	it("constructs a VercelProvider when credentials are present", () => {
		const provider = getProvider("vercel", {
			vercel: {
				token: "tok",
				teamId: "team_1",
				projectId: "prj_1",
			},
		});
		expect(provider.kind).toBe("vercel");
	});

	it("exhaustively handles every ProviderKind in getProvider", () => {
		const kinds: ProviderKind[] = [...PROVIDER_KINDS];
		expect(kinds).toEqual(
			expect.arrayContaining(["dedalus", "e2b", "sprites", "vercel"]),
		);
	});
});

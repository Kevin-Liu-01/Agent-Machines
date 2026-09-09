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
			expect.arrayContaining(["daytona", "e2b", "sprites", "vercel"]),
		);
	});
	it("constructs Daytona only from its own credentials", () => {
		expect(getProvider("daytona", { daytona: { apiKey: "fixture-key", apiUrl: "https://app.daytona.io/api" } }).kind).toBe("daytona");
		expect(() => getProvider("daytona", { dedalus: { apiKey: "legacy-key" } })).toThrow("Daytona API key");
		expect(PROVIDER_KINDS).not.toContain("dedalus");
	});
});

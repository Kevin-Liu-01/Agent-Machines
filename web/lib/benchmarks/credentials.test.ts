import { describe, expect, it } from "vitest";

import { credentialsFromEnv } from "./credentials";

describe("benchmark environment credentials", () => {
	it("accepts the canonical SPRITES_TOKEN name used by the mux and .env", () => {
		const credentials = credentialsFromEnv({
			NODE_ENV: "test",
			SPRITES_TOKEN: "sprites-secret",
		});
		expect(credentials.sprites).toEqual({ apiKey: "sprites-secret" });
	});
});

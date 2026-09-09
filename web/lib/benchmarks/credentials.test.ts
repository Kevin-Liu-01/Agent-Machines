import { describe, expect, it } from "vitest";

import { credentialsFromEnv } from "./credentials";

describe("benchmark environment credentials", () => {
	it("reads Daytona API key, endpoint and target while ignoring retired credentials", () => {
		expect(credentialsFromEnv({ NODE_ENV: "test", DAYTONA_API_KEY: "fixture-key", DAYTONA_API_URL: "https://app.daytona.io/api", DAYTONA_TARGET: "us", DEDALUS_API_KEY: "retired-fixture" })).toEqual({
			daytona: { apiKey: "fixture-key", apiUrl: "https://app.daytona.io/api", target: "us" },
		});
		expect(credentialsFromEnv({ NODE_ENV: "test", DEDALUS_API_KEY: "retired-fixture" })).toEqual({});
	});
	it("accepts the canonical SPRITES_TOKEN name used by the mux and .env", () => {
		const credentials = credentialsFromEnv({
			NODE_ENV: "test",
			SPRITES_TOKEN: "sprites-secret",
		});
		expect(credentials.sprites).toEqual({ apiKey: "sprites-secret" });
	});
});

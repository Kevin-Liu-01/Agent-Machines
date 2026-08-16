import { afterEach, describe, expect, it } from "vitest";

import { authorizedInternalRequest } from "./auth";

const previousCronSecret = process.env.CRON_SECRET;
const previousDevAuth = process.env.ALLOW_DEV_AUTH;

afterEach(() => {
	if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
	else process.env.CRON_SECRET = previousCronSecret;
	if (previousDevAuth === undefined) delete process.env.ALLOW_DEV_AUTH;
	else process.env.ALLOW_DEV_AUTH = previousDevAuth;
});

describe("authorizedInternalRequest", () => {
	it("rejects forged Vercel cron headers", () => {
		delete process.env.CRON_SECRET;
		delete process.env.ALLOW_DEV_AUTH;
		const request = new Request("https://example.test/internal", {
			headers: { "x-vercel-cron": "1" },
		});

		expect(authorizedInternalRequest(request)).toBe(false);
	});

	it("requires the exact configured bearer secret", () => {
		process.env.CRON_SECRET = "deployment-secret";
		delete process.env.ALLOW_DEV_AUTH;

		expect(
			authorizedInternalRequest(
				new Request("https://example.test/internal", {
					headers: { authorization: "Bearer deployment-secret" },
				}),
			),
		).toBe(true);
		expect(
			authorizedInternalRequest(
				new Request("https://example.test/internal", {
					headers: { authorization: "Bearer wrong" },
				}),
			),
		).toBe(false);
	});
});

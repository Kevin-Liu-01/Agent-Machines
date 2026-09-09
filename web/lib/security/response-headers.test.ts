import { expect, it } from "vitest";
import { RESPONSE_SECURITY_HEADERS } from "./response-headers";

it("blocks cross-origin framing, MIME sniffing, plugins and base URL injection", () => {
	const headers = Object.fromEntries(RESPONSE_SECURITY_HEADERS.map(({ key, value }) => [key, value]));
	expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
	expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
	expect(headers["X-Content-Type-Options"]).toBe("nosniff");
	expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
	expect(headers["Permissions-Policy"]).toContain("microphone=()");
});

it("leaves scripts, external sandbox frames and gateway connections available", () => {
	const csp = RESPONSE_SECURITY_HEADERS.find(({ key }) => key === "Content-Security-Policy")!.value;
	expect(csp).not.toMatch(/(?:^|;)\s*(?:default-src|script-src|connect-src|frame-src)/);
});

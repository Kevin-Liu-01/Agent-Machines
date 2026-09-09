import { describe, expect, it } from "vitest";
import { safeAuthReturnTo, signInCleanupRedirect } from "./redirects";

describe("authentication return destinations", () => {
	it.each([
		"/dashboard", "/dashboard/machines/worker-1?tab=files#readme",
		"/dashboard/workers?preset=computer-use", "/onboarding?preset=deep-research&force=1",
	])("preserves the complete intended local destination: %s", (destination) => {
		expect(safeAuthReturnTo(destination)).toBe(destination);
		expect(signInCleanupRedirect({ redirect_url: destination })).toBeNull();
	});
	it.each([
		"https://evil.example/dashboard", "//evil.example/dashboard", "\\\\evil.example",
		"/\\evil.example/dashboard", "javascript:alert(1)", "/dashboard\n/evil",
		" /dashboard", "/dashboard-evil", "/api/dashboard/admin", "/sign-in",
		"/dashboard/../../outside", "/dashboard/%2e%2e/%2e%2e/outside",
		"/dashboard/%2F%2Fevil.example", "/dashboard/%5Cevil", "/dashboard/%00",
		["/dashboard", "//evil.example"], undefined, null,
	])("rejects unsafe or ambiguous input: %j", (destination) => {
		expect(safeAuthReturnTo(destination)).toBeNull();
	});
	it("cleans every Clerk query override without losing the intended preset or OAuth state", () => {
		const cleaned = signInCleanupRedirect({
			redirect_url: "/onboarding?preset=computer-use",
			sign_in_force_redirect_url: "https://evil.example",
			sign_up_force_redirect_url: "/dashboard",
			sign_in_fallback_redirect_url: "//evil.example",
			sign_up_fallback_redirect_url: "//evil.example",
			state: "oauth-state",
		}, ["sso-callback"]);
		const url = new URL(cleaned!, "https://app.example");
		expect(url.pathname).toBe("/sign-in/sso-callback");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			redirect_url: "/onboarding?preset=computer-use", state: "oauth-state",
		});
		expect(signInCleanupRedirect(Object.fromEntries(url.searchParams), ["sso-callback"])).toBeNull();
	});
	it("removes a duplicate or external redirect before Clerk sees the query", () => {
		expect(signInCleanupRedirect({ redirect_url: ["/dashboard", "https://evil.example"] })).toBe("/sign-in");
		expect(signInCleanupRedirect({ redirect_url: "https://evil.example", state: ["one", "two"] })).toBe("/sign-in?state=one&state=two");
	});
});

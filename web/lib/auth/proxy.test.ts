import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), middleware: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
	clerkMiddleware: (handler: Function) => (request: NextRequest) => {
		mocks.middleware(request);
		return handler(mocks.auth, request);
	},
	createRouteMatcher: (patterns: string[]) => (request: NextRequest) => patterns.some((pattern) =>
		new RegExp(`^${pattern}$`).test(request.nextUrl.pathname)),
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.auth.mockResolvedValue({ userId: null });
	vi.stubEnv("NODE_ENV", "test");
	vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test");
	vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
	vi.stubEnv("ALLOW_DEV_AUTH", "0");
});

afterEach(() => vi.unstubAllEnvs());

async function requestUrl(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
	const { default: proxy } = await import("../../proxy");
	return proxy(new NextRequest(url, init), {} as Parameters<typeof proxy>[1]);
}

async function request(path: string, bearer?: string) {
	return requestUrl(`https://www.agent-machines.com${path}`, {
		headers: bearer ? { authorization: bearer } : {},
	});
}

describe("dashboard middleware authentication handoff", () => {
	it("lets SDK bearer requests reach the route's actual key validator", async () => {
		expect(await request("/api/dashboard/machines", "Bearer am_live_example.secret")).toBeUndefined();
	});
	it("rejects missing or malformed credentials at the API gate", async () => {
		for (const auth of [undefined, "Bearer", "Basic abc"]) {
			expect((await request("/api/dashboard/machines", auth))?.status).toBe(401);
		}
	});
	it("does not let bearer credentials substitute for a browser login", async () => {
		const response = await request("/dashboard/setup?preset=researcher", "Bearer fake");
		const target = new URL(response!.headers.get("location")!);
		expect(target.pathname).toBe("/sign-in");
		expect(target.searchParams.get("redirect_url")).toBe("/dashboard/setup?preset=researcher");
	});
	it("keeps Clerk-authenticated API requests working", async () => {
		mocks.auth.mockResolvedValue({ userId: "signed-in-user" });
		expect(await request("/api/dashboard/machines")).toBeUndefined();
	});
});

const productionPublishableKey = `pk_live_${btoa("clerk.agent-machines.dev$")}`;

describe("canonical production authentication host", () => {
	beforeEach(() => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", productionPublishableKey);
		vi.stubEnv("CLERK_SECRET_KEY", "sk_live_fixture");
	});

	it.each([
		["agent-machines.com", "GET", "/sign-in"],
		["www.agent-machines.com", "HEAD", "/sign-in/sso-callback"],
		["agent-machines.com", "HEAD", "/dashboard"],
		["www.agent-machines.com", "GET", "/dashboard/workers/worker%20one"],
		["agent-machines.com", "GET", "/onboarding"],
		["www.agent-machines.com", "HEAD", "/onboarding/setup"],
	])("hands %s %s %s to the fixed auth host before Clerk runs", async (host, method, path) => {
		const response = await requestUrl(`https://${host}${path}`, { method });
		expect(response?.status).toBe(307);
		expect(response?.headers.get("location")).toBe(`https://www.agent-machines.dev${path}`);
		expect(mocks.middleware).not.toHaveBeenCalled();
		expect(mocks.auth).not.toHaveBeenCalled();
	});

	it("preserves encoded query parameters and the relative return URL", async () => {
		const query = "?redirect_url=%2Fdashboard%2Fsetup%3Fpreset%3Dresearcher%26name%3DA%2520B&label=a%2Bb+%26+c&tag=one&tag=two";
		const response = await request(`/sign-in${query}`);
		const location = response!.headers.get("location")!;
		expect(location).toBe(`https://www.agent-machines.dev/sign-in${query}`);
		expect(new URL(location).searchParams.get("redirect_url")).toBe("/dashboard/setup?preset=researcher&name=A%20B");
	});

	it("never derives the destination from Host or forwarded headers", async () => {
		const response = await requestUrl("https://www.agent-machines.com/sign-in", {
			headers: {
				host: "attacker.example",
				"x-forwarded-host": "attacker.example",
				"x-forwarded-proto": "http",
			},
		});
		expect(response?.headers.get("location")).toBe("https://www.agent-machines.dev/sign-in");
	});

	it.each([
		"https://attacker.example",
		"https://www.agent-machines.com.attacker.example",
		"https://www.agent-machines.dev",
		"https://agent-machines.dev",
		"http://localhost:3210",
		"http://127.0.0.1:3210",
		"https://agent-machines-preview.vercel.app",
	])("does not redirect an unlisted request origin %s, even with spoofed headers", async (origin) => {
		const response = await requestUrl(`${origin}/sign-in`, {
			headers: { host: "www.agent-machines.com", "x-forwarded-host": "www.agent-machines.com" },
		});
		expect(response).toBeUndefined();
		expect(mocks.middleware).toHaveBeenCalledOnce();
	});

	it.each(["/", "/pricing", "/product/workers", "/sign-in-extra", "/dashboarding", "/onboarding-extra", "/api/health"])(
		"does not move public routes or similarly prefixed paths: %s", async (path) => {
			mocks.auth.mockResolvedValue({ userId: "signed-in-user" });
			expect(await request(path)).toBeUndefined();
			expect(mocks.middleware).toHaveBeenCalledOnce();
		},
	);

	it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("does not move %s requests across origins", async (method) => {
		mocks.auth.mockResolvedValue({ userId: "signed-in-user" });
		expect(await requestUrl("https://www.agent-machines.com/dashboard", {
			method,
			headers: { "next-action": "fixture-action" },
		})).toBeUndefined();
		expect(mocks.middleware).toHaveBeenCalledOnce();
		expect(mocks.auth).toHaveBeenCalledOnce();
	});

	it("keeps a signed-out server action's existing redirect same-origin", async () => {
		const response = await requestUrl("https://www.agent-machines.com/dashboard", { method: "POST" });
		expect(new URL(response!.headers.get("location")!).origin).toBe("https://www.agent-machines.com");
		expect(mocks.auth).toHaveBeenCalledOnce();
	});

	it.each(["/api/dashboard/machines", "/api/chat"])("keeps SDK, session, and unauthorized behavior for %s", async (path) => {
		const headers = { authorization: "Bearer am_live_example.secret" };
		expect(await requestUrl(`https://www.agent-machines.com${path}`, { headers })).toBeUndefined();
		expect(mocks.middleware.mock.calls[0][0].headers.get("authorization")).toBe(headers.authorization);
		expect((await request(path))?.status).toBe(401);
		mocks.auth.mockResolvedValue({ userId: "signed-in-user" });
		expect(await request(path)).toBeUndefined();
	});

	it("preserves a signed-in browser session on the primary app host", async () => {
		mocks.auth.mockResolvedValue({ userId: "signed-in-user" });
		expect(await requestUrl("https://www.agent-machines.dev/dashboard")).toBeUndefined();
		expect(mocks.auth).toHaveBeenCalledOnce();
	});

	it.each(["development", "test"])("does not redirect in NODE_ENV=%s", async (environment) => {
		vi.stubEnv("NODE_ENV", environment);
		expect(await request("/sign-in")).toBeUndefined();
		expect(mocks.middleware).toHaveBeenCalledOnce();
	});

	it.each([
		undefined,
		"",
		`pk_test_${btoa("clerk.agent-machines.dev$")}`,
		`pk_live_${btoa("clerk.other-app.dev$")}`,
		`pk_live_${btoa("clerk.agent-machines.dev.attacker.example$")}`,
		`pk_live_${btoa("clerk.agent-machines.dev")}`,
		`pk_live_${btoa("clerk.agent-machines.dev$extra")}`,
		"pk_live_not!base64",
		"pk_live_a",
		productionPublishableKey.replace(/A==$/, "B=="),
		`${productionPublishableKey}\n`,
	])("does not activate for an absent, development, malformed, or other-app key %#", async (key) => {
		vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", key);
		const response = await request("/sign-in");
		expect(response?.headers.get("location") ?? null).toBeNull();
	});

	it("accepts Clerk's unpadded base64 publishable key encoding", async () => {
		vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", productionPublishableKey.replace(/=+$/, ""));
		expect((await request("/sign-in"))?.headers.get("location")).toBe("https://www.agent-machines.dev/sign-in");
	});

	it("does not redirect an unconfigured deployment with no secret key", async () => {
		vi.stubEnv("CLERK_SECRET_KEY", "");
		expect((await request("/dashboard"))?.status).toBe(503);
		expect(mocks.middleware).not.toHaveBeenCalled();
	});
});

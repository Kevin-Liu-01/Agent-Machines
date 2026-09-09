import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	middleware: vi.fn(),
	frontendApiProxy: vi.fn(),
	fetch: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
	return {
		...actual,
		clerkMiddleware: (handler: Function) => (request: NextRequest) => {
			mocks.middleware(request);
			return handler(mocks.auth, request);
		},
		clerkFrontendApiProxy: (...args: Parameters<typeof actual.clerkFrontendApiProxy>) => {
			mocks.frontendApiProxy(...args);
			return actual.clerkFrontendApiProxy(...args);
		},
	};
});

const origin = "https://www.agent-machines.dev";
const productionPublishableKey = `pk_live_${btoa("clerk.agent-machines.dev$")}`;

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	vi.stubEnv("NODE_ENV", "production");
	vi.stubEnv("VERCEL_ENV", "production");
	vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", productionPublishableKey);
	vi.stubEnv("CLERK_SECRET_KEY", "sk_live_proxy_test_fixture");
	vi.stubEnv("NEXT_PUBLIC_CLERK_PROXY_URL", undefined);
	vi.stubEnv("ALLOW_DEV_AUTH", "0");
	mocks.auth.mockResolvedValue({ userId: null });
	mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) =>
		new Response(init.method === "HEAD" ? null : "clerk-fixture", {
			status: 200,
			headers: { "content-type": "text/plain" },
		}));
	vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

async function request(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
	const { default: proxy } = await import("../../proxy");
	return proxy(new NextRequest(url, init), {} as Parameters<typeof proxy>[1]);
}

describe("production Clerk Frontend API proxy", () => {
	it.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
		"forwards %s through the official SDK without a prior app session", async (method) => {
			const response = await request(`${origin}/__clerk/v1/client?__clerk_api_version=2025-11-10`, { method });
			expect(response?.status).toBe(200);
			expect(mocks.frontendApiProxy).toHaveBeenCalledOnce();
			expect(mocks.middleware).not.toHaveBeenCalled();
			expect(mocks.auth).not.toHaveBeenCalled();
			expect(mocks.fetch).toHaveBeenCalledOnce();
			const [url, options] = mocks.fetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://frontend-api.clerk.dev/v1/client?__clerk_api_version=2025-11-10");
			expect(options.method).toBe(method);
			expect(options.redirect).toBe("manual");
			expect(new Headers(options.headers).get("clerk-proxy-url")).toBe(`${origin}/__clerk`);
			expect(new Headers(options.headers).get("clerk-secret-key")).toBe("sk_live_proxy_test_fixture");
			expect(response?.headers.has("clerk-secret-key")).toBe(false);
		},
	);

	it.each([
		"/__clerk",
		"/__clerk/",
		"/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
		"/__clerk/npm/@clerk/ui@1/dist/ui.browser.js",
		"/__clerk/assets/style.css",
		"/__clerk/assets/font.woff2",
		"/__clerk/assets/logo.svg",
	])("includes %s in the real Next matcher and forwards its complete path", async (path) => {
		const { config } = await import("../../proxy");
		expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: `${origin}${path}` })).toBe(true);
		expect((await request(`${origin}${path}`))?.status).toBe(200);
		expect(mocks.fetch.mock.calls[0][0]).toBe(`https://frontend-api.clerk.dev${path.slice("/__clerk".length) || "/"}`);
	});

	it("streams the request body and preserves session and origin headers", async () => {
		const body = "strategy=email_code&email_address=fixture%40example.com";
		await request(`${origin}/__clerk/v1/client/sign_ins`, {
			method: "POST",
			body,
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				cookie: "__client=fixture",
				origin,
				"x-forwarded-for": "192.0.2.10",
			},
		});
		const options = mocks.fetch.mock.calls[0][1] as RequestInit;
		expect(await new Response(options.body).text()).toBe(body);
		const headers = new Headers(options.headers);
		expect(headers.get("cookie")).toBe("__client=fixture");
		expect(headers.get("origin")).toBe(origin);
		expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
		expect(headers.get("x-forwarded-for")).toBe("192.0.2.10");
	});

	it("pins the upstream and proxy origin despite supplied routing and IP headers", async () => {
		mocks.fetch.mockResolvedValue(new Response(null, {
			status: 307,
			headers: { location: "https://frontend-api.clerk.dev/v1/client?fixture=1" },
		}));
		const response = await request(`${origin}/__clerk//attacker.example/v1/client?upstream=https%3A%2F%2Fattacker.example`, {
			headers: {
				host: "attacker.example",
				"x-forwarded-host": "attacker.example, www.agent-machines.dev",
				"x-forwarded-proto": "http",
				"clerk-proxy-url": "https://attacker.example/__clerk",
				"clerk-secret-key": "attacker-supplied",
				"cf-connecting-ip": "192.0.2.99",
				"x-real-ip": "192.0.2.98",
				"x-forwarded-for": "192.0.2.97",
				"x-vercel-forwarded-for": "192.0.2.10",
			},
		});
		const [url, options] = mocks.fetch.mock.calls[0] as [string, RequestInit];
		expect(new URL(url).origin).toBe("https://frontend-api.clerk.dev");
		const headers = new Headers(options.headers);
		expect(headers.get("host")).toBe("frontend-api.clerk.dev");
		expect(headers.get("clerk-proxy-url")).toBe(`${origin}/__clerk`);
		expect(headers.get("clerk-secret-key")).toBe("sk_live_proxy_test_fixture");
		expect(headers.get("x-forwarded-for")).toBe("192.0.2.10");
		expect(headers.has("cf-connecting-ip")).toBe(false);
		expect(headers.has("x-real-ip")).toBe(false);
		expect(response?.headers.get("location")).toBe(`${origin}/__clerk/v1/client?fixture=1`);
	});

	it.each([
		"http://www.agent-machines.dev",
		"https://www.agent-machines.dev:444",
		"https://agent-machines.dev",
		"https://agent-machines.com",
		"https://www.agent-machines.com",
		"https://attacker.example",
		"https://www.agent-machines.dev.attacker.example",
		"https://agent-machines-preview.vercel.app",
		"http://localhost:3210",
		"http://127.0.0.1:3210",
	])("returns 404 on unapproved origin %s even with canonical forwarded headers", async (unapprovedOrigin) => {
		const response = await request(`${unapprovedOrigin}/__clerk/v1/client`, {
			headers: { host: "www.agent-machines.dev", "x-forwarded-host": "www.agent-machines.dev", "x-forwarded-proto": "https" },
		});
		expect(response?.status).toBe(404);
		expect(response?.headers.get("cache-control")).toBe("no-store");
		expect(mocks.frontendApiProxy).not.toHaveBeenCalled();
		expect(mocks.middleware).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it.each([
		["NODE_ENV", "development"],
		["NODE_ENV", "test"],
		["VERCEL_ENV", "preview"],
		["VERCEL_ENV", "development"],
		["VERCEL_ENV", undefined],
		["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", undefined],
		["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_test_${btoa("clerk.agent-machines.dev$")}`],
		["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_live_${btoa("clerk.other-app.dev$")}`],
		["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_live_${btoa("clerk.agent-machines.dev.attacker.example$")}`],
		["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_not!base64"],
		["CLERK_SECRET_KEY", undefined],
		["CLERK_SECRET_KEY", ""],
	])("returns 404 when %s is disabled or mismatched (%#)", async (name, value) => {
		vi.stubEnv(name, value);
		vi.stubEnv("ALLOW_DEV_AUTH", "1");
		expect((await request(`${origin}/__clerk/v1/client`))?.status).toBe(404);
		expect(mocks.frontendApiProxy).not.toHaveBeenCalled();
		expect(mocks.middleware).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it.each(["/__clerk-extra/v1/client", "/api/__clerk/v1/client"])("does not proxy a similarly named route %s", async (path) => {
		await request(`${origin}${path}`);
		expect(mocks.frontendApiProxy).not.toHaveBeenCalled();
		expect(mocks.middleware).toHaveBeenCalledOnce();
	});

	it("keeps anonymous dashboard APIs closed and browser pages behind sign-in", async () => {
		for (const path of ["/api/dashboard/machines", "/api/chat"]) {
			expect((await request(`${origin}${path}`))?.status).toBe(401);
		}
		const response = await request(`${origin}/dashboard`);
		expect(response?.status).toBe(307);
		expect(response?.headers.get("location")).toBe(`${origin}/sign-in?redirect_url=%2Fdashboard`);
		expect(mocks.frontendApiProxy).not.toHaveBeenCalled();
		expect(mocks.auth).toHaveBeenCalledTimes(3);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
	clerkMiddleware: (handler: Function) => (request: NextRequest) => handler(mocks.auth, request),
	createRouteMatcher: (patterns: string[]) => (request: NextRequest) => patterns.some((pattern) =>
		new RegExp(`^${pattern}$`).test(request.nextUrl.pathname)),
}));

beforeEach(() => {
	vi.resetModules();
	mocks.auth.mockResolvedValue({ userId: null });
	vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test");
	vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
	vi.stubEnv("ALLOW_DEV_AUTH", "0");
});

async function request(path: string, bearer?: string) {
	const { default: proxy } = await import("../../proxy");
	return proxy(new NextRequest(`https://www.agent-machines.com${path}`, {
		headers: bearer ? { authorization: bearer } : {},
	}), {} as Parameters<typeof proxy>[1]);
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

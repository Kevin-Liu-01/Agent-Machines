import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), provider: vi.fn(), onboarding: vi.fn(), library: vi.fn(), config: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({
	SignIn: (props: unknown) => { mocks.signIn(props); return null; },
	ClerkProvider: (props: { children: React.ReactNode }) => { mocks.provider(props); return props.children; },
}));
vi.mock("next/navigation", () => ({ redirect: (destination: string) => { throw new Error(`REDIRECT:${destination}`); } }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/WingBackground", () => ({ WingBackground: () => null }));
vi.mock("@/components/dashboard/OnboardingFlow", () => ({ OnboardingFlow: (props: unknown) => { mocks.onboarding(props); return null; } }));
vi.mock("@/components/dashboard/WorkersLibrary", () => ({ WorkersLibrary: (props: unknown) => { mocks.library(props); return null; } }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config }));
vi.mock("@/lib/user-config/schema", () => ({ toPublicConfig: (config: unknown) => config }));

beforeAll(() => {
	// Vitest's Node JSX transform uses React.createElement; Next uses its automatic runtime.
	vi.stubGlobal("React", React);
	vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
});
beforeEach(() => {
	vi.clearAllMocks();
	mocks.config.mockResolvedValue({ machines: [] });
});
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("mounted auth and setup route contracts", () => {
	it.each([undefined, "/dashboard/workers?preset=computer-use"])("mounts Clerk with non-forced sign-in and signup defaults for return URL %s", async (returnTo) => {
		const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
		renderToStaticMarkup(await SignInPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ redirect_url: returnTo }) }));
		expect(mocks.signIn).toHaveBeenCalledWith(expect.objectContaining({ fallbackRedirectUrl: "/dashboard", signUpFallbackRedirectUrl: "/onboarding" }));
		expect(mocks.signIn.mock.calls[0][0]).not.toHaveProperty("forceRedirectUrl");
		expect(mocks.provider.mock.calls[0][0]).toMatchObject({ signInFallbackRedirectUrl: "/dashboard", signUpFallbackRedirectUrl: "/onboarding" });
		expect(mocks.provider.mock.calls[0][0]).not.toHaveProperty("signInForceRedirectUrl");
		expect(mocks.provider.mock.calls[0][0]).not.toHaveProperty("signUpForceRedirectUrl");
	});
	it("redirects an unsafe query before rendering the authentication widget", async () => {
		const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
		await expect(SignInPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ redirect_url: "https://evil.example" }) })).rejects.toThrow("REDIRECT:/sign-in");
		expect(mocks.signIn).not.toHaveBeenCalled();
	});
	it("passes the selected public template into new-account onboarding", async () => {
		const { default: OnboardingPage } = await import("@/app/onboarding/page");
		renderToStaticMarkup(await OnboardingPage({ searchParams: Promise.resolve({ preset: "computer-use" }) }));
		expect(mocks.onboarding).toHaveBeenCalledWith(expect.objectContaining({ initialPresetId: "computer-use" }));
	});
	it("takes an existing fleet directly to the selected Worker creation flow", async () => {
		mocks.config.mockResolvedValue({ machines: [{ id: "existing", archived: false }] });
		const { default: OnboardingPage } = await import("@/app/onboarding/page");
		await expect(OnboardingPage({ searchParams: Promise.resolve({ preset: "computer-use" }) })).rejects.toThrow("REDIRECT:/dashboard/agents?preset=computer-use");
	});
	it("keeps the preset across the legacy Workers redirect and into the library", async () => {
		const { default: WorkersPage } = await import("@/app/dashboard/workers/page");
		await expect(WorkersPage({ searchParams: Promise.resolve({ preset: "deep-research" }) })).rejects.toThrow("REDIRECT:/dashboard/agents?preset=deep-research");
		const { default: AgentsPage } = await import("@/app/dashboard/agents/page");
		renderToStaticMarkup(await AgentsPage({ searchParams: Promise.resolve({ preset: "deep-research" }) }));
		expect(mocks.library).toHaveBeenCalledWith(expect.objectContaining({ initialPresetId: "deep-research" }));
	});
	it("does not hand an unknown template to either setup UI", async () => {
		const { default: OnboardingPage } = await import("@/app/onboarding/page");
		renderToStaticMarkup(await OnboardingPage({ searchParams: Promise.resolve({ preset: "not-a-template" }) }));
		expect(mocks.onboarding.mock.calls[0][0].initialPresetId).toBeUndefined();
		const { default: AgentsPage } = await import("@/app/dashboard/agents/page");
		renderToStaticMarkup(await AgentsPage({ searchParams: Promise.resolve({ preset: "not-a-template" }) }));
		expect(mocks.library.mock.calls[0][0].initialPresetId).toBeUndefined();
	});
});

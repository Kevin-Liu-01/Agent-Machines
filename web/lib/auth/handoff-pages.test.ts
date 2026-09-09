import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), provider: vi.fn(), onboarding: vi.fn(), library: vi.fn(), config: vi.fn(), clerkStatus: "ready" }));
vi.mock("@clerk/nextjs", () => ({
	SignIn: (props: unknown) => { mocks.signIn(props); return null; },
	ClerkProvider: (props: { children: React.ReactNode }) => { mocks.provider(props); return props.children; },
	ClerkLoading: ({ children }: { children: React.ReactNode }) => mocks.clerkStatus === "loading" ? children : null,
	ClerkFailed: ({ children }: { children: React.ReactNode }) => mocks.clerkStatus === "error" ? children : null,
	ClerkLoaded: ({ children }: { children: React.ReactNode }) => ["ready", "degraded"].includes(mocks.clerkStatus) ? children : null,
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
	mocks.clerkStatus = "ready";
	mocks.config.mockResolvedValue({ machines: [] });
});
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("mounted auth and setup route contracts", () => {
	it("shows an accessible loading state instead of an empty sign-in card", async () => {
		mocks.clerkStatus = "loading";
		const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
		const html = renderToStaticMarkup(await SignInPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }));
		expect(html).toContain('role="status"');
		expect(html).toContain("Connecting to secure sign-in");
		expect(html).not.toContain('role="alert"');
		expect(mocks.signIn).not.toHaveBeenCalled();
	});
	it("provides retry and home actions when Clerk cannot load without rendering the sign-in widget", async () => {
		mocks.clerkStatus = "error";
		const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
		const html = renderToStaticMarkup(await SignInPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ redirect_url: "/onboarding?preset=computer-use" }) }));
		expect(html).toContain('role="alert"');
		expect(html).toContain("Sign-in couldn’t connect");
		expect(html).toContain("Try again");
		expect(html).toContain('href="/"');
		expect(html).not.toContain("Connecting to secure sign-in");
		expect(mocks.signIn).not.toHaveBeenCalled();
	});
	it.each(["ready", "degraded"])("does not obscure a usable Clerk form in the %s state", async (status) => {
		mocks.clerkStatus = status;
		const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
		const html = renderToStaticMarkup(await SignInPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }));
		expect(html).not.toContain('role="alert"');
		expect(html).not.toContain("Connecting to secure sign-in");
		expect(mocks.signIn).toHaveBeenCalledOnce();
	});
	it("retries the current sign-in URL without discarding its step or destination", async () => {
		const reload = vi.fn();
		const href = "https://www.agent-machines.dev/sign-in/factor-one?redirect_url=%2Fonboarding%3Fpreset%3Dcomputer-use";
		vi.stubGlobal("window", { location: { href, reload } });
		const { SignInAvailability } = await import("@/components/SignInAvailability");
		let retry: (() => void) | undefined;
		function visit(node: React.ReactNode) {
			React.Children.forEach(node, (child) => {
				if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(child)) return;
				if (child.type === "button") retry = child.props.onClick;
				visit(child.props.children);
			});
		}
		visit(SignInAvailability({ children: null }));
		expect(retry).toBeTypeOf("function");
		retry!();
		expect(reload).toHaveBeenCalledOnce();
		expect(window.location.href).toBe(href);
	});
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

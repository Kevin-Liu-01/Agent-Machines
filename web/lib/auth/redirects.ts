export const AUTH_REDIRECTS = {
	signInFallbackRedirectUrl: "/dashboard",
	signUpFallbackRedirectUrl: "/onboarding",
} as const;

export type AuthSearchParams = Record<string, string | string[] | undefined>;

/** Only application destinations may survive an authentication handoff. */
export function safeAuthReturnTo(value: unknown): string | null {
	if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
	if (/[\\\u0000-\u0020\u007f]/.test(value)) return null;
	try {
		const url = new URL(value, "https://auth-return.invalid");
		if (url.origin !== "https://auth-return.invalid") return null;
		// Encoded path separators and dot segments must not change the route after auth.
		if (url.pathname.includes("%") || !/^\/(dashboard|onboarding)(\/|$)/.test(url.pathname)) return null;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return null;
	}
}

const REDIRECT_OVERRIDES = new Set([
	"sign_in_force_redirect_url",
	"sign_up_force_redirect_url",
	"sign_in_fallback_redirect_url",
	"sign_up_fallback_redirect_url",
]);

/** Clerk reads query redirects itself, so remove unsafe values before mounting it. */
export function signInCleanupRedirect(params: AuthSearchParams, segments: string[] = []): string | null {
	const cleaned = new URLSearchParams();
	let changed = false;
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		if (REDIRECT_OVERRIDES.has(key)) {
			changed = true;
			continue;
		}
		if (key === "redirect_url") {
			const safe = safeAuthReturnTo(value);
			if (safe !== value) changed = true;
			if (safe) cleaned.set(key, safe);
			continue;
		}
		for (const item of Array.isArray(value) ? value : [value]) cleaned.append(key, item);
	}
	if (!changed) return null;
	const path = ["/sign-in", ...segments.map(encodeURIComponent)].join("/");
	return cleaned.size ? `${path}?${cleaned}` : path;
}

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Auth gate for the dashboard surface and its API proxies.
 *
 * Public routes (`/`, `/sign-in/...`, `/api/health`) keep working without
 * auth. Anything under `/dashboard`, `/api/dashboard`, or `/api/chat` is
 * protected. Page requests get a 302 to `/sign-in` so the user lands in
 * the right place; API requests get a 401 JSON so client fetches surface
 * a clean error.
 *
 * The default behavior of `auth.protect()` in Clerk v7 is to rewrite to a
 * 404 page, which makes a signed-out user think the page doesn't exist.
 * We override that here for a friendlier UX.
 *
 * When Clerk env vars aren't set yet (initial Vercel deploy before the
 * user wires Clerk), we close the protected routes with a 503 explaining
 * what's missing and let public routes through. This means the marketing
 * landing always renders even before auth is configured.
 */
const isProtectedPage = createRouteMatcher(["/dashboard(.*)"]);
const isProtectedApi = createRouteMatcher([
	"/api/dashboard(.*)",
	"/api/chat(.*)",
]);

const CLERK_CONFIGURED = Boolean(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
		process.env.CLERK_SECRET_KEY,
);

const FALLBACK_MESSAGE =
	"Clerk is not configured on this deployment yet. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in the Vercel project env, then redeploy.";

const guarded = clerkMiddleware(async (auth, request) => {
	if (!isProtectedPage(request) && !isProtectedApi(request)) return;

	const { userId } = await auth();
	if (userId) return;

	if (isProtectedApi(request)) {
		return NextResponse.json(
			{ error: "unauthorized" },
			{ status: 401 },
		);
	}

	const signInUrl = new URL("/sign-in", request.url);
	signInUrl.searchParams.set("redirect_url", request.nextUrl.pathname);
	return NextResponse.redirect(signInUrl);
});

export default async function middleware(
	request: NextRequest,
	event: NextFetchEvent,
) {
	if (CLERK_CONFIGURED) return guarded(request, event);
	if (!isProtectedPage(request) && !isProtectedApi(request)) {
		return NextResponse.next();
	}
	if (isProtectedApi(request)) {
		return NextResponse.json(
			{ error: "auth_unconfigured", message: FALLBACK_MESSAGE },
			{ status: 503 },
		);
	}
	return new NextResponse(
		`<!doctype html><meta charset="utf-8"><title>Auth not configured</title>` +
			`<body style="font-family:ui-monospace,monospace;background:#09090b;color:#fafafa;padding:48px;line-height:1.6">` +
			`<h1 style="font-size:18px;margin:0 0 16px">Auth not configured</h1>` +
			`<p style="max-width:64ch;color:#a1a1aa">${FALLBACK_MESSAGE}</p>` +
			`<p style="margin-top:24px"><a href="/" style="color:#d2beff">&lt;- back to landing</a></p>` +
			`</body>`,
		{
			status: 503,
			headers: { "content-type": "text/html; charset=utf-8" },
		},
	);
}

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
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
 */
const isProtectedPage = createRouteMatcher(["/dashboard(.*)"]);
const isProtectedApi = createRouteMatcher([
	"/api/dashboard(.*)",
	"/api/chat(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
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

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};

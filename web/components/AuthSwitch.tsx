"use client";

import { Show } from "@clerk/nextjs";
import type { ReactNode } from "react";

/**
 * Thin wrappers around Clerk v7's `<Show when="signed-in" />` so the rest
 * of the codebase can keep reading like the older `<SignedIn>` /
 * `<SignedOut>` API without spreading the new control surface everywhere.
 *
 * When the publishable key isn't set (initial Vercel deploy before Clerk
 * is wired up), Clerk's provider isn't mounted and `<Show>` would crash.
 * We treat the missing-key case as "always signed out" so the public
 * landing renders correctly even before auth is configured.
 */
const CLERK_READY = Boolean(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export function SignedIn({ children }: { children: ReactNode }) {
	if (!CLERK_READY) return null;
	return <Show when="signed-in">{children}</Show>;
}

export function SignedOut({ children }: { children: ReactNode }) {
	if (!CLERK_READY) return <>{children}</>;
	return <Show when="signed-out">{children}</Show>;
}

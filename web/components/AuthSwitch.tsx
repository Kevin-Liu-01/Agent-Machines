"use client";

import { Show } from "@clerk/nextjs";
import type { ReactNode } from "react";

/**
 * Thin wrappers around Clerk v7's `<Show when="signed-in" />` so the rest
 * of the codebase can keep reading like the older `<SignedIn>` /
 * `<SignedOut>` API without spreading the new control surface everywhere.
 */
export function SignedIn({ children }: { children: ReactNode }) {
	return <Show when="signed-in">{children}</Show>;
}

export function SignedOut({ children }: { children: ReactNode }) {
	return <Show when="signed-out">{children}</Show>;
}

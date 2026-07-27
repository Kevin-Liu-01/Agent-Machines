"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

const CLERK_CONFIGURED = Boolean(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

/** Keep Clerk out of public routes; authenticated route groups opt in here. */
export function ClerkAppProvider({ children }: { children: ReactNode }) {
	if (!CLERK_CONFIGURED) return children;
	return (
		<ClerkProvider
			signInUrl="/sign-in"
			signInForceRedirectUrl="/dashboard"
			signUpForceRedirectUrl="/dashboard"
			afterSignOutUrl="/"
			appearance={{
				variables: {
					colorPrimary: "var(--ret-purple)",
					colorBackground: "var(--ret-bg)",
					colorText: "var(--ret-text)",
					colorTextSecondary: "var(--ret-text-dim)",
					colorMuted: "var(--ret-text-muted)",
					colorInputBackground: "var(--ret-bg-soft)",
					colorInputText: "var(--ret-text)",
					colorNeutral: "var(--ret-text)",
					borderRadius: "0px",
					fontFamily: "var(--font-sans)",
					fontSize: "14px",
				},
				elements: {
					card: "border border-[var(--ret-border)] bg-[var(--ret-surface)] shadow-none rounded-none",
					formFieldInput:
						"border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text)] rounded-none",
					formButtonPrimary:
						"bg-[var(--ret-accent)] text-[var(--ret-bg)] rounded-none hover:brightness-110",
					userButtonPopoverCard:
						"border border-[var(--ret-border)] bg-[var(--ret-surface)] shadow-none rounded-none",
					userButtonPopoverActionButton:
						"text-[var(--ret-text)] hover:bg-[var(--ret-surface-hover)]",
				},
			}}
		>
			{children}
		</ClerkProvider>
	);
}

"use client";

import { ClerkProvider, UserButton } from "@clerk/nextjs";

export function ClerkUserButton() {
	return (
		<ClerkProvider
			signInUrl="/sign-in"
			signInForceRedirectUrl="/dashboard"
			signUpForceRedirectUrl="/dashboard"
			afterSignOutUrl="/"
		>
			<UserButton
				appearance={{
					elements: {
						avatarBox: "h-7 w-7",
						userButtonPopoverCard:
							"border border-[var(--ret-border)] bg-[var(--ret-surface)] shadow-none rounded-none",
						userButtonPopoverActionButton:
							"text-[var(--ret-text)] hover:bg-[var(--ret-surface-hover)]",
					},
					variables: {
						colorPrimary: "var(--ret-purple)",
						colorBackground: "var(--ret-bg)",
						colorText: "var(--ret-text)",
						colorTextSecondary: "var(--ret-text-dim)",
						borderRadius: "0px",
						fontFamily: "var(--font-sans)",
					},
				}}
			/>
		</ClerkProvider>
	);
}

"use client";

import { UserButton } from "@clerk/nextjs";
import { ClerkAppProvider } from "@/components/ClerkAppProvider";

export function ClerkUserButton() {
	return (
		<ClerkAppProvider>
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
		</ClerkAppProvider>
	);
}

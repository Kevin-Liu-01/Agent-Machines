import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
	title: "Hermes Machines -- agent on Dedalus Machines",
	description:
		"A Hermes Agent deployed to a Dedalus microVM. Tools, scheduled crons, a bundled skill library, and the Cursor SDK wired in as an MCP tool for real code work.",
	openGraph: {
		title: "Hermes Machines",
		description:
			"An agent with a body that writes its own code. Hermes Agent + Dedalus Machines + Cursor SDK.",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Hermes Machines",
		description: "An agent with a body that writes its own code.",
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
					fontFamily: "var(--font-sans)",
					borderRadius: "10px",
				},
			}}
		>
			<html lang="en" suppressHydrationWarning>
				<body>
					{children}
					<div className="ret-grain" aria-hidden="true" />
				</body>
			</html>
		</ClerkProvider>
	);
}

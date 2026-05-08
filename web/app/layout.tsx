import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";

/**
 * Nacelle is the canonical Dedalus typeface. We load three weights
 * locally so the font ships with the bundle and never blocks paint on a
 * remote font server. The `--font-sans` CSS variable threads through
 * globals.css and Tailwind so every component picks it up automatically.
 */
const nacelle = localFont({
	src: [
		{ path: "../public/fonts/Nacelle-Regular.otf", weight: "400", style: "normal" },
		{ path: "../public/fonts/Nacelle-SemiBold.otf", weight: "600", style: "normal" },
		{ path: "../public/fonts/Nacelle-Bold.otf", weight: "700", style: "normal" },
	],
	variable: "--font-nacelle",
	display: "swap",
	preload: true,
});

export const metadata: Metadata = {
	title: "Agent Machines -- bring any agent to any provider",
	description:
		"Multi-tenant agent rig. Pick Hermes or OpenClaw, plug in a Dedalus / Vercel Sandbox / Fly key, and ship. Persistent chats and artifacts on Vercel Blob.",
	openGraph: {
		title: "Agent Machines",
		description:
			"Bring any agent (Hermes, OpenClaw) to any provider (Dedalus, Vercel Sandbox, Fly). Per-user fleets, persistent chats, artifacts.",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Agent Machines",
		description:
			"Bring any agent to any provider. Per-user fleets with persistent chats and artifacts.",
	},
};

const CLERK_CONFIGURED = Boolean(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default function RootLayout({ children }: { children: ReactNode }) {
	const tree = (
		<html lang="en" className={nacelle.variable} suppressHydrationWarning>
			<body>
				{children}
				<div className="ret-grain" aria-hidden="true" />
			</body>
		</html>
	);
	// When Clerk isn't configured (fresh Vercel deploy, no env vars yet) we
	// skip the provider entirely so the public landing still renders. The
	// middleware handles gating /dashboard/* with a 503 + setup message.
	if (!CLERK_CONFIGURED) return tree;
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
			{tree}
		</ClerkProvider>
	);
}

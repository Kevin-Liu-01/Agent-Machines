import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { SITE, TITLE_SEPARATOR } from "@/lib/seo/config";
import { buildRootJsonLd } from "@/lib/seo/json-ld";
import { readServerThemeAttrs } from "@/lib/theme/server";

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

/**
 * Instrument Serif italic for the wordmark only. A single weight, a
 * single style; we intentionally do not expose this as a default
 * typeface anywhere -- it's reserved for the brand wordmark in the
 * navbar so it reads as identity, not body copy.
 */
const instrumentSerif = Instrument_Serif({
	weight: "400",
	style: "italic",
	subsets: ["latin"],
	variable: "--font-display-serif",
	display: "swap",
});

export const metadata: Metadata = {
	metadataBase: new URL(SITE.url),
	title: {
		default: `${SITE.name}${TITLE_SEPARATOR}${SITE.tagline}`,
		template: `%s${TITLE_SEPARATOR}${SITE.name}`,
	},
	description: SITE.description,
	applicationName: SITE.name,
	authors: [{ name: SITE.authorName, url: SITE.authorUrl }],
	creator: SITE.authorName,
	publisher: SITE.name,
	keywords: [...SITE.keywords],
	category: "technology",
	alternates: { canonical: "/" },
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-image-preview": "large",
			"max-snippet": -1,
			"max-video-preview": -1,
		},
	},
	openGraph: {
		title: SITE.name,
		description: SITE.description,
		url: SITE.url,
		siteName: SITE.name,
		type: "website",
		locale: "en_US",
		// Image is registered automatically by app/opengraph-image.tsx
		// (Next.js convention) -- explicit images: [] would be overridden
		// anyway, so we omit it here to avoid duplicate <meta og:image>.
	},
	twitter: {
		card: "summary_large_image",
		site: SITE.twitterHandle,
		creator: SITE.twitterHandle,
		title: SITE.name,
		description: SITE.description,
	},
	icons: {
		icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
		apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
		shortcut: "/favicon.ico",
	},
	formatDetection: { email: false, address: false, telephone: false },
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#09090b" },
	],
	colorScheme: "light dark",
	width: "device-width",
	initialScale: 1,
};

const CLERK_CONFIGURED = Boolean(
	process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

export default async function RootLayout({ children }: { children: ReactNode }) {
	const jsonLd = buildRootJsonLd();
	const theme = await readServerThemeAttrs();

	return (
		<html
			lang="en"
			className={cn(
				nacelle.variable,
				instrumentSerif.variable,
				theme.htmlClassName,
			)}
			data-theme={theme.dataTheme}
			suppressHydrationWarning
		>
			<head>
				{/*
				  JSON-LD @graph injected directly in <head> (not via
				  client-side script) so AI crawlers like GPTBot, ClaudeBot,
				  PerplexityBot can resolve the schema in their first fetch
				  pass without executing JavaScript. One graph block keeps
				  Organization / Person / WebSite / SoftwareApplication /
				  FAQPage / BreadcrumbList in the same JSON-LD island and
				  cross-referenced via @id.
				*/}
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(jsonLd),
					}}
				/>
			</head>
			<body>
				{CLERK_CONFIGURED ? (
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
								socialButtonsBlockButton:
									"border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text)] rounded-none hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)]",
								socialButtonsIconButton:
									"border border-[var(--ret-border)] bg-[var(--ret-bg)] rounded-none hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)]",
								dividerLine: "bg-[var(--ret-border)]",
								formFieldInput:
									"border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text)] rounded-none",
								formButtonPrimary:
									"bg-[var(--ret-purple)] text-[#0F0F0F] rounded-none hover:brightness-110",
								userButtonPopoverCard:
									"border border-[var(--ret-border)] bg-[var(--ret-surface)] shadow-none rounded-none",
								userButtonPopoverActionButton:
									"text-[var(--ret-text)] hover:bg-[var(--ret-surface-hover)]",
							},
						}}
					>
						{children}
					</ClerkProvider>
				) : (
					children
				)}
				<div className="ret-grain" aria-hidden="true" />
			</body>
		</html>
	);
}

import { SignIn } from "@clerk/nextjs";

import { BrandMark } from "@/components/BrandMark";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WingBackground } from "@/components/WingBackground";

const CLERK_READY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Centered sign-in card that adopts the Reticle look.
 *
 * Clerk's appearance API takes raw CSS variable strings, which is exactly
 * how the rest of the design system is themed -- one source of truth, no
 * hex duplication. The card sits in a 100dvh frame so it works on both
 * large screens and Vercel's preview-pane embeds.
 *
 * When Clerk env vars aren't set yet (initial Vercel deploy before the
 * user wires Clerk), we render a setup-message card instead of `<SignIn>`
 * so the route doesn't crash.
 */
export default function SignInPage() {
	return (
		<main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--ret-bg)] px-6 py-16">
			{/*
			  Brand backdrop. Light theme renders the cloud-lines plate;
			  dark theme renders nyx-waves. WingBackground swaps via
			  Tailwind dark: variants -- no theme prop wiring needed.
			*/}
			<WingBackground variant="nyx-waves" />
			<div className="absolute right-5 top-5 z-20">
				<ThemeToggle />
			</div>
			<div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<BrandMark size={28} withLabel={false} />
					<ReticleLabel>AGENT MACHINES</ReticleLabel>
					<h1 className="text-2xl font-semibold tracking-tight">
						{CLERK_READY ? "Sign in to your fleet" : "Auth not configured"}
					</h1>
					<p className="max-w-[44ch] text-sm text-[var(--ret-text-dim)]">
						{CLERK_READY
							? "Your machines, chat history, and learned skills are scoped to your Clerk identity. Sign in once and your fleet follows you across devices."
							: "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in the Vercel project env, then redeploy."}
					</p>
				</div>
				{CLERK_READY ? (
					<SignIn
						routing="path"
						path="/sign-in"
						signUpUrl="/sign-in"
						forceRedirectUrl="/dashboard"
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
								rootBox: "w-full",
								card: "w-full border border-[var(--ret-border)] bg-[var(--ret-surface)] shadow-none rounded-none",
								logoBox: { display: "none" },
								logoImage: { display: "none" },
								headerTitle: "hidden",
								headerSubtitle: "hidden",
								// OAuth row
								socialButtons: "gap-2",
								socialButtonsBlockButton:
									"border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text)] rounded-none hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)]",
								socialButtonsBlockButtonText: "text-[var(--ret-text)]",
								socialButtonsIconButton:
									"border border-[var(--ret-border)] bg-[var(--ret-bg)] rounded-none hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)]",
								// Divider
								dividerLine: "bg-[var(--ret-border)]",
								dividerText: "text-[var(--ret-text-muted)]",
								// Form
								formFieldLabel:
									"text-[var(--ret-text)] font-mono text-[10px] uppercase tracking-[0.18em]",
								formFieldInput:
									"border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text)] rounded-none focus:border-[var(--ret-purple)] focus:ring-0",
								formButtonPrimary:
									"bg-[var(--ret-purple)] text-[#0F0F0F] font-medium rounded-none hover:brightness-110 hover:shadow-[0_0_24px_var(--ret-purple-glow)]",
								// Misc
								identityPreview:
									"border border-[var(--ret-border)] bg-[var(--ret-bg)] rounded-none",
								identityPreviewText: "text-[var(--ret-text)]",
								identityPreviewEditButtonIcon: "text-[var(--ret-purple)]",
								footer: "border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)]",
								footerAction: "text-[var(--ret-text-dim)]",
								footerActionLink:
									"text-[var(--ret-purple)] hover:text-[var(--ret-purple)]/80",
								alert: "border border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)] rounded-none",
								alertText: "text-[var(--ret-red)]",
							},
						}}
					/>
				) : (
					<a
						href="/"
						className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2 font-mono text-sm text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)]"
					>
						{"<- back to landing"}
					</a>
				)}
			</div>
		</main>
	);
}

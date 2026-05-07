import { SignIn } from "@clerk/nextjs";

import { ReticleLabel } from "@/components/reticle/ReticleLabel";

/**
 * Centered sign-in card that adopts the Reticle look.
 *
 * Clerk's appearance API takes raw CSS variable strings, which is exactly
 * how the rest of the design system is themed -- one source of truth, no
 * hex duplication. The card sits in a 100dvh frame so it works on both
 * large screens and Vercel's preview-pane embeds.
 */
export default function SignInPage() {
	return (
		<main className="flex min-h-[100dvh] items-center justify-center bg-[var(--ret-bg)] px-6 py-16">
			<div className="flex w-full max-w-md flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-2 text-center">
					<ReticleLabel>HERMES MACHINES</ReticleLabel>
					<h1 className="text-2xl font-semibold tracking-tight">
						Sign in to dashboard
					</h1>
					<p className="max-w-[40ch] text-sm text-[var(--ret-text-dim)]">
						The chat, MCP tools, and live machine state are gated behind a
						Clerk-managed allowlist.
					</p>
				</div>
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
							colorInputBackground: "var(--ret-bg)",
							colorInputText: "var(--ret-text)",
							borderRadius: "10px",
							fontFamily: "var(--font-sans)",
						},
						elements: {
							card: "border border-[var(--ret-border)] bg-[var(--ret-surface)] shadow-none",
							headerTitle: "hidden",
							headerSubtitle: "hidden",
							socialButtonsBlockButton:
								"border border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
							footerAction: "text-[var(--ret-text-dim)]",
						},
					}}
				/>
			</div>
		</main>
	);
}

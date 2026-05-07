import { SignIn } from "@clerk/nextjs";

import { BrandMark } from "@/components/BrandMark";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

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
		<main className="flex min-h-[100dvh] items-center justify-center bg-[var(--ret-bg)] px-6 py-16">
			<div className="flex w-full max-w-md flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<BrandMark size={28} withLabel={false} />
					<ReticleLabel>HERMES MACHINES</ReticleLabel>
					<h1 className="text-2xl font-semibold tracking-tight">
						{CLERK_READY ? "Sign in to dashboard" : "Auth not configured"}
					</h1>
					<p className="max-w-[40ch] text-sm text-[var(--ret-text-dim)]">
						{CLERK_READY
							? "The chat, MCP tools, and live machine state are gated behind a Clerk-managed allowlist."
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
				) : (
					<a
						href="/"
						className="rounded-md border border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2 font-mono text-sm text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)]"
					>
						{"<- back to landing"}
					</a>
				)}
			</div>
		</main>
	);
}

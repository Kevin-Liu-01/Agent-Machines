import { SignIn } from "@clerk/nextjs";

import { BrandMark } from "@/components/BrandMark";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ThemeToggle } from "@/components/ThemeToggle";

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
			  Two-layer brand backdrop, both rendered as low-opacity
			  cover-bg images behind the SignIn card. nyx-waves sits at
			  the bottom for the ambient wave texture; cloud-lines layers
			  over it for the structural wing-cloud lines. mix-blend-soft-
			  light keeps the layered images from saturating the dark bg.
			*/}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-[0.10] mix-blend-soft-light dark:opacity-[0.18]"
				style={{ backgroundImage: "url(/brand/bg-nyx-waves.png)" }}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-[0.07] mix-blend-soft-light dark:opacity-[0.12]"
				style={{ backgroundImage: "url(/brand/bg-cloud-lines.png)" }}
			/>
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
						className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2 font-mono text-sm text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)]"
					>
						{"<- back to landing"}
					</a>
				)}
			</div>
		</main>
	);
}

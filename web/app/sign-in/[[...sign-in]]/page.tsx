import Image from "next/image";

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
		<main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--ret-bg)] px-6 py-16">
			{/*
			  Two-layer backdrop:
			  1. wing-bg-nyx-waves: ambient wave texture covering the whole
			     viewport, ~6% opacity so it reads as a watermark, never
			     competes with copy.
			  2. wing-mark watermark: 720px centered behind the card, tiny
			     opacity so it ghosts behind the form.
			  Both pointer-events-none + z-0 so the SignIn card stays
			  fully interactive on top.
			*/}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-[0.06] dark:opacity-[0.10]"
				style={{ backgroundImage: "url(/brand/bg-nyx-waves.png)" }}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 opacity-[0.05] dark:opacity-[0.08]"
			>
				<Image
					src="/brand/wing-mark.png"
					alt=""
					fill
					sizes="720px"
					priority
					className="object-contain dark:hidden"
				/>
				<Image
					src="/brand/wing-mark-dark.png"
					alt=""
					fill
					sizes="720px"
					priority
					className="hidden object-contain dark:block"
				/>
			</div>
			<div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<BrandMark size={28} withLabel={false} />
					<ReticleLabel>AGENT MACHINES</ReticleLabel>
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
						className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2 font-mono text-sm text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)]"
					>
						{"<- back to landing"}
					</a>
				)}
			</div>
		</main>
	);
}

"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { ArrowLeft, LoaderCircle, RotateCw, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

/** Keep a failed authentication script from leaving an empty sign-in page. */
export function SignInAvailability({ children }: { children: ReactNode }) {
	return (
		<>
			<ClerkLoading>
				<div role="status" className="flex min-h-28 w-full items-center justify-center gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-6 text-sm text-[var(--ret-text-dim)]">
					<LoaderCircle size={18} aria-hidden="true" className="shrink-0 motion-safe:animate-spin" />
					Connecting to secure sign-in…
				</div>
			</ClerkLoading>
			<ClerkFailed>
				<section role="alert" className="w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-6">
					<ShieldAlert size={24} aria-hidden="true" className="mb-4 text-[var(--ret-text-dim)]" />
					<h2 className="text-lg font-semibold text-[var(--ret-text)]">Sign-in couldn’t connect</h2>
					<p className="mt-2 text-sm leading-relaxed text-[var(--ret-text-dim)]">
						We couldn’t load secure sign-in. Please try again shortly, or return to the homepage.
					</p>
					<div className="mt-5 flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="inline-flex min-h-11 items-center gap-2 bg-[var(--ret-accent)] px-4 text-sm font-medium text-[var(--ret-bg)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-accent)] motion-safe:active:scale-[0.97]"
						>
							<RotateCw size={15} aria-hidden="true" />
							Try again
						</button>
						<a href="/" className="inline-flex min-h-11 items-center gap-2 border border-[var(--ret-border)] px-4 text-sm text-[var(--ret-text)] hover:bg-[var(--ret-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-accent)] motion-safe:active:scale-[0.97]">
							<ArrowLeft size={15} aria-hidden="true" />
							Back to home
						</a>
					</div>
				</section>
			</ClerkFailed>
			<ClerkLoaded>{children}</ClerkLoaded>
		</>
	);
}

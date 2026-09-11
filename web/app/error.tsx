"use client";

import { useEffect } from "react";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { RefreshCcw, TriangleAlert } from "@/components/ui/icons";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	useEffect(() => { console.error("[page] render error:", error); }, [error]);
	return (
		<main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-5 px-5 py-16 text-center">
			<TriangleAlert className="size-8 text-[var(--ret-amber)]" aria-hidden="true" />
			<h1 className="ret-display text-3xl">Couldn’t load this page</h1>
			<p className="text-base leading-7 text-[var(--ret-text-dim)]">Try again, or return home to choose another page.</p>
			{error.digest ? <p className="max-w-full break-all text-sm text-[var(--ret-text-muted)]">Reference: {error.digest}</p> : null}
			<div className="flex flex-wrap justify-center gap-3">
				<ReticleButton onClick={reset}><RefreshCcw className="size-4" aria-hidden="true" />Try again</ReticleButton>
				<ReticleButton as="a" href="/" variant="secondary">Back to home</ReticleButton>
			</div>
		</main>
	);
}

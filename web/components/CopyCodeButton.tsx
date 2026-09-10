"use client";

import { Check, Copy, AlertCircle } from "@/components/ui/icons";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

type CopyState = "idle" | "copying" | "copied" | "error";

export function CopyCodeButton({ text, label = "Copy code" }: { text: string; label?: string }) {
	const [state, setState] = useState<CopyState>("idle");
	const pending = useRef(false);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => { mounted.current = false; };
	}, []);

	useEffect(() => {
		if (state !== "copied") return;
		const timeout = window.setTimeout(() => setState("idle"), 2000);
		return () => window.clearTimeout(timeout);
	}, [state]);

	async function copy() {
		if (pending.current) return;
		pending.current = true;
		setState("copying");
		try {
			await navigator.clipboard.writeText(text);
			if (mounted.current) setState("copied");
		} catch {
			if (mounted.current) setState("error");
		} finally {
			pending.current = false;
		}
	}

	const Icon = state === "copied" ? Check : state === "error" ? AlertCircle : Copy;
	const actionLabel = state === "error" ? `Try again: ${label}` : state === "copied" ? `Copied: ${label}` : state === "copying" ? `Copying: ${label}` : label;
	return (
		<div className={cn("flex flex-col items-end gap-1")}>
			<button
			type="button"
			onClick={() => void copy()}
			disabled={state === "copying"}
			aria-label={actionLabel}
			aria-busy={state === "copying"}
			className={cn(
				"inline-flex min-h-10 min-w-24 items-center justify-center gap-2 rounded-md border border-[var(--ret-border)]/60 bg-[var(--ret-bg)] px-3 text-xs font-medium text-[var(--ret-text-secondary)]",
				"cursor-pointer transition-[color,background-color,border-color,transform] duration-150 ease-[var(--ret-ease-out)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)] hover:text-[var(--ret-text)]",
				"motion-safe:active:[transform:scale(0.98)] focus-visible:active:[transform:none] focus-visible:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none",
				"disabled:cursor-wait disabled:opacity-60 disabled:transform-none",
			)}
		>
			<Icon size={15} strokeWidth={1.75} aria-hidden="true" />
			<span>{state === "copied" ? "Copied" : state === "copying" ? "Copying…" : state === "error" ? "Try again" : "Copy"}</span>
			</button>
			<span role="status" aria-live="polite" aria-atomic="true" className={cn(state === "error" ? "max-w-60 text-right text-xs leading-relaxed text-[var(--ret-text-dim)]" : "sr-only")}>
				{state === "copied" ? `${label}: copied to clipboard.` : state === "error" ? "Copy unavailable. Select the code to copy it manually." : ""}
			</span>
		</div>
	);
}

"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyCodeButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 1400);
		return () => window.clearTimeout(timeout);
	}, [copied]);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	}

	return (
		<button
			type="button"
			onClick={() => void copy()}
			className="ret-pressable inline-flex min-h-8 items-center gap-1.5 border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-secondary)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)] hover:text-[var(--ret-text)]"
			aria-label={copied ? "SDK example copied" : "Copy SDK example"}
		>
			{copied ? (
				<Check className="h-3.5 w-3.5" strokeWidth={1.75} />
			) : (
				<Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
			)}
			<span>{copied ? "copied" : "copy"}</span>
		</button>
	);
}

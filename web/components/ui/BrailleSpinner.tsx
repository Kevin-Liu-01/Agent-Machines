"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Braille Unicode loading indicator.
 *
 * Per the loading-screens skill in the wiki: braille spinners are the
 * canonical loading indicator across every Agent Machines surface. They render
 * as a single character that animates through a sequence of braille
 * patterns (or other Unicode block sequences for thematic variety).
 *
 * No SVG / CSS ring spinners. No `animate-spin` on bordered divs. No
 * Lucide `Loader2`. Always pair with a meaningful `label` prop or a
 * Skeleton elsewhere on the page so the user gets context, not just
 * motion.
 */

const FRAMES = {
	// Default: 8-position braille cycle. Smooth, subtle, accessible.
	braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
	// Search / indexing -- looks like a scanning bar.
	scan: ["⡀", "⡄", "⡆", "⡇", "⡏", "⡟", "⡿", "⢿", "⣿", "⣷", "⣧", "⣇", "⣆", "⣄", "⣀"],
	// Multi-step deploy. Reads as cascading dots.
	cascade: ["⠁", "⠃", "⠇", "⡇", "⣇", "⣧", "⣷", "⣿", "⣷", "⣧", "⣇", "⡇", "⠇", "⠃"],
	// Data processing / transforms. Reads as twisted helix.
	helix: ["⠁", "⠂", "⠄", "⡀", "⡈", "⡐", "⡠", "⣀", "⡠", "⡐", "⡈", "⡀", "⠄", "⠂"],
	// Status polling / sync. Reads as orbiting dot.
	orbit: ["⠁", "⠈", "⠐", "⠠", "⢀", "⡀", "⠄", "⠂"],
	// Idle waiting. Slow, gentle expansion.
	breathe: ["⠁", "⠉", "⠋", "⠓", "⠛", "⠫", "⠻", "⠿", "⠟", "⠏", "⠇", "⠃"],
} as const;

const INTERVAL_MS: Record<keyof typeof FRAMES, number> = {
	braille: 80,
	scan: 90,
	cascade: 90,
	helix: 100,
	orbit: 100,
	breathe: 140,
};

export type BrailleSpinnerName = keyof typeof FRAMES;

type Props = {
	name?: BrailleSpinnerName;
	label?: string;
	className?: string;
};

export function BrailleSpinner({
	name = "braille",
	label,
	className,
}: Props) {
	const frames = FRAMES[name];
	const interval = INTERVAL_MS[name];
	const [i, setI] = useState(0);

	useEffect(() => {
		// Honor `prefers-reduced-motion`. Static frame, but still announce
		// "loading" to assistive tech via the aria-label below.
		const reduce =
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduce) return;
		const id = window.setInterval(
			() => setI((prev) => (prev + 1) % frames.length),
			interval,
		);
		return () => window.clearInterval(id);
	}, [frames.length, interval]);

	const ariaLabel = label ? `${label} (loading)` : "Loading";

	return (
		<span
			role="status"
			aria-label={ariaLabel}
			className={cn(
				"inline-flex items-center gap-1.5 font-mono leading-none tabular-nums",
				className,
			)}
		>
			<span aria-hidden="true">{frames[i]}</span>
			{label ? <span>{label}</span> : null}
		</span>
	);
}

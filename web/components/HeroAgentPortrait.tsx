"use client";

import dynamic from "next/dynamic";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

/**
 * Client-only agent bust portrait shown on the landing hero.
 *
 * Lives in its own client component because `next/dynamic` with
 * `ssr: false` isn't allowed inside server components -- HeroBlock
 * stays a client component for the toggle state but the WebGL scene
 * import still has to be isolated to a leaf client component.
 *
 * Visual: a 76x76 square wireframe canvas (sized to match the
 * heading height exactly) with three corner cross marks and a
 * dual-mark identity chip in the bottom-left. The active agent's
 * mark is fully visible; the other is dimmed. The default-vs-
 * preview state is conveyed by the canvas border color (neutral
 * for default Hermes, purple glow for preview OpenClaw) -- at this
 * canvas size there's no room for a text badge.
 *
 * Clicking the canvas calls `onToggle` so the parent can swap which
 * mark is active and update the hero subheader tagline in lockstep.
 *
 * Until a dedicated OpenClaw diorama lands, both agents share the
 * Hermes wireframe scene; the marks + accent border carry the
 * agent identity instead.
 */

const HermesBustScene = dynamic(
	() => import("@/components/three").then((m) => m.HermesBustScene),
	{ ssr: false, loading: () => null },
);

export type HeroAgent = "hermes" | "openclaw";

type Props = {
	agent: HeroAgent;
	onToggle: () => void;
};

const META: Record<
	HeroAgent,
	{
		label: string;
		mark: "nous" | "openclaw";
		isDefault: boolean;
	}
> = {
	hermes: {
		label: "Hermes",
		mark: "nous",
		isDefault: true,
	},
	openclaw: {
		label: "OpenClaw",
		mark: "openclaw",
		isDefault: false,
	},
};

export function HeroAgentPortrait({ agent, onToggle }: Props) {
	const meta = META[agent];
	const otherLabel = META[agent === "hermes" ? "openclaw" : "hermes"].label;

	return (
		<button
			type="button"
			onClick={onToggle}
			aria-label={`Preview ${otherLabel} agent`}
			title={`Click to preview ${otherLabel}`}
			className={cn(
				// Square portrait sized to match the heading's exact
				// natural height. The hero heading is two lines of
				// `md:text-[36px] leading-[1.05]`, so 2 * 36 * 1.05 ~=
				// 76px. We use h-[76px] (square) so the portrait
				// visually flush-aligns with both the top and bottom
				// of the heading. `aspect-square + self-stretch` is
				// flaky in Chromium when no explicit dimension is set
				// on either axis -- the canvas inflates -- so we pin
				// the height instead. If the heading font size
				// changes, update this px to match `2 * fontSize *
				// lineHeight` (round to nearest 4px).
				"group relative hidden h-[76px] w-[76px] shrink-0 overflow-hidden border bg-[var(--ret-bg-soft)] transition-colors duration-200 lg:block",
				"focus:outline-none focus:ring-1 focus:ring-[var(--ret-purple)]/60",
				meta.isDefault
					? "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]"
					: "border-[var(--ret-purple)]/55 shadow-[0_0_24px_var(--ret-purple-glow)] hover:border-[var(--ret-purple)]",
			)}
		>
			<HermesBustScene className="h-full w-full" />

			{/* Three corner crosses (top-left, top-right, bottom-right)
			    pin the canvas into the Reticle grid. The bottom-left
			    corner belongs to the identity chip below. Sized down
			    to h-1.5 w-1.5 so they read as structural marks at this
			    canvas scale instead of dominant graphics. */}
			<span className="pointer-events-none absolute left-1 top-1 h-1.5 w-1.5 border-l border-t border-[var(--ret-cross)]" />
			<span className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 border-r border-t border-[var(--ret-cross)]" />
			<span className="pointer-events-none absolute bottom-1 right-1 h-1.5 w-1.5 border-b border-r border-[var(--ret-cross)]" />

			{/* State indicator: a small colored dot in the top-right
			    instead of a text badge. Green = default (Hermes),
			    purple = preview (OpenClaw). The canvas border colors
			    repeat the same signal at the frame level. */}
			<span
				className={cn(
					"pointer-events-none absolute right-1.5 top-1.5 z-10 h-1.5 w-1.5",
					meta.isDefault
						? "bg-[var(--ret-green)]"
						: "bg-[var(--ret-purple)]",
				)}
				aria-hidden="true"
			/>

			{/* Identity chip: both partner marks side by side in the
			    bottom-left of the canvas. Active mark is full opacity,
			    inactive dims to 40%. Clicking anywhere on the canvas
			    (this whole element is a button) flips which mark is
			    active. */}
			<span className="pointer-events-none absolute bottom-1 left-1 z-10 flex items-center gap-px border border-[var(--ret-border)] bg-[var(--ret-bg)]/90 px-0.5 py-px backdrop-blur-sm">
				<span
					className={cn(
						"flex h-2.5 w-2.5 items-center justify-center transition-opacity",
						agent === "hermes"
							? "text-[var(--ret-text)] opacity-100"
							: "text-[var(--ret-text-muted)] opacity-40",
					)}
					aria-hidden="true"
				>
					<Logo mark="nous" size={9} />
				</span>
				<span
					className={cn(
						"flex h-2.5 w-2.5 items-center justify-center transition-opacity",
						agent === "openclaw"
							? "text-[var(--ret-text)] opacity-100"
							: "text-[var(--ret-text-muted)] opacity-40",
					)}
					aria-hidden="true"
				>
					<Logo mark="openclaw" size={9} />
				</span>
			</span>
		</button>
	);
}

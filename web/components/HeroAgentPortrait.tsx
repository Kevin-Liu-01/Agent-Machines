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
 * Visual: a square wireframe canvas with cross-mark corners, the
 * "default" / "preview" badge top-right, and the dual partner logos
 * (Nous + OpenClaw) overlaid in the bottom-left. The active agent's
 * mark is filled and outlined; the other is dimmed. Clicking the
 * canvas calls `onToggle` so the parent can swap which mark is
 * "active" and update the hero subheader tagline in lockstep.
 *
 * Until a dedicated OpenClaw diorama lands, both agents share the
 * Hermes wireframe scene; the marks + badge + caption + accent
 * border carry the agent identity instead.
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
				"group relative hidden aspect-square w-[170px] shrink-0 overflow-hidden border bg-[var(--ret-bg-soft)] transition-colors duration-200 lg:block",
				"focus:outline-none focus:ring-1 focus:ring-[var(--ret-purple)]/60",
				meta.isDefault
					? "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]"
					: "border-[var(--ret-purple)]/55 shadow-[0_0_24px_var(--ret-purple-glow)] hover:border-[var(--ret-purple)]",
			)}
		>
			<HermesBustScene className="h-full w-full" />

			{/* Cross marks on the four corners pin the canvas into the
			    Reticle grid -- same treatment as the dashboard
			    IDENTITY card. Kept at top-left, top-right, and
			    bottom-right; the bottom-left corner is replaced by the
			    dual-mark identity chip below. */}
			<span className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t border-[var(--ret-cross)]" />
			<span className="pointer-events-none absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t border-[var(--ret-cross)]" />
			<span className="pointer-events-none absolute bottom-1.5 right-1.5 h-2.5 w-2.5 border-b border-r border-[var(--ret-cross)]" />

			{/* Status badge: default for Hermes, preview for OpenClaw.
			    Moved from top-left to top-right so the bottom-left
			    identity chip has clean space to live in. */}
			<span
				className={cn(
					"pointer-events-none absolute right-1.5 top-1.5 z-10 border px-1 py-px font-mono text-[8px] uppercase tracking-[0.22em]",
					meta.isDefault
						? "border-[var(--ret-green)]/45 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
						: "border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]",
				)}
			>
				{meta.isDefault ? "default" : "preview"}
			</span>

			{/* Identity chip: both partner marks side by side in the
			    bottom-left of the canvas. Active mark is fully visible
			    with a tonal panel behind it; inactive mark dims to
			    half opacity. Clicking anywhere on the canvas (this
			    whole element is a button) flips which mark is
			    active. */}
			<span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 flex items-center gap-0.5 border border-[var(--ret-border)] bg-[var(--ret-bg)]/85 px-1 py-0.5 backdrop-blur-sm">
				<span
					className={cn(
						"flex h-3.5 w-3.5 items-center justify-center transition-opacity",
						agent === "hermes"
							? "text-[var(--ret-text)] opacity-100"
							: "text-[var(--ret-text-muted)] opacity-40",
					)}
					aria-hidden="true"
				>
					<Logo mark="nous" size={11} />
				</span>
				<span
					className={cn(
						"flex h-3.5 w-3.5 items-center justify-center transition-opacity",
						agent === "openclaw"
							? "text-[var(--ret-text)] opacity-100"
							: "text-[var(--ret-text-muted)] opacity-40",
					)}
					aria-hidden="true"
				>
					<Logo mark="openclaw" size={11} />
				</span>
			</span>

			{/* Click affordance: small "tap" pill in the upper area
			    above the badge fades in on hover. Bottom-right
			    position would conflict with the corner cross. */}
			<span className="pointer-events-none absolute bottom-1.5 right-7 z-10 flex items-center gap-1 border border-[var(--ret-border)] bg-[var(--ret-bg)]/85 px-1 py-px font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
				<svg
					viewBox="0 0 10 10"
					className="h-2 w-2"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.4"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M2 4l-1 1 1 1M8 6l1-1-1-1M2 5h7" />
				</svg>
				tap
			</span>
		</button>
	);
}

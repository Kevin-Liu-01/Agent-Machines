import type { SVGProps } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { cn } from "@/lib/cn";

type ProviderChip = { mark: Mark; label: string };

// One renderer (Logo) for every substrate so each mark uses its correct
// per-brand tone — including Vercel's theme-adaptive triangle.
const PROVIDERS: ReadonlyArray<ProviderChip> = [
	{ mark: "e2b", label: "E2B" },
	{ mark: "sprites", label: "Sprites" },
	{ mark: "dedalus", label: "Dedalus" },
	{ mark: "vercel", label: "Vercel" },
];

function IconArrowRight(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
			<path
				d="M3 8h10M9 4l4 4-4 4"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ProviderRouteBanner() {
	return (
		<a
			href="/dashboard/setup"
			className={cn(
				"group/banner relative flex items-center gap-2",
				"border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-1.5",
				"transition-colors hover:bg-[var(--ret-surface)] sm:gap-3 md:px-2.5",
			)}
		>
			<span className="pointer-events-none absolute left-1 top-1 h-1 w-1 border-l border-t border-[var(--ret-cross)] opacity-40" />
			<span className="pointer-events-none absolute bottom-1 left-1 h-1 w-1 border-b border-l border-[var(--ret-cross)] opacity-40" />
			<span className="pointer-events-none absolute right-1 top-1 h-1 w-1 border-r border-t border-[var(--ret-cross)] opacity-40" />
			<span className="pointer-events-none absolute bottom-1 right-1 h-1 w-1 border-b border-r border-[var(--ret-cross)] opacity-40" />

			<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden md:gap-2.5">
				<div className="flex shrink-0 items-center gap-1">
					{PROVIDERS.map((provider) => (
						<span
							key={provider.label}
							className={cn(
								"inline-flex items-center gap-1.5 border border-[var(--ret-border)]",
								"bg-[var(--ret-bg)] px-1.5 py-0.5 transition-colors",
								"group-hover/banner:border-[var(--ret-border)]",
							)}
						>
							<Logo mark={provider.mark} size={16} />
							<span className="text-[11px] font-normal leading-none text-[var(--ret-text)]">
								{provider.label}
							</span>
						</span>
					))}
				</div>

				<p className="hidden min-w-0 truncate text-[11px] font-normal leading-snug text-[var(--ret-text-dim)] lg:block">
					Pair runtime and machine lane in one account. Spin up persistent
					workers with tools, then watch the fleet from one dashboard.
				</p>
			</div>

			<span
				className={cn(
					"ml-auto inline-flex shrink-0 items-center gap-1",
					"border border-[var(--ret-purple)]/25 bg-[var(--ret-purple-glow)] px-2 py-0.5",
					"text-[9px] font-normal uppercase tracking-[0.14em] text-[var(--ret-purple)]",
					"transition-colors group-hover/banner:border-[var(--ret-purple)]/45 group-hover/banner:bg-[var(--ret-purple)]/12",
				)}
			>
				Launch
				<IconArrowRight className="h-2.5 w-2.5 transition-transform group-hover/banner:translate-x-0.5" />
			</span>
		</a>
	);
}

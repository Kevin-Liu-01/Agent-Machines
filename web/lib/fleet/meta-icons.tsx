import type { ReactElement, SVGProps } from "react";

import { cn } from "@/lib/cn";

type IconProps = SVGProps<SVGSVGElement>;

export type MetaGlyphKind = "spec" | "created" | "machine-id" | "gateway";

const GLYPHS: Record<MetaGlyphKind, (props: IconProps) => ReactElement> = {
	spec: (p) => (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...p}
		>
			<rect x="4" y="4" width="16" height="16" rx="2" />
			<rect x="9" y="9" width="6" height="6" />
			<path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
		</svg>
	),
	created: (p) => (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...p}
		>
			<rect x="3" y="4" width="18" height="18" rx="2" />
			<line x1="16" y1="2" x2="16" y2="6" />
			<line x1="8" y1="2" x2="8" y2="6" />
			<line x1="3" y1="10" x2="21" y2="10" />
			<path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
		</svg>
	),
	"machine-id": (p) => (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...p}
		>
			<path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
			<polyline points="14 2 14 8 20 8" />
			<path d="M5 13h6M5 17h4M5 9h8" />
		</svg>
	),
	gateway: (p) => (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...p}
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="2" y1="12" x2="22" y2="12" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	),
};

export function MetaGlyph({
	kind,
	size = 12,
	className,
}: {
	kind: MetaGlyphKind;
	size?: number;
	className?: string;
}) {
	const Icon = GLYPHS[kind];
	return (
		<Icon
			className={cn("shrink-0 text-[var(--ret-text-dim)]", className)}
			width={size}
			height={size}
			aria-hidden
		/>
	);
}

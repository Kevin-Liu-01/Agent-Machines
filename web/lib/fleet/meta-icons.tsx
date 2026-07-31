import {
	CalendarDays,
	Cpu,
	Fingerprint,
	Network,
	type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

export type MetaGlyphKind = "spec" | "created" | "machine-id" | "gateway";

const GLYPHS: Record<MetaGlyphKind, LucideIcon> = {
	spec: Cpu,
	created: CalendarDays,
	"machine-id": Fingerprint,
	gateway: Network,
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
			strokeWidth={1.75}
			aria-hidden
		/>
	);
}

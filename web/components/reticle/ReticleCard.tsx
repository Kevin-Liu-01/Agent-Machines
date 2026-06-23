import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
	hoverable?: boolean;
	as?: "div" | "li" | "article";
};

/**
 * Bordered surface with the canonical 10px corner radius. Hover lifts the
 * border to `--ret-border-hover` to signal interactivity without changing
 * structure.
 */
export function ReticleCard({
	children,
	className,
	hoverable = true,
	as: Tag = "div",
}: Props) {
	return (
		<Tag
			className={cn(
				"border border-[var(--ret-border)] bg-[var(--ret-surface)]",
				hoverable &&
					"ret-interactive-card hover:border-[var(--ret-border-hover)]",
				className,
			)}
		>
			{children}
		</Tag>
	);
}

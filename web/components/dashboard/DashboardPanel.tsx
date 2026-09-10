import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "frame" | "cellGrid" | "strip";

const VARIANT_CLASS: Record<Variant, string> = {
	frame: "border border-[var(--ret-border)] bg-[var(--ret-bg)]",
	cellGrid:
		"overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]",
	strip: "border-y border-[var(--ret-border)] bg-[var(--ret-bg)]",
};

/**
 * Canonical dashboard panel vocabulary.
 *
 * `frame` is for standalone cards. `cellGrid` is for gap-px metric
 * matrices. `strip` is for full-width controls. Keep padding on the
 * child content, not on the panel shell, so nested hairlines stay exact.
 */
export function DashboardPanel({
	variant = "frame",
	children,
	className,
}: {
	variant?: Variant;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("min-w-0", VARIANT_CLASS[variant], className)}>
			{children}
		</section>
	);
}

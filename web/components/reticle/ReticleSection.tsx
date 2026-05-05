import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	borderTop?: boolean;
	borderBottom?: boolean;
	as?: "section" | "div" | "header" | "footer" | "main";
	id?: string;
};

/**
 * A page section. Inside a <ReticlePageGrid> this renders only the content
 * with optional border-top/bottom -- the parent grid provides the rails. The
 * outer rails of every section line up exactly because they share the parent.
 */
export function ReticleSection({
	children,
	className,
	contentClassName = "px-6 py-12 md:py-16",
	borderTop = true,
	borderBottom = false,
	as: Tag = "section",
	id,
}: Props) {
	return (
		<Tag id={id} className={cn("relative", className)}>
			<div
				className={cn(
					borderTop && "border-t border-[var(--ret-border)]",
					borderBottom && "border-b border-[var(--ret-border)]",
					contentClassName,
				)}
			>
				{children}
			</div>
		</Tag>
	);
}

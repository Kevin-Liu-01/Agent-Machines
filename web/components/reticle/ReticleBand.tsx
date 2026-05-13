import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	as?: "section" | "div" | "header" | "footer";
	id?: string;
	style?: CSSProperties;
};

/**
 * Full-viewport-width strip. No borders — separation between sections
 * is handled exclusively by `<ReticleSpacer>`. The content is constrained
 * to viewport minus the fixed gutters, same as `ReticleSection`.
 */
export function ReticleBand({
	children,
	className,
	contentClassName = "px-6 py-6 md:py-8",
	as: Tag = "div",
	id,
	style,
}: Props) {
	return (
		<Tag
			id={id}
			className={cn("relative w-full", className)}
			style={style}
		>
			<div
				className={cn(
					"relative z-10 mx-auto w-full max-w-[var(--ret-content-max)] bg-[var(--ret-bg)]",
					contentClassName,
				)}
			>
				{children}
			</div>
		</Tag>
	);
}

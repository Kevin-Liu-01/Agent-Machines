import type { CSSProperties, ReactNode } from "react";

import { WingBackground } from "@/components/WingBackground";
import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	/**
	 * Background hatching behind the inner content column.
	 */
	background?:
		| "none"
		| "hatch"
		| "wing-cloud"
		| "wing-nyx-lines"
		| "wing-nyx-waves";
	as?: "section" | "div" | "header" | "footer" | "main";
	id?: string;
};

const SECTION_HATCH =
	"repeating-linear-gradient(135deg, var(--ret-rail) 0 1px, transparent 1px 5px)";

const WING_VARIANT: Record<
	"wing-cloud" | "wing-nyx-lines" | "wing-nyx-waves",
	"cloud" | "nyx-lines" | "nyx-waves"
> = {
	"wing-cloud": "cloud",
	"wing-nyx-lines": "nyx-lines",
	"wing-nyx-waves": "nyx-waves",
};

/**
 * A page section. No borders — separation is handled by `<ReticleSpacer>`.
 * The inner content is constrained to the viewport minus gutters and
 * centered. Paints `--ret-bg` so the page-grid gutter hatching stops
 * cleanly at the rails.
 */
export function ReticleSection({
	children,
	className,
	contentClassName = "px-6 py-14 md:py-16",
	background = "none",
	as: Tag = "section",
	id,
}: Props) {
	const isHatch = background === "hatch";
	const isWing =
		background === "wing-cloud" ||
		background === "wing-nyx-lines" ||
		background === "wing-nyx-waves";
	const innerStyle: CSSProperties = isHatch
		? { backgroundImage: SECTION_HATCH }
		: {};
	return (
		<Tag
			id={id}
			className={cn("relative", className)}
		>
			{isWing && (
				<WingBackground
					variant={WING_VARIANT[background]}
					opacity={{ light: 0.45, dark: 0.30 }}
				/>
			)}
			<div
				className={cn(
					"relative z-10 mx-auto w-full max-w-[var(--ret-content-max)]",
					isHatch || isWing ? null : "bg-[var(--ret-bg)]",
					contentClassName,
				)}
				style={innerStyle}
			>
				{children}
			</div>
		</Tag>
	);
}

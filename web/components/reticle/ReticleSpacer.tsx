import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";

import { ReticleCross } from "./ReticleCross";

type Props = {
	className?: string;
	/** Height of the hatched fill area (only applies when hatch=true). */
	height?: number;
	corners?: boolean;
	/** Fill the spacer with diagonal hatch. Default false (single hairline). */
	hatch?: boolean;
};

const CROSS_LEFT = "calc(50% - var(--ret-content-max) / 2 - 5px)";
const CROSS_RIGHT = "calc(50% - var(--ret-content-max) / 2 - 5px)";

/**
 * Section divider. Two modes:
 *
 * - `hatch=false` (default): single full-width hairline + cross marks.
 * - `hatch=true`: two hairlines bounding a hatched strip.
 */
export function ReticleSpacer({
	className,
	height = 20,
	corners = true,
	hatch = false,
}: Props) {
	return (
		<div
			className={cn(
				"relative w-full border-y border-[var(--ret-border)]",
				className,
			)}
			style={{ height: `${height}px` }}
			aria-hidden="true"
		>
			{hatch && (
				<div
					className="absolute inset-0 opacity-60"
					style={{
						backgroundImage:
							"repeating-linear-gradient(45deg, var(--ret-rail) 0 1px, transparent 1px 6px)",
					}}
				/>
			)}
			{corners && (
				<>
					<ReticleCross
						className="absolute z-20"
						style={{ top: "-5px", left: CROSS_LEFT }}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{ top: "-5px", right: CROSS_RIGHT }}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{ bottom: "-5px", left: CROSS_LEFT }}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{ bottom: "-5px", right: CROSS_RIGHT }}
					/>
				</>
			)}
		</div>
	);
}

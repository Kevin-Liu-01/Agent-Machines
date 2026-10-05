import { cn } from "@/lib/cn";

import { ReticleCross } from "./ReticleCross";
import { RETICLE_SIZES } from "./constants";

type Props = {
	className?: string;
	/** Height of the strip between section boundaries. */
	height?: number;
	corners?: boolean;
	/** Fill the spacer with diagonal hatch. Default false (empty strip). */
	hatch?: boolean;
};

// Absolute positioning starts inside the border; align to its stroke center.
const CROSS_OFFSET = RETICLE_SIZES.crossArm + RETICLE_SIZES.hairline / 2;
const CROSS_EDGE = `calc(50% - var(--ret-content-max) / 2 - ${CROSS_OFFSET}px)`;

/**
 * Section divider. Two modes:
 *
 * - `hatch=false` (default): empty strip bounded by hairlines + cross marks.
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
						style={{ top: `-${CROSS_OFFSET}px`, left: CROSS_EDGE }}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{ top: `-${CROSS_OFFSET}px`, right: CROSS_EDGE }}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{ bottom: `-${CROSS_OFFSET}px`, left: CROSS_EDGE }}
					/>
					<ReticleCross
						className="absolute z-20"
						style={{ bottom: `-${CROSS_OFFSET}px`, right: CROSS_EDGE }}
					/>
				</>
			)}
		</div>
	);
}

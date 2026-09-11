import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { gearPath } from "@/lib/marketing/worker-gears";

/** Small, static hardware details. The full Worker engine owns the motion. */
export function BearingIcon({ children, gear = false }: { children: ReactNode; gear?: boolean }) {
	return (
		<span aria-hidden="true" className={cn("pointer-events-none relative inline-grid size-11 shrink-0 place-items-center text-[var(--ret-text-dim)]")}>
			<svg viewBox="-64 -64 128 128" fill="none" focusable="false" className={cn("absolute inset-0 size-full text-[var(--ret-text-muted)] opacity-45")}>
				{gear ? <path d={gearPath(18)} stroke="currentColor" strokeWidth="2" /> : <circle r="56" stroke="currentColor" strokeWidth="2" />}
				<circle r="44" stroke="currentColor" strokeWidth="1.5" />
				<path d="M-35-35l4 4m66-4-4 4m4 66-4-4m-66 4 4-4" stroke="currentColor" strokeWidth="3" />
			</svg>
			<span className={cn("relative grid place-items-center")}>{children}</span>
		</span>
	);
}

/** A two-wheel cutaway, with matching pitch and a tooth opposite a gap. */
export function GearDetail() {
	return (
		<svg aria-hidden="true" focusable="false" viewBox="0 0 216 144" fill="none" className={cn("pointer-events-none h-20 w-30 shrink-0 text-[var(--ret-text-muted)] opacity-45")}>
			<g transform="translate(70 79)">
				<path d={gearPath(18)} stroke="currentColor" strokeWidth="1.5" />
				<circle r="43" stroke="currentColor" strokeWidth="3" />
				<circle r="34" stroke="currentColor" strokeWidth="1" />
				<path d="M0-9v-33M8 4l28 17M-8 4l-28 17" stroke="currentColor" strokeWidth="4" />
				<circle r="9" stroke="currentColor" strokeWidth="2" />
				<circle r="3" fill="currentColor" />
			</g>
			<g transform="translate(163.75 79) rotate(15)">
				<path d={gearPath(12)} stroke="currentColor" strokeWidth="1.5" />
				<circle r="25" stroke="currentColor" strokeWidth="2" />
				<path d="M0-7v-18M7 0h18M0 7v18M-7 0h-18" stroke="currentColor" strokeWidth="3" />
				<circle r="7" stroke="currentColor" strokeWidth="2" />
				<circle r="2" fill="currentColor" />
			</g>
		</svg>
	);
}

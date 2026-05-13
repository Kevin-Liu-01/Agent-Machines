"use client";

import {
	createContext,
	useContext,
	type CSSProperties,
	type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

import { RETICLE_SIZES } from "./constants";

const PageGridContext = createContext(false);

export function useIsInsidePageGrid(): boolean {
	return useContext(PageGridContext);
}

type Props = {
	children: ReactNode;
	className?: string;
	contentMax?: number;
};

const MARGIN_HATCH =
	"repeating-linear-gradient(45deg, var(--ret-rail) 0 1px, transparent 1px 6px)";

export function ReticlePageGrid({
	children,
	className,
	contentMax = RETICLE_SIZES.contentMax,
}: Props) {
	const style = {
		"--ret-content-max": `${contentMax}px`,
	} as CSSProperties;
	return (
		<PageGridContext.Provider value={true}>
			<div
				className={cn("relative min-h-[100dvh] bg-[var(--ret-bg)]", className)}
				style={style}
			>
				{/* Left margin hatch: fixed 4rem, hugs the left edge of the content area */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 bottom-0 z-[2] w-[var(--ret-rail-offset)] border-x border-[var(--ret-border)]"
					style={{
						right: "calc(var(--ret-content-max) + var(--ret-rail-offset))",
						left: "calc(50% - var(--ret-content-max) / 2 - var(--ret-rail-offset))",
						backgroundImage: MARGIN_HATCH,
					}}
				/>
				{/* Right margin hatch: fixed 4rem, hugs the right edge of the content area */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 bottom-0 z-[2] w-[var(--ret-rail-offset)] border-x border-[var(--ret-border)]"
					style={{
						left: "calc(50% + var(--ret-content-max) / 2)",
						backgroundImage: MARGIN_HATCH,
					}}
				/>

				{/* Content area: max-width capped, centered, full-width lines extend through */}
				<div className="relative z-[1] flex flex-col">{children}</div>
			</div>
		</PageGridContext.Provider>
	);
}

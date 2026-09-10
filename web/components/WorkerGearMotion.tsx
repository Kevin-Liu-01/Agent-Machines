"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Cog } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** One play state for every CSS gear, so pausing never resets their phase. */
export function WorkerGearMotion({ children }: { children: ReactNode }) {
	const root = useRef<HTMLDivElement>(null);
	const [enabled, setEnabled] = useState(true);
	const [intersecting, setIntersecting] = useState(false);
	const [documentVisible, setDocumentVisible] = useState(false);

	useEffect(() => {
		const element = root.current;
		if (!element) return;

		const updateVisibility = () => setDocumentVisible(document.visibilityState !== "hidden");
		updateVisibility();
		document.addEventListener("visibilitychange", updateVisibility);

		// Stay paused when intersection observation is unavailable. The complete
		// static diagram remains useful, including before hydration.
		const observer = typeof window.IntersectionObserver === "function"
			? new window.IntersectionObserver(([entry]) => {
				setIntersecting(entry?.isIntersecting ?? false);
			}, { threshold: 0 })
			: null;
		observer?.observe(element);

		return () => {
			observer?.disconnect();
			document.removeEventListener("visibilitychange", updateVisibility);
		};
	}, []);

	return (
		<div
			ref={root}
			data-gear-motion={enabled && intersecting && documentVisible ? "running" : "paused"}
			className={cn("group/engine min-w-0")}
		>
			<div className={cn("mb-3 flex min-h-11 items-center justify-end")}>
				<label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-[var(--ret-text-dim)] motion-reduce:hidden")}>
					<input
						type="checkbox"
						checked={enabled}
						onChange={(event) => setEnabled(event.currentTarget.checked)}
						className={cn("size-4 shrink-0 cursor-pointer accent-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-text)]")}
					/>
					<Cog size={16} aria-hidden="true" />
					<span>Animate engine</span>
				</label>
				<p className={cn("hidden items-center gap-2 text-sm text-[var(--ret-text-muted)] motion-reduce:inline-flex")}>
					<Cog size={16} aria-hidden="true" />
					Reduced motion
				</p>
			</div>
			{children}
		</div>
	);
}

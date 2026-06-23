"use client";

import {
	type CSSProperties,
	type RefObject,
	useLayoutEffect,
	useState,
} from "react";

type Options<T extends HTMLElement> = {
	anchorRef: RefObject<T | null>;
	enabled: boolean;
	open: boolean;
	width: number;
	gutter?: number;
};

export function useSidebarPopoverStyle<T extends HTMLElement>({
	anchorRef,
	enabled,
	open,
	width,
	gutter = 12,
}: Options<T>): CSSProperties | undefined {
	const [style, setStyle] = useState<CSSProperties | undefined>();

	useLayoutEffect(() => {
		if (!enabled || !open) {
			setStyle(undefined);
			return;
		}

		function update() {
			const anchor = anchorRef.current;
			if (!anchor) return;
			const rect = anchor.getBoundingClientRect();
			const top = rect.bottom + 6;
			const viewportWidth = window.innerWidth;
			const finalWidth = Math.min(width, Math.max(220, viewportWidth - gutter * 2));
			const left = Math.min(
				Math.max(gutter, rect.left),
				Math.max(gutter, viewportWidth - finalWidth - gutter),
			);
			setStyle({
				position: "fixed",
				left,
				top,
				right: "auto",
				width: finalWidth,
				maxHeight: Math.max(220, window.innerHeight - top - gutter),
				zIndex: 120,
			});
		}

		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [anchorRef, enabled, gutter, open, width]);

	return style;
}

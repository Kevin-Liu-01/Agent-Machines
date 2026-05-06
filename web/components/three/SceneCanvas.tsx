"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
	camera?: CanvasProps["camera"];
	dpr?: CanvasProps["dpr"];
};

/**
 * Shared Canvas wrapper. Caps DPR at 1.5 (wireframe doesn't benefit from 2x +
 * the perf hit on retina is real), turns off antialias (we want crisp 1px
 * edges), and disables shadows. Every three.js scene in the page lives behind
 * this so we have one place to retune the perf budget.
 */
export function SceneCanvas({
	children,
	className,
	camera = { position: [0, 0, 5], fov: 35 },
	dpr = [1, 1.5],
}: Props) {
	return (
		<Canvas
			className={cn("absolute inset-0", className)}
			camera={camera}
			dpr={dpr}
			gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
			frameloop="always"
		>
			{children}
		</Canvas>
	);
}

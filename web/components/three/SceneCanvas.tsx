"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
	children: ReactNode;
	className?: string;
	camera?: CanvasProps["camera"];
	dpr?: CanvasProps["dpr"];
	antialias?: boolean;
};

/**
 * Shared Canvas wrapper. Most wireframes cap DPR at 1.5 and skip antialiasing;
 * dense hero linework can opt into smoother retina rendering.
 */
export function SceneCanvas({
	children,
	className,
	camera = { position: [0, 0, 5], fov: 35 },
	dpr = [1, 1.5],
	antialias = false,
}: Props) {
	return (
		<Canvas
			className={cn("absolute inset-0", className)}
			camera={camera}
			dpr={dpr}
			gl={{
				antialias,
				alpha: true,
				powerPreference: antialias ? "high-performance" : "low-power",
			}}
			frameloop="always"
		>
			{children}
		</Canvas>
	);
}

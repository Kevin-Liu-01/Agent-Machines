"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Lazy-loaded three.js scenes. SSR is off because three.js touches WebGL
 * APIs at import time. Each scene is its own dynamic import so the bust
 * scene's bundle (~150 KB gzip with three) doesn't load on pages that only
 * need the colonnade.
 */
const SceneCanvas = dynamic(
	() => import("./SceneCanvas").then((m) => m.SceneCanvas),
	{ ssr: false },
);
const HermesBust = dynamic(
	() => import("./HermesBust").then((m) => m.HermesBust),
	{ ssr: false },
);
const TempleScene = dynamic(
	() => import("./TempleScene").then((m) => m.TempleScene),
	{ ssr: false },
);
const HeadField = dynamic(
	() => import("./HeadField").then((m) => m.HeadField),
	{ ssr: false },
);

type FrameProps = {
	className?: string;
	children?: ReactNode;
};

function SceneFrame({ className, children }: FrameProps) {
	return (
		<div
			className={cn(
				"relative overflow-hidden",
				"bg-[var(--ret-bg)]",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function HermesBustScene({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0.6, 5.2], fov: 38 }}>
				<ambientLight intensity={0.4} />
				<HermesBust />
			</SceneCanvas>
			{/* Vignette + cross marks on the corners to anchor the canvas in the Reticle grid */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_55%,var(--ret-bg)_100%)]" />
				<div className="absolute left-2 top-2 h-3 w-3 border-l border-t border-[var(--ret-cross)]" />
				<div className="absolute right-2 top-2 h-3 w-3 border-r border-t border-[var(--ret-cross)]" />
				<div className="absolute bottom-2 left-2 h-3 w-3 border-b border-l border-[var(--ret-cross)]" />
				<div className="absolute bottom-2 right-2 h-3 w-3 border-b border-r border-[var(--ret-cross)]" />
			</div>
		</SceneFrame>
	);
}

export function TempleColonnade({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0.5, 6], fov: 45 }}>
				<ambientLight intensity={0.5} />
				<TempleScene />
			</SceneCanvas>
		</SceneFrame>
	);
}

export function HeadTriptych({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0, 4.2], fov: 36 }}>
				<ambientLight intensity={0.5} />
				<HeadField />
			</SceneCanvas>
		</SceneFrame>
	);
}

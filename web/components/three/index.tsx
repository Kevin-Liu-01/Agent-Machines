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
const DashboardWire = dynamic(
	() => import("./WireframeShapes").then((m) => m.DashboardWire),
	{ ssr: false },
);
const AgentWire = dynamic(
	() => import("./WireframeShapes").then((m) => m.AgentWire),
	{ ssr: false },
);
const LoadoutWire = dynamic(
	() => import("./WireframeShapes").then((m) => m.LoadoutWire),
	{ ssr: false },
);
const HostsWire = dynamic(
	() => import("./WireframeShapes").then((m) => m.HostsWire),
	{ ssr: false },
);
const EnvironmentWire = dynamic(
	() => import("./WireframeShapes").then((m) => m.EnvironmentWire),
	{ ssr: false },
);
const MachineWireShape = dynamic(
	() => import("./WireframeShapes").then((m) => m.MachineWire),
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

function CrossOverlay() {
	return (
		<div className="pointer-events-none absolute inset-0">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,var(--ret-bg)_100%)]" />
			<div className="absolute left-1.5 top-1.5 h-2 w-2 border-l border-t border-[var(--ret-cross)]" />
			<div className="absolute right-1.5 top-1.5 h-2 w-2 border-r border-t border-[var(--ret-cross)]" />
			<div className="absolute bottom-1.5 left-1.5 h-2 w-2 border-b border-l border-[var(--ret-cross)]" />
			<div className="absolute bottom-1.5 right-1.5 h-2 w-2 border-b border-r border-[var(--ret-cross)]" />
		</div>
	);
}

export function WireframeDashboard({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0.3, 4.5], fov: 30 }}>
				<DashboardWire />
			</SceneCanvas>
			<CrossOverlay />
		</SceneFrame>
	);
}

export function WireframeAgent({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0.5, 4], fov: 32 }}>
				<AgentWire />
			</SceneCanvas>
			<CrossOverlay />
		</SceneFrame>
	);
}

export function WireframeLoadout({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0, 5], fov: 30 }}>
				<LoadoutWire />
			</SceneCanvas>
			<CrossOverlay />
		</SceneFrame>
	);
}

export function WireframeHosts({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0.5, 0.3, 4.2], fov: 32 }}>
				<HostsWire />
			</SceneCanvas>
			<CrossOverlay />
		</SceneFrame>
	);
}

export function WireframeEnvironment({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0, 4.5], fov: 30 }}>
				<EnvironmentWire />
			</SceneCanvas>
			<CrossOverlay />
		</SceneFrame>
	);
}

export function WireframeMachine({ className }: { className?: string }) {
	return (
		<SceneFrame className={className}>
			<SceneCanvas camera={{ position: [0, 0, 4], fov: 34 }}>
				<MachineWireShape />
			</SceneCanvas>
			<CrossOverlay />
		</SceneFrame>
	);
}

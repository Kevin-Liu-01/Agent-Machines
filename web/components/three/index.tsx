"use client";

import dynamic from "next/dynamic";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { SubstrateId } from "./HeroOrbitScene";

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
const HeroOrbitInner = dynamic(
	() => import("./HeroOrbitScene").then((m) => m.HeroOrbitScene),
	{ ssr: false },
);

type FrameProps = {
	className?: string;
	children?: ReactNode;
	/** When false, the frame is transparent so callers can blend it. */
	bg?: boolean;
};

function SceneFrame({ className, children, bg = true }: FrameProps) {
	return (
		<div
			className={cn(
				"relative overflow-hidden",
				bg && "bg-[var(--ret-bg)]",
				className,
			)}
		>
			{children}
		</div>
	);
}

type GearGlassStyle = CSSProperties & Record<`--${string}`, string>;

const GEAR_GLASS_VARS: GearGlassStyle = {
	"--gear-unit": "calc(100cqmin / 5.84)",
	"--gear-center-x": "calc(50% + var(--gear-unit) * 2.25)",
	"--gear-center-y": "50%",
};

function gearGlassRingStyle({
	diameter,
	inner,
	outer,
	blur,
	opacity,
}: {
	diameter: number;
	inner: number;
	outer: number;
	blur: number;
	opacity: number;
}): CSSProperties {
	const mask = `radial-gradient(circle, transparent 0 ${inner}%, #000 calc(${inner}% + 0.8%), #000 ${outer}%, transparent calc(${outer}% + 0.8%))`;
	return {
		width: `calc(var(--gear-unit) * ${diameter})`,
		height: `calc(var(--gear-unit) * ${diameter})`,
		left: "var(--gear-center-x)",
		top: "var(--gear-center-y)",
		opacity,
		WebkitBackdropFilter: `blur(${blur}px) saturate(1.35)`,
		backdropFilter: `blur(${blur}px) saturate(1.35)`,
		WebkitMaskImage: mask,
		maskImage: mask,
		background:
			"radial-gradient(circle at 34% 28%, color-mix(in oklab, var(--ret-text) 14%, transparent), transparent 30%), linear-gradient(135deg, color-mix(in oklab, var(--ret-text) 7%, transparent), color-mix(in oklab, var(--ret-bg) 20%, transparent) 48%, color-mix(in oklab, var(--ret-text) 5%, transparent))",
		boxShadow:
			"inset 0 1px 0 color-mix(in oklab, var(--ret-text) 14%, transparent), inset 0 -1px 0 color-mix(in oklab, var(--ret-bg) 34%, transparent)",
	};
}

function GearGlassOverlay() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
			style={{ ...GEAR_GLASS_VARS, containerType: "size" }}
		>
			<div
				className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
				style={gearGlassRingStyle({
					diameter: 6.24,
					inner: 58.3,
					outer: 91.7,
					blur: 12,
					opacity: 0.74,
				})}
			/>
			<div
				className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
				style={gearGlassRingStyle({
					diameter: 3.56,
					inner: 48.3,
					outer: 87.6,
					blur: 10,
					opacity: 0.78,
				})}
			/>
			<div
				className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55"
				style={{
					width: "calc(var(--gear-unit) * 1.78)",
					height: "calc(var(--gear-unit) * 1.78)",
					left: "var(--gear-center-x)",
					top: "var(--gear-center-y)",
					WebkitBackdropFilter: "blur(8px) saturate(1.3)",
					backdropFilter: "blur(8px) saturate(1.3)",
					background:
						"radial-gradient(circle at 40% 32%, color-mix(in oklab, var(--ret-text) 10%, transparent), transparent 36%), color-mix(in oklab, var(--ret-bg) 18%, transparent)",
					boxShadow:
						"inset 0 0 0 1px color-mix(in oklab, var(--ret-text) 10%, transparent)",
				}}
			/>
			<div
				className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-[0.4px]"
				style={{
					width: "calc(var(--gear-unit) * 0.58)",
					height: "calc(var(--gear-unit) * 4.9)",
					left: "calc(var(--gear-center-x) + var(--gear-unit) * 1.92)",
					top: "var(--gear-center-y)",
					background:
						"linear-gradient(180deg, transparent, color-mix(in oklab, var(--ret-text) 13%, transparent) 48%, transparent)",
				}}
			/>
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

export function HeroOrbit({
	className,
	activeAgent,
	activeSubstrate,
	mode = "portrait",
	onSelectAgent,
	onSelectSubstrate,
}: {
	className?: string;
	activeAgent: string | null;
	activeSubstrate?: SubstrateId;
	mode?: "portrait" | "gears";
	onSelectAgent?: (idx: number) => void;
	onSelectSubstrate?: (id: SubstrateId) => void;
}) {
	const gears = mode === "gears";
	const camPos: [number, number, number] = gears ? [0, 0, 7.6] : [0, 0, 4.8];
	return (
		<SceneFrame className={className} bg={!gears}>
			{gears ? <GearGlassOverlay /> : null}
			<SceneCanvas
				className={gears ? "z-[2]" : undefined}
				camera={{ position: camPos, fov: gears ? 42 : 34 }}
				dpr={gears ? 2 : undefined}
				antialias={gears}
			>
				<HeroOrbitInner
					activeAgent={activeAgent}
					activeSubstrate={activeSubstrate}
					mode={mode}
					onSelectAgent={onSelectAgent}
					onSelectSubstrate={onSelectSubstrate}
				/>
			</SceneCanvas>
			{!gears && <CrossOverlay />}
		</SceneFrame>
	);
}

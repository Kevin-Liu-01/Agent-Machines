import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { GEAR_MODULE, gearPath, type EngineGear } from "@/lib/marketing/worker-gears";

const METAL = "var(--ret-text-muted)";
const EDGE = "var(--ret-text-dim)";
const PLATE = "var(--ret-border-hover)";
const RECESS = "var(--ret-bg)";
type Arm = "runtime" | "sandbox" | "models" | "tools";

/** All decorative machining stays inside the root circle, away from the mesh. */
function polygon(radius: number, sides: number, offset = 0): string {
	return Array.from({ length: sides }, (_, index) => {
		const angle = (index / sides * 360 + offset) * Math.PI / 180;
		return `${(radius * Math.cos(angle)).toFixed(3)},${(radius * Math.sin(angle)).toFixed(3)}`;
	}).join(" ");
}

function Radial({ count, offset = 0, children }: { count: number; offset?: number; children: ReactNode }) {
	return Array.from({ length: count }, (_, index) => (
		<g key={index} transform={`rotate(${offset + index * 360 / count})`}>{children}</g>
	));
}

/** A washer, chamfered hex head, and recessed drive socket—not a painted dot. */
function Fastener({ size, slotted = false }: { size: number; slotted?: boolean }) {
	return (
		<g data-gear-detail="socket-fastener" transform={`scale(${size})`}>
			<circle data-gear-detail="washer" r="1.4" fill={RECESS} stroke={METAL} strokeWidth="0.12" />
			<circle r="1.19" fill={PLATE} stroke={EDGE} strokeWidth="0.09" />
			<polygon points={polygon(1, 6, 30)} fill={METAL} stroke={EDGE} strokeWidth="0.08" />
			<polygon points={polygon(0.76, 6, 30)} fill={PLATE} />
			{slotted
				? <path d="M -.53 -.12 H .53 V .12 H -.53 Z" fill={RECESS} />
				: <polygon data-gear-detail="hex-socket" points={polygon(0.38, 6, 30)} fill={RECESS} stroke={EDGE} strokeWidth="0.07" />}
			<path d="M -.86 -.5 L 0 -1 L .86 -.5" fill="none" stroke={EDGE} strokeWidth="0.11" />
		</g>
	);
}

function Axle({ square = false }: { square?: boolean }) {
	return (
		<g data-gear-detail="keyed-axle">
			<circle r="26" fill={RECESS} stroke={METAL} strokeWidth="1.5" />
			<circle r="22" fill={PLATE} stroke={EDGE} strokeWidth="1" />
			<polygon points={polygon(19, square ? 4 : 6, square ? 45 : 30)} fill={METAL} stroke={EDGE} strokeWidth="0.9" />
			<polygon points={polygon(15, square ? 4 : 6, square ? 45 : 30)} fill={PLATE} />
			<circle r="11" fill={RECESS} stroke={METAL} strokeWidth="1.2" />
			<circle r="7" fill={PLATE} stroke={EDGE} strokeWidth="0.8" />
			<path d="M -2 -10 H 2 V -5 H -2 Z" fill={EDGE} />
			<polygon points={polygon(3.5, 6, 30)} fill={RECESS} />
		</g>
	);
}

/** Continuous rings share a spoke web, from the keyed hub to the outer rim. */
function IdlerFace({ arm }: { arm: Arm }) {
	const spokes = arm === "runtime" ? 6 : arm === "models" ? 3 : 4;
	const offset = arm === "sandbox" ? 45 : arm === "models" ? 30 : 0;
	const spokePath = arm === "models"
		? "M 22 -5 H 52 L 76 -14 L 94 -5 V 5 L 77 -3 L 53 5 H 22 Z"
		: arm === "tools"
			? "M 22 -6 H 58 V -10 H 78 V -5 H 94 V 5 H 78 V 10 H 58 V 6 H 22 Z"
			: arm === "sandbox"
				? "M 22 -8 H 64 L 94 -5 V 5 L 64 8 H 22 Z"
				: "M 22 -4 L 56 -7 L 94 -4 V 4 L 56 7 L 22 4 Z";
	return (
		<g data-gear-face={arm} strokeLinejoin="miter">
			<circle data-gear-detail="circular-rim" r="96" fill={RECESS} stroke={METAL} strokeWidth="1.6" />
			<circle r="92" fill="none" stroke={PLATE} strokeWidth="1.2" />
			<g data-gear-detail="connecting-spokes">
				<Radial count={spokes} offset={offset}>
					<path data-gear-detail="hub-to-rim-arm" d={spokePath} fill={METAL} stroke={EDGE} strokeWidth="0.6" />
					{arm !== "models" && <path d="M 45 -1.5 H 70 V 1.5 H 45 Z" fill={RECESS} />}
				</Radial>
			</g>
			<g data-gear-detail="concentric-rings" fill="none">
				{[38, 60, 82].map(radius => (
					<g key={radius} data-gear-ring={radius}>
						<circle r={radius} stroke={METAL} strokeWidth="3.2" />
						<circle r={radius - 2.5} stroke={PLATE} strokeWidth="1" />
					</g>
				))}
			</g>
			<Radial count={spokes} offset={offset}>
				<g transform="translate(82 0)"><Fastener size={3.8} slotted={arm === "tools"} /></g>
			</Radial>
			<Axle square={arm === "sandbox" || arm === "tools"} />
		</g>
	);
}

function BearingFace({ core }: { core: boolean }) {
	return (
		<g data-gear-face={core ? "core" : "bearing"}>
			<circle data-gear-detail="circular-rim" r="98" fill={RECESS} stroke={METAL} strokeWidth="0.65" />
			<circle r="96.2" fill="none" stroke={PLATE} strokeWidth="0.75" />
			<circle r="87" fill="none" stroke={PLATE} strokeWidth="2.5" />
			<circle r="84" fill="none" stroke={METAL} strokeWidth="0.5" />
			<circle r="81.5" fill="none" stroke={PLATE} strokeWidth="0.5" />
			<Radial count={core ? 8 : 6} offset={core ? 22.5 : 30}>
				<g transform="translate(91 0)"><Fastener size={core ? 3.15 : 3.5} /></g>
			</Radial>
		</g>
	);
}

export function WorkerGearWheel({ gear }: { gear: EngineGear }) {
	const root = gear.radius - GEAR_MODULE * 1.25;
	const arm: Arm = gear.id.startsWith("runtime-") ? "runtime"
		: gear.id.startsWith("sandbox-") ? "sandbox"
			: gear.id.startsWith("models-") ? "models" : "tools";
	return (
		<g transform={`translate(${gear.x} ${gear.y})`}>
			<g transform={`rotate(${gear.phaseRadians * 180 / Math.PI})`}>
				<g
					data-worker-gear={gear.kind}
					data-gear-id={gear.id}
					data-gear-teeth={gear.teeth}
					opacity={gear.kind === "idler" ? 0.75 : undefined}
					className={cn("origin-[0_0] [transform-box:view-box] motion-safe:animate-spin group-data-[gear-motion=paused]/engine:[animation-play-state:paused]")}
					style={{ animationDuration: `${gear.period}s`, animationDirection: gear.direction === 1 ? "normal" : "reverse" }}
				>
					<path data-gear-detail="toothed-rim" data-gear-profile="trapezoidal" d={gearPath(gear.teeth)} fill={PLATE} stroke={METAL} strokeWidth="1" strokeLinejoin="miter" />
					<g transform={`scale(${root / 100})`}>
						{gear.kind === "idler" ? <IdlerFace arm={arm} /> : <BearingFace core={gear.kind === "core"} />}
					</g>
				</g>
			</g>
		</g>
	);
}

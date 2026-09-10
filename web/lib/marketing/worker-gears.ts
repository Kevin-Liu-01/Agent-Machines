/**
 * Involute spur gears for the Worker-system illustration, in SVG units.
 * The working flanks use the involute model; roots use a radial extension
 * rather than a manufactured cutter fillet. This is not a fabrication model.
 * Geometry reference: https://mechanics.ju.se/MachineElements/spur-gears.html
 */
export const ENGINE_WIDTH = 1200;
// Room below the lower satellites for readable, wrapping HTML captions.
export const ENGINE_HEIGHT = 840;
export const GEAR_MODULE = 6.25;
export const GEAR_PRESSURE_ANGLE = 25 * Math.PI / 180;
export const GEAR_SECONDS_PER_TOOTH = 0.8;
/** Material removed from each flank, measured along the pitch circle. */
export const GEAR_HALF_BACKLASH = 0.06;

const gearPeriod = (teeth: number) => Number((teeth * GEAR_SECONDS_PER_TOOTH).toFixed(2));

export type EngineGear = {
	readonly id: string;
	readonly kind: "core" | "idler" | "satellite";
	readonly x: number;
	readonly y: number;
	readonly teeth: number;
	/** Pitch radius, not the outer tooth radius. */
	readonly radius: number;
	/** Tooth zero is centered on +x before this rotation. SVG angles are clockwise. */
	readonly phaseRadians: number;
	readonly direction: 1 | -1;
	/** Seconds per full revolution; all gears share one animation epoch. */
	readonly period: number;
};

export const CORE_GEAR: EngineGear = {
	id: "core",
	kind: "core",
	x: 600,
	y: 360,
	teeth: 64,
	radius: 200,
	phaseRadians: 0,
	direction: 1,
	period: gearPeriod(64),
};

const TAU = 2 * Math.PI;
const involute = (angle: number) => Math.tan(angle) - angle;
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

function gearTrain(id: string, bearingDegrees: readonly [number, number, number, number]): readonly EngineGear[] {
	const gears: EngineGear[] = [];
	let previous = CORE_GEAR;
	for (const [index, teeth] of [12, 18, 24, 32].entries()) {
		const bearing = bearingDegrees[index] * Math.PI / 180;
		const radius = GEAR_MODULE * teeth / 2;
		const distance = previous.radius + radius;
		// At each pitch contact, one gear's tooth phase complements its mate's gap.
		// Ni(β−θi) + Nj(β+π−θj) = π (mod 2π).
		const phase = ((previous.teeth + teeth) * bearing + teeth * Math.PI
			- Math.PI - previous.teeth * previous.phaseRadians) / teeth;
		const gear: EngineGear = {
			id: index === 3 ? `${id}-satellite` : `${id}-idler-${index + 1}`,
			kind: index === 3 ? "satellite" : "idler",
			x: previous.x + distance * Math.cos(bearing),
			y: previous.y + distance * Math.sin(bearing),
			teeth,
			radius,
			phaseRadians: modulo(phase, TAU / teeth),
			direction: previous.direction === 1 ? -1 : 1,
			period: gearPeriod(teeth),
		};
		gears.push(gear);
		previous = gear;
	}
	return gears;
}

export const GEAR_TRAINS: Record<"runtime" | "sandbox" | "models" | "tools", readonly EngineGear[]> = {
	// Each angle belongs to one mesh, not the whole branch. The upper trains
	// fold around the core; lower trains zigzag clear of the HTML captions.
	runtime: gearTrain("runtime", [225, 270, 180, 150]),
	sandbox: gearTrain("sandbox", [158, 100, 205, 134]),
	models: gearTrain("models", [-45, -90, 0, 30]),
	tools: gearTrain("tools", [22, 80, -25, 46]),
};

export const ENGINE_GEARS: readonly EngineGear[] = [
	CORE_GEAR,
	...GEAR_TRAINS.runtime,
	...GEAR_TRAINS.sandbox,
	...GEAR_TRAINS.models,
	...GEAR_TRAINS.tools,
];

/** Closed, clockwise involute-tooth polygon centered at (0, 0). */
export function gearPath(teeth: number): string {
	if (!Number.isInteger(teeth) || teeth < Math.ceil(2 / Math.sin(GEAR_PRESSURE_ANGLE) ** 2) || teeth > 256) {
		throw new RangeError("Gear tooth count must be an integer between 12 and 256.");
	}
	const pitchRadius = GEAR_MODULE * teeth / 2;
	const baseRadius = pitchRadius * Math.cos(GEAR_PRESSURE_ANGLE);
	const tipRadius = pitchRadius + GEAR_MODULE;
	const rootRadius = pitchRadius - 1.25 * GEAR_MODULE;
	// Above this tooth count the root is outside the base circle: don't draw
	// the involute down through the solid gear body.
	const startRadius = Math.max(rootRadius, baseRadius);
	const startT = Math.sqrt(Math.max(0, (startRadius / baseRadius) ** 2 - 1));
	const endT = Math.sqrt((tipRadius / baseRadius) ** 2 - 1);
	const pitchAngle = TAU / teeth;
	const baseHalfAngle = Math.PI / (2 * teeth) - GEAR_HALF_BACKLASH / pitchRadius
		+ involute(GEAR_PRESSURE_ANGLE);
	const halfAngle = (t: number) => baseHalfAngle - (t - Math.atan(t));
	const startHalfAngle = halfAngle(startT);
	const tipHalfAngle = halfAngle(endT);
	const points: string[] = [];
	const point = (radius: number, angle: number) => {
		points.push(`${(radius * Math.cos(angle)).toFixed(5)},${(radius * Math.sin(angle)).toFixed(5)}`);
	};
	const flankSteps = 16;
	const arcSteps = 4;

	for (let tooth = 0; tooth < teeth; tooth++) {
		const center = tooth * pitchAngle;
		point(rootRadius, center - startHalfAngle);
		for (let step = 0; step <= flankSteps; step++) {
			const t = startT + (endT - startT) * step / flankSteps;
			point(baseRadius * Math.sqrt(1 + t * t), center - halfAngle(t));
		}
		for (let step = 1; step <= arcSteps; step++) {
			point(tipRadius, center - tipHalfAngle + 2 * tipHalfAngle * step / arcSteps);
		}
		for (let step = 1; step <= flankSteps; step++) {
			const t = endT - (endT - startT) * step / flankSteps;
			point(baseRadius * Math.sqrt(1 + t * t), center + halfAngle(t));
		}
		point(rootRadius, center + startHalfAngle);
		for (let step = 1; step <= arcSteps; step++) {
			point(rootRadius, center + startHalfAngle + (pitchAngle - 2 * startHalfAngle) * step / arcSteps);
		}
	}
	return `M${points.join("L")}Z`;
}

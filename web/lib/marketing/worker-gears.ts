/**
 * Stylized spur gears for the Worker-system illustration, in SVG units.
 * Straight-sided teeth are inscribed inside an involute envelope and cropped
 * to broad, flat tips. Pitch placement and rotation ratios remain unchanged.
 * This is an illustration, not a conjugate tooth or fabrication model.
 */
export const ENGINE_WIDTH = 1000;
// A compact, staggered cluster; the supporting legend lives outside the canvas.
export const ENGINE_HEIGHT = 780;
export const GEAR_MODULE = 6.25;
/** Shorter teeth give the trapezoids a broad land instead of a rounded point. */
export const GEAR_ADDENDUM = 0.4;
/** A broad crown and near-upright sides make the trapezoid clear at page scale. */
export const GEAR_TIP_TO_ROOT_RATIO = 0.7;
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
	x: 500,
	y: 420,
	teeth: 64,
	radius: 200,
	phaseRadians: 0,
	direction: 1,
	period: gearPeriod(64),
};

const TAU = 2 * Math.PI;
const involute = (angle: number) => Math.tan(angle) - angle;
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** Place a driven wheel on its parent's pitch circle and preserve tooth phase. */
function drivenGear(parent: EngineGear, id: string, kind: EngineGear["kind"], teeth: number, bearingDegrees: number): EngineGear {
	const bearing = bearingDegrees * Math.PI / 180;
	const radius = GEAR_MODULE * teeth / 2;
	const distance = parent.radius + radius;
	// At the pitch contact, a tooth on one wheel meets a gap on the other.
	const phase = ((parent.teeth + teeth) * bearing + teeth * Math.PI
		- Math.PI - parent.teeth * parent.phaseRadians) / teeth;
	return {
		id, kind, teeth, radius,
		x: parent.x + distance * Math.cos(bearing),
		y: parent.y + distance * Math.sin(bearing),
		phaseRadians: modulo(phase, TAU / teeth),
		direction: parent.direction === 1 ? -1 : 1,
		period: gearPeriod(teeth),
	};
}

function componentGear(id: string, teeth: number, bearingDegrees: number): EngineGear {
	return drivenGear(CORE_GEAR, `${id}-satellite`, "satellite", teeth, bearingDegrees);
}

// A stepped arrangement inspired by simple mechanical process diagrams.
// Different sizes and bearings create a compact cluster, not four radial arms.
export const COMPONENT_GEARS = {
	runtime: componentGear("runtime", 40, -35),
	sandbox: componentGear("sandbox", 36, 160),
	models: componentGear("models", 32, -105),
	tools: componentGear("tools", 32, 35),
} as const;

// Tuck smaller mechanisms into the open spaces without moving the main wheels
// or closing a three-gear loop, which would lock an external spur-gear train.
const relay = drivenGear(CORE_GEAR, "runtime-relay", "idler", 18, -155);
const pinion = drivenGear(relay, "runtime-pinion", "idler", 12, -110);
const modelPinion = drivenGear(COMPONENT_GEARS.models, "models-pinion", "idler", 14, -5);
const toolPinion = drivenGear(CORE_GEAR, "tools-pinion", "idler", 16, 88);

export const SUB_GEARS: readonly EngineGear[] = [relay, pinion, modelPinion, toolPinion];
export const ENGINE_GEARS: readonly EngineGear[] = [CORE_GEAR, ...Object.values(COMPONENT_GEARS), ...SUB_GEARS];
export const GEAR_CONTACTS: readonly (readonly [EngineGear, EngineGear])[] = [
	...Object.values(COMPONENT_GEARS).map((gear) => [CORE_GEAR, gear] as const),
	[CORE_GEAR, relay], [relay, pinion], [COMPONENT_GEARS.models, modelPinion], [CORE_GEAR, toolPinion],
];

/** Keep the core caption below the complete cluster. */
export const CORE_CAPTION_Y = Math.max(...ENGINE_GEARS.map((gear) => gear.y + gear.radius + GEAR_MODULE * GEAR_ADDENDUM)) + 24;

/** Closed outline: four trapezoid corners per tooth, joined by recessed roots. */
export function gearPath(teeth: number): string {
	if (!Number.isInteger(teeth) || teeth < Math.ceil(2 / Math.sin(GEAR_PRESSURE_ANGLE) ** 2) || teeth > 256) {
		throw new RangeError("Gear tooth count must be an integer between 12 and 256.");
	}
	const pitchRadius = GEAR_MODULE * teeth / 2;
	const baseRadius = pitchRadius * Math.cos(GEAR_PRESSURE_ANGLE);
	const tipRadius = pitchRadius + GEAR_MODULE * GEAR_ADDENDUM;
	const rootRadius = pitchRadius - 1.25 * GEAR_MODULE;
	const pitchAngle = TAU / teeth;
	const baseHalfAngle = Math.PI / (2 * teeth) - GEAR_HALF_BACKLASH / pitchRadius
		+ involute(GEAR_PRESSURE_ANGLE);
	const halfAngle = (radius: number) => baseHalfAngle - involute(Math.acos(Math.min(1, baseRadius / radius)));
	const tipHalfAngle = halfAngle(tipRadius);
	const rootHalfAngle = Math.min(
		halfAngle(rootRadius),
		Math.asin(tipRadius * Math.sin(tipHalfAngle) / (rootRadius * GEAR_TIP_TO_ROOT_RATIO)),
	);
	const points: string[] = [];
	const point = (radius: number, angle: number) => {
		points.push(`${(radius * Math.cos(angle)).toFixed(5)},${(radius * Math.sin(angle)).toFixed(5)}`);
	};
	const arcSteps = 4;

	for (let tooth = 0; tooth < teeth; tooth++) {
		const center = tooth * pitchAngle;
		point(rootRadius, center - rootHalfAngle);
		point(tipRadius, center - tipHalfAngle);
		point(tipRadius, center + tipHalfAngle);
		point(rootRadius, center + rootHalfAngle);
		for (let step = 1; step <= arcSteps; step++) {
			point(rootRadius, center + rootHalfAngle + (pitchAngle - 2 * rootHalfAngle) * step / arcSteps);
		}
	}
	return `M${points.join("L")}Z`;
}

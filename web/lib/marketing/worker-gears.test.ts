import { describe, expect, it } from "vitest";

import {
	CORE_GEAR,
	ENGINE_GEARS,
	ENGINE_HEIGHT,
	ENGINE_WIDTH,
	GEAR_HALF_BACKLASH,
	GEAR_MODULE,
	GEAR_PRESSURE_ANGLE,
	GEAR_SECONDS_PER_TOOTH,
	GEAR_TRAINS,
	gearPath,
	type EngineGear,
} from "./worker-gears";

const TAU = 2 * Math.PI;
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const phaseError = (value: number) => Math.abs(mod(value + Math.PI, TAU) - Math.PI);
const edges = Object.values(GEAR_TRAINS).flatMap((train) => train.map((gear, index) => [index === 0 ? CORE_GEAR : train[index - 1], gear] as const));
const radiusAtTip = (gear: EngineGear) => gear.radius + GEAR_MODULE;

describe("Worker engine gear geometry", () => {
	it("builds four varied-size three-idler trains with exact pitch tangencies", () => {
		expect(ENGINE_GEARS).toHaveLength(17);
		expect(new Set(ENGINE_GEARS.map((gear) => gear.id)).size).toBe(17);
		expect(edges).toHaveLength(16);
		expect(CORE_GEAR).toMatchObject({ id: "core", x: 600, y: 360, teeth: 64, radius: 200, phaseRadians: 0, direction: 1, period: 51.2 });
		for (const [id, train] of Object.entries(GEAR_TRAINS)) {
			expect(train.map((gear) => gear.teeth)).toEqual([12, 18, 24, 32]);
			expect(train.map((gear) => gear.kind)).toEqual(["idler", "idler", "idler", "satellite"]);
			expect(train[3].id).toBe(`${id}-satellite`);
			expect(new Set(train.slice(0, 3).map((gear) => gear.radius)).size).toBe(3);
		}
		for (const [a, b] of edges) {
			expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(a.radius + b.radius, 10);
		}
		for (const gear of ENGINE_GEARS) expect(gear.radius * 2 / gear.teeth).toBe(GEAR_MODULE);
	});

	it("forms pronounced alternating bends instead of straight or nearly straight spokes", () => {
		for (const [id, train] of Object.entries(GEAR_TRAINS)) {
			const chain = [CORE_GEAR, ...train];
			const bearings = train.map((gear, index) => Math.atan2(gear.y - chain[index].y, gear.x - chain[index].x));
			const turns = bearings.slice(1).map((bearing, index) => mod(bearing - bearings[index] + Math.PI, TAU) - Math.PI);
			for (const turn of turns) expect(Math.abs(turn)).toBeGreaterThanOrEqual(Math.PI / 6 - 1e-10);
			expect(turns.some((turn) => turn > 0)).toBe(true);
			expect(turns.some((turn) => turn < 0)).toBe(true);
			for (const gear of train) {
				expect(Math.sign(gear.x - CORE_GEAR.x)).toBe(id === "runtime" || id === "sandbox" ? -1 : 1);
				expect(Math.sign(gear.y - CORE_GEAR.y)).toBe(id === "runtime" || id === "models" ? -1 : 1);
			}
		}
	});

	it("preserves tooth/gap phase at every edge over multiple complete revolutions", () => {
		for (const [a, b] of edges) {
			const bearing = Math.atan2(b.y - a.y, b.x - a.x);
			for (let sample = 0; sample <= 1000; sample++) {
				const seconds = 320 * sample / 1000;
				const angleA = a.phaseRadians + a.direction * TAU * seconds / a.period;
				const angleB = b.phaseRadians + b.direction * TAU * seconds / b.period;
				expect(phaseError(a.teeth * (bearing - angleA) + b.teeth * (bearing + Math.PI - angleB) - Math.PI)).toBeLessThan(1e-9);
			}
		}
	});

	it("matches pitch-line speed, reverses every mesh and drives satellites at twice core speed", () => {
		expect(new Set(ENGINE_GEARS.map((gear) => gear.period)).size).toBe(5);
		for (const gear of ENGINE_GEARS) expect(gear.period).toBeCloseTo(gear.teeth * GEAR_SECONDS_PER_TOOTH, 12);
		for (const [a, b] of edges) {
			expect(a.direction).toBe(-b.direction);
			expect(a.radius * a.direction / a.period + b.radius * b.direction / b.period).toBeCloseTo(0, 12);
		}
		for (const train of Object.values(GEAR_TRAINS)) {
			expect(train.map((gear) => gear.direction)).toEqual([-1, 1, -1, 1]);
			expect(train.map((gear) => gear.period)).toEqual([9.6, 14.4, 19.2, 25.6]);
		}
	});

	it("avoids undercut and maintains nominal involute contact above one tooth pair", () => {
		expect(2 / Math.sin(GEAR_PRESSURE_ANGLE) ** 2).toBeCloseTo(11.1978198642, 8);
		for (const gear of ENGINE_GEARS) expect(gear.teeth).toBeGreaterThanOrEqual(Math.ceil(2 / Math.sin(GEAR_PRESSURE_ANGLE) ** 2));
		for (const [a, b] of edges) {
			const baseA = a.radius * Math.cos(GEAR_PRESSURE_ANGLE);
			const baseB = b.radius * Math.cos(GEAR_PRESSURE_ANGLE);
			const approach = Math.sqrt(radiusAtTip(b) ** 2 - baseB ** 2) - b.radius * Math.sin(GEAR_PRESSURE_ANGLE);
			const recess = Math.sqrt(radiusAtTip(a) ** 2 - baseA ** 2) - a.radius * Math.sin(GEAR_PRESSURE_ANGLE);
			const contactRatio = (approach + recess) / (Math.PI * GEAR_MODULE * Math.cos(GEAR_PRESSURE_ANGLE));
			expect(contactRatio).toBeGreaterThan(1.3);
			// Contact never reaches the other gear's non-involute root extension.
			expect(a.radius * Math.sin(GEAR_PRESSURE_ANGLE) - approach).toBeGreaterThan(0);
			expect(b.radius * Math.sin(GEAR_PRESSURE_ANGLE) - recess).toBeGreaterThan(0);
			const rootB = b.radius - 1.25 * GEAR_MODULE;
			expect(a.radius + b.radius - radiusAtTip(a) - rootB).toBeCloseTo(0.25 * GEAR_MODULE, 12);
		}
	});

	it("keeps unrelated gears apart and every tooth inside the shared viewBox", () => {
		for (const gear of ENGINE_GEARS) {
			expect(gear.x - radiusAtTip(gear)).toBeGreaterThan(0);
			expect(gear.x + radiusAtTip(gear)).toBeLessThan(ENGINE_WIDTH);
			expect(gear.y - radiusAtTip(gear)).toBeGreaterThan(0);
			expect(gear.y + radiusAtTip(gear)).toBeLessThan(ENGINE_HEIGHT);
		}
		for (let i = 0; i < ENGINE_GEARS.length; i++) {
			for (let j = i + 1; j < ENGINE_GEARS.length; j++) {
				const a = ENGINE_GEARS[i], b = ENGINE_GEARS[j];
				if (edges.some(([left, right]) => (left === a && right === b) || (left === b && right === a))) continue;
				expect(Math.hypot(a.x - b.x, a.y - b.y) - radiusAtTip(a) - radiusAtTip(b)).toBeGreaterThan(15);
			}
		}
	});

	it("reserves clear space for unscaled HTML captions even at the minimum 1000px canvas width", () => {
		const minimumCanvasScale = 1000 / ENGINE_WIDTH;
		const captions = Object.values(GEAR_TRAINS).map((train) => {
			const satellite = train[3];
			return { x: satellite.x - 110, y: satellite.y + satellite.radius + 21.25, width: 220, height: 70 / minimumCanvasScale };
		});
		captions.push({ x: 450, y: 594, width: 300, height: 26 / minimumCanvasScale });
		for (const caption of captions) {
			expect(caption.x).toBeGreaterThan(0);
			expect(caption.x + caption.width).toBeLessThan(ENGINE_WIDTH);
			expect(caption.y).toBeGreaterThan(0);
			expect(caption.y + caption.height).toBeLessThan(ENGINE_HEIGHT);
			for (const gear of ENGINE_GEARS) {
				const dx = Math.max(caption.x - gear.x, 0, gear.x - caption.x - caption.width);
				const dy = Math.max(caption.y - gear.y, 0, gear.y - caption.y - caption.height);
				expect(Math.hypot(dx, dy) - radiusAtTip(gear)).toBeGreaterThan(11);
			}
		}
	});

	it.each([12, 18, 24, 32, 64])("generates a finite, closed %i-tooth involute outline with true root/tip radii", (teeth) => {
		const path = gearPath(teeth);
		expect(path).toMatch(/^M[-\d.,L]+Z$/);
		expect(path).not.toMatch(/NaN|Infinity/);
		expect(path).toBe(gearPath(teeth));
		const points = [...path.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
		expect(points).toHaveLength(teeth * 43);
		const radii = points.map(([x, y]) => Math.hypot(x, y));
		expect(Math.min(...radii)).toBeCloseTo(teeth * GEAR_MODULE / 2 - 1.25 * GEAR_MODULE, 4);
		expect(Math.max(...radii)).toBeCloseTo(teeth * GEAR_MODULE / 2 + GEAR_MODULE, 4);
		const pitchRadius = teeth * GEAR_MODULE / 2;
		const baseRadius = pitchRadius * Math.cos(GEAR_PRESSURE_ANGLE);
		const inv = (angle: number) => Math.tan(angle) - angle;
		for (const [x, y] of points.slice(1, 18)) {
			const radius = Math.hypot(x, y);
			const pressureAtRadius = Math.acos(Math.min(1, baseRadius / radius));
			const expectedHalf = Math.PI / (2 * teeth) - GEAR_HALF_BACKLASH / pitchRadius
				+ inv(GEAR_PRESSURE_ANGLE) - inv(pressureAtRadius);
			expect(Math.atan2(y, x)).toBeCloseTo(-expectedHalf, 6);
		}
		expect(radii[1]).toBeCloseTo(Math.max(pitchRadius - 1.25 * GEAR_MODULE, baseRadius), 4);
		// Repeated teeth have identical geometry, rotated by exactly one pitch.
		const angle = TAU / teeth;
		for (let point = 0; point < 43; point++) {
			const [x, y] = points[point], [nextX, nextY] = points[point + 43];
			expect(nextX).toBeCloseTo(x * Math.cos(angle) - y * Math.sin(angle), 4);
			expect(nextY).toBeCloseTo(x * Math.sin(angle) + y * Math.cos(angle), 4);
		}
		expect(GEAR_HALF_BACKLASH).toBe(0.06);
	});

	it.each([0, 11, 12.5, 257, NaN, Infinity])("rejects unsupported tooth count %s", (teeth) => {
		expect(() => gearPath(teeth)).toThrow(RangeError);
	});
});

import { describe, expect, it } from "vitest";

import {
	CORE_GEAR,
	CORE_CAPTION_Y,
	COMPONENT_GEARS,
	ENGINE_GEARS,
	ENGINE_HEIGHT,
	ENGINE_WIDTH,
	GEAR_HALF_BACKLASH,
	GEAR_ADDENDUM,
	GEAR_TIP_TO_ROOT_RATIO,
	GEAR_MODULE,
	GEAR_PRESSURE_ANGLE,
	GEAR_SECONDS_PER_TOOTH,
	GEAR_CONTACTS,
	SUB_GEARS,
	gearPath,
	type EngineGear,
} from "./worker-gears";

const TAU = 2 * Math.PI;
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const phaseError = (value: number) => Math.abs(mod(value + Math.PI, TAU) - Math.PI);
const edges = GEAR_CONTACTS;
const radiusAtTip = (gear: EngineGear) => gear.radius + GEAR_MODULE * GEAR_ADDENDUM;

describe("Worker engine gear geometry", () => {
	it("retains five main gears and adds four mechanically connected sub-wheels", () => {
		expect(ENGINE_GEARS).toHaveLength(9);
		expect(new Set(ENGINE_GEARS.map((gear) => gear.id)).size).toBe(9);
		expect(edges).toHaveLength(8);
		expect(CORE_GEAR).toMatchObject({ id: "core", x: 500, y: 420, teeth: 64, radius: 200, phaseRadians: 0, direction: 1, period: 51.2 });
		for (const [id, gear] of Object.entries(COMPONENT_GEARS)) {
			expect(gear.id).toBe(`${id}-satellite`);
			expect(gear.kind).toBe("satellite");
			expect(gear.radius).toBeLessThan(CORE_GEAR.radius);
		}
		for (const [a, b] of edges) {
			expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(a.radius + b.radius, 10);
		}
		for (const gear of ENGINE_GEARS) expect(gear.radius * 2 / gear.teeth).toBe(GEAR_MODULE);
	});

	it("keeps sub-wheels smaller, fully driven, and free of locked gear loops", () => {
		expect(SUB_GEARS).toHaveLength(4);
		expect(new Set(SUB_GEARS.map(gear => gear.teeth)).size).toBe(4);
		const reached = new Set([CORE_GEAR]);
		for (const [parent, child] of edges) {
			expect(reached.has(parent)).toBe(true);
			expect(reached.has(child)).toBe(false);
			reached.add(child);
		}
		expect(reached.size).toBe(ENGINE_GEARS.length);
		for (const gear of SUB_GEARS) {
			expect(gear.kind).toBe("idler");
			expect(gear.radius).toBeLessThan(60);
			expect(gear.period).toBeLessThan(Math.min(...Object.values(COMPONENT_GEARS).map(g => g.period)));
		}
	});

	it("creates a compact stepped cluster with varied component sizes", () => {
		const { models, runtime, sandbox, tools } = COMPONENT_GEARS;
		expect(models.y).toBeLessThan(runtime.y);
		expect(runtime.y).toBeLessThan(CORE_GEAR.y);
		expect(CORE_GEAR.y).toBeLessThan(sandbox.y);
		expect(sandbox.y).toBeLessThan(tools.y);
		expect(models.x).toBeLessThan(CORE_GEAR.x);
		expect(sandbox.x).toBeLessThan(CORE_GEAR.x);
		expect(runtime.x).toBeGreaterThan(CORE_GEAR.x);
		expect(tools.x).toBeGreaterThan(CORE_GEAR.x);
		expect(new Set(Object.values(COMPONENT_GEARS).map((gear) => gear.radius)).size).toBe(3);
		const width = Math.max(...ENGINE_GEARS.map((g) => g.x + radiusAtTip(g))) - Math.min(...ENGINE_GEARS.map((g) => g.x - radiusAtTip(g)));
		expect(width).toBeLessThan(820);
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

	it("matches pitch-line speed and reverses each component at its own tooth-count ratio", () => {
		expect(new Set(ENGINE_GEARS.map((gear) => gear.period)).size).toBe(8);
		for (const gear of ENGINE_GEARS) expect(gear.period).toBeCloseTo(gear.teeth * GEAR_SECONDS_PER_TOOTH, 12);
		for (const [a, b] of edges) {
			expect(a.direction).toBe(-b.direction);
			expect(a.radius * a.direction / a.period + b.radius * b.direction / b.period).toBeCloseTo(0, 12);
		}
		for (const gear of Object.values(COMPONENT_GEARS)) {
			expect(gear.direction).toBe(-1);
			expect(CORE_GEAR.period / gear.period).toBeCloseTo(CORE_GEAR.teeth / gear.teeth, 12);
		}
	});

	it("gives the cropped teeth positive tip-to-root clearance at every contact", () => {
		expect(GEAR_ADDENDUM).toBe(0.4);
		expect(GEAR_TIP_TO_ROOT_RATIO).toBe(0.7);
		for (const [a, b] of edges) {
			const rootB = b.radius - 1.25 * GEAR_MODULE;
			expect(a.radius + b.radius - radiusAtTip(a) - rootB).toBeCloseTo(0.85 * GEAR_MODULE, 12);
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

	it("keeps the core caption clear of the cluster at the minimum 1000px canvas width", () => {
		const minimumCanvasScale = 1000 / ENGINE_WIDTH;
		const captions = [{ x: CORE_GEAR.x - 150, y: CORE_CAPTION_Y, width: 300, height: 26 / minimumCanvasScale }];
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

	it.each([12, 14, 16, 18, 24, 32, 36, 40, 64])("generates a closed %i-tooth outline with straight flanks and broad flat tips", (teeth) => {
		const path = gearPath(teeth);
		expect(path).toMatch(/^M[-\d.,L]+Z$/);
		expect(path).not.toMatch(/NaN|Infinity/);
		expect(path).toBe(gearPath(teeth));
		const points = [...path.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
		expect(points).toHaveLength(teeth * 8);
		const radii = points.map(([x, y]) => Math.hypot(x, y));
		expect(Math.min(...radii)).toBeCloseTo(teeth * GEAR_MODULE / 2 - 1.25 * GEAR_MODULE, 4);
		expect(Math.max(...radii)).toBeCloseTo(teeth * GEAR_MODULE / 2 + GEAR_MODULE * GEAR_ADDENDUM, 4);
		const [rootLeft, tipLeft, tipRight, rootRight] = points;
		expect(rootLeft[0]).toBe(rootRight[0]);
		expect(tipLeft[0]).toBe(tipRight[0]);
		expect(tipLeft[0]).toBeGreaterThan(rootLeft[0]);
		const rootWidth = rootRight[1] - rootLeft[1];
		const tipWidth = tipRight[1] - tipLeft[1];
		expect(tipWidth).toBeGreaterThan(7.2);
		expect(tipWidth / rootWidth).toBeGreaterThan(0.6999);
		expect(tipWidth / rootWidth).toBeLessThan(0.8);
		const pitchRadius = teeth * GEAR_MODULE / 2;
		const baseRadius = pitchRadius * Math.cos(GEAR_PRESSURE_ANGLE);
		const inv = (angle: number) => Math.tan(angle) - angle;
		// Straight sides remove material from the reference envelope rather than
		// widening teeth into the neighboring wheel's sweep.
		for (let sample = 0; sample <= 100; sample++) {
			const t = sample / 100;
			const x = rootRight[0] + t * (tipRight[0] - rootRight[0]);
			const y = rootRight[1] + t * (tipRight[1] - rootRight[1]);
			const radius = Math.hypot(x, y);
			const pressureAtRadius = Math.acos(Math.min(1, baseRadius / radius));
			const expectedHalf = Math.PI / (2 * teeth) - GEAR_HALF_BACKLASH / pitchRadius
				+ inv(GEAR_PRESSURE_ANGLE) - inv(pressureAtRadius);
			expect(Math.atan2(y, x) - expectedHalf).toBeLessThan(1e-6);
		}
		// Repeated teeth have identical geometry, rotated by exactly one pitch.
		const angle = TAU / teeth;
		for (let point = 0; point < 8; point++) {
			const [x, y] = points[point], [nextX, nextY] = points[point + 8];
			expect(nextX).toBeCloseTo(x * Math.cos(angle) - y * Math.sin(angle), 4);
			expect(nextY).toBeCloseTo(x * Math.sin(angle) + y * Math.cos(angle), 4);
		}
		expect(GEAR_HALF_BACKLASH).toBe(0.06);
	});

	it.each([0, 11, 12.5, 257, NaN, Infinity])("rejects unsupported tooth count %s", (teeth) => {
		expect(() => gearPath(teeth)).toThrow(RangeError);
	});
});

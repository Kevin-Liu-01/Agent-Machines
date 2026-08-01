/**
 * Drift guard: the UI mirror in capabilities.ts must match what the mux
 * adapters actually declare. This reads the mux sources as text (the web
 * package cannot import across the package boundary) and asserts every
 * mirrored value, so a capability change in src/mux fails here instead
 * of silently making the dashboard lie.
 *
 * Two translations the mirror makes, both checked here:
 *
 *   - the mux writes an unprovable vendor fact as the string "unknown"; the
 *     mirror writes `null`. A null therefore has to find `"unknown"` in the
 *     adapter, not merely be absent from it.
 *   - the mux writes long numbers with underscore separators (3_600_000) and
 *     derives a couple of values from named constants (DEFAULT_PORTS.length),
 *     so the comparisons below normalize separators and follow one level of
 *     constant reference rather than demanding a copied literal.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	HARNESS_CAPABILITIES,
	SUBSTRATE_CAPABILITIES,
	type SubstrateCapability,
} from "@/lib/mux/capabilities";

const MUX_ROOT = join(process.cwd(), "..", "src", "mux");

function readMuxSource(relative: string): string {
	return readFileSync(join(MUX_ROOT, relative), "utf8");
}

/** 3600000 also matches the source's 3_600_000. */
function numberPattern(value: number): string {
	return String(value).split("").join("_?");
}

/**
 * One axis of the capability literal as source text.
 *
 * The declared axes are flat objects (no nesting), so the first `},` after the
 * key closes it -- which keeps `available:` in `region` from being satisfied by
 * `available:` in `gpu`.
 */
function axisBlock(source: string, axis: string): string {
	const start = source.indexOf(`\n\t${axis}: {`);
	expect(
		start,
		`the provider must declare ${axis} in its CAPABILITIES literal`,
	).toBeGreaterThan(-1);
	const end = source.indexOf("},", start);
	expect(end, `${axis} declaration is not closed`).toBeGreaterThan(start);
	return source.slice(start, end);
}

/** Assert `key: <value>`, with null standing in for the string "unknown". */
function expectValue(scope: string, key: string, value: unknown): void {
	if (value === null) {
		expect(scope, `${key} must be declared "unknown"`).toMatch(
			new RegExp(`${key}:\\s*"unknown"`),
		);
		return;
	}
	if (typeof value === "number") {
		expect(scope, `${key} must be ${value}`).toMatch(
			new RegExp(`${key}:\\s*${numberPattern(value)}\\b`),
		);
		return;
	}
	if (typeof value === "boolean") {
		expect(scope, `${key} must be ${String(value)}`).toMatch(
			new RegExp(`${key}:\\s*${String(value)}`),
		);
		return;
	}
	expect(scope, `${key} must be "${String(value)}"`).toMatch(
		new RegExp(`${key}:\\s*"${String(value)}"`),
	);
}

/**
 * Port numbers reachable from a `fixed:` declaration, following one level of
 * constant reference: the adapters write `[SPRITE_PROXY_PORT]` and
 * `[...DEFAULT_PORTS]` on purpose, so the declared capability cannot drift
 * from the port the code actually proxies.
 */
function resolvedPorts(source: string, block: string): number[] {
	const match = block.match(/fixed:\s*(\[[^\]]*\]|null)/);
	expect(match, "publicPorts must declare a fixed list or null").not.toBeNull();
	let text = match?.[1] ?? "null";
	for (const identifier of text.match(/[A-Z][A-Z0-9_]+/g) ?? []) {
		const declaration = source.match(
			new RegExp(`const ${identifier}\\s*=\\s*([^;]*);`),
		);
		if (declaration) text += ` ${declaration[1]}`;
	}
	return (text.match(/\d+/g) ?? []).map(Number);
}

describe("substrate capability mirror", () => {
	for (const substrate of SUBSTRATE_CAPABILITIES) {
		it(`${substrate.kind} matches its provider declaration`, () => {
			const source = readMuxSource(`providers/${substrate.kind}.ts`);
			// Providers declare capabilities as an object literal; assert on
			// the declared key/value pairs rather than parsing TypeScript.
			expect(source).toMatch(new RegExp(`pty:\\s*"${substrate.pty}"`));
			expect(source).toMatch(
				new RegExp(`persistence:\\s*"${substrate.persistence}"`),
			);
			expect(source).toMatch(
				new RegExp(`reattach:\\s*${String(substrate.reattach)}`),
			);
			expect(source).toMatch(
				new RegExp(`publicUrl:\\s*${String(substrate.publicUrl)}`),
			);
			expect(source).toMatch(
				new RegExp(`streamingExec:\\s*${String(substrate.streamingExec)}`),
			);
			expect(source).toMatch(
				new RegExp(`detachedWork:\\s*"${substrate.detachedWork}"`),
			);
		});

		it(`${substrate.kind} matches its declared region, gpu, network and fork`, () => {
			const source = readMuxSource(`providers/${substrate.kind}.ts`);

			const region = axisBlock(source, "region");
			expectValue(region, "default", substrate.region.default);
			expectValue(region, "select", substrate.region.select);
			if (substrate.region.available === null) {
				expectValue(region, "available", null);
			} else {
				for (const name of substrate.region.available) {
					expect(region).toContain(`"${name}"`);
				}
			}

			const gpu = axisBlock(source, "gpu");
			expectValue(gpu, "available", substrate.gpu.available);
			expectValue(gpu, "request", substrate.gpu.request);

			const network = axisBlock(source, "network");
			expectValue(network, "egress", substrate.egress);
			expectValue(network, "control", substrate.networkControl);

			const fork = axisBlock(source, "fork");
			expectValue(fork, "vendor", substrate.fork.vendor);
			expectValue(fork, "exposed", substrate.fork.exposed);
		});

		it(`${substrate.kind} matches its declared public ports`, () => {
			const source = readMuxSource(`providers/${substrate.kind}.ts`);
			const block = axisBlock(source, "publicPorts");
			expectValue(block, "model", substrate.publicPorts.model);

			const ports = resolvedPorts(source, block);
			expect(ports).toEqual([...(substrate.publicPorts.fixed ?? [])]);

			const raw = block.match(/muxMax:\s*([^,\n]+)/)?.[1]?.trim() ?? "";
			if (substrate.publicPorts.muxMax === null) {
				expect(raw).toBe('"unknown"');
			} else if (/^\d[\d_]*$/.test(raw)) {
				expect(Number(raw.replace(/_/g, ""))).toBe(substrate.publicPorts.muxMax);
			} else {
				// An expression over the fixed list (DEFAULT_PORTS.length): the
				// count it resolves to is what the mirror must claim.
				expect(ports.length).toBe(substrate.publicPorts.muxMax);
			}
		});

		it(`${substrate.kind} matches its declared limits`, () => {
			const source = readMuxSource(`providers/${substrate.kind}.ts`);
			const block = axisBlock(source, "limits");
			for (const [key, value] of Object.entries(substrate.limits)) {
				expectValue(block, key, value as SubstrateCapability["limits"][never]);
			}
		});
	}

	it("declares every axis the router can filter on", () => {
		// The mux type makes the vendor-fact axes optional (absent reads as
		// unknown and fails closed), so a shipped adapter silently dropping one
		// would not be a type error. It is a bug, and this is where it surfaces.
		for (const substrate of SUBSTRATE_CAPABILITIES) {
			const source = readMuxSource(`providers/${substrate.kind}.ts`);
			for (const axis of [
				"region",
				"gpu",
				"network",
				"fork",
				"publicPorts",
				"limits",
			]) {
				expect(source, `${substrate.kind} must declare ${axis}`).toContain(
					`\n\t${axis}: {`,
				);
			}
		}
	});

	it("mirrors every axis of the mux capability contract", () => {
		// A new axis added to SandboxCapabilities must reach the dashboard, so
		// the mirror is compared against the contract's own key list.
		const types = readMuxSource("types.ts");
		const declaration = types.slice(
			types.indexOf("export type SandboxCapabilities = {"),
		);
		const body = declaration.slice(0, declaration.indexOf("\n};"));
		const axes = (body.match(/^\t(\w+)\??:/gm) ?? []).map((line) =>
			line.replace(/[\t?:]/g, ""),
		);
		const mirrored = new Set(Object.keys(SUBSTRATE_CAPABILITIES[0]));
		// `network` is mirrored as the two flat fields the UI renders.
		mirrored.add("network");
		for (const axis of axes) {
			expect(mirrored.has(axis), `capabilities.ts must mirror ${axis}`).toBe(true);
		}
		expect(axes.length).toBeGreaterThanOrEqual(12);
	});

	it("covers exactly the substrates the factory can build", () => {
		const source = readMuxSource("providers/index.ts");
		for (const substrate of SUBSTRATE_CAPABILITIES) {
			expect(source).toContain(`case "${substrate.kind}":`);
		}
		const cases = source.match(/case "[a-z0-9-]+":/g) ?? [];
		expect(cases.length).toBe(SUBSTRATE_CAPABILITIES.length);
	});
});

describe("harness capability mirror", () => {
	for (const harness of HARNESS_CAPABILITIES) {
		it(`${harness.kind} matches its adapter declaration`, () => {
			const file = harness.kind === "claude-code" ? "claude-code" : harness.kind;
			const source = readMuxSource(`harnesses/${file}.ts`);
			expect(source).toMatch(
				new RegExp(`requiredUpstream:\\s*"${harness.requiredUpstream}"`),
			);
		});
	}

	it("covers exactly the harnesses the factory can build", () => {
		const source = readMuxSource("harnesses/index.ts");
		for (const harness of HARNESS_CAPABILITIES) {
			expect(source).toContain(`case "${harness.kind}":`);
		}
		const cases = source.match(/case "[a-z-]+":/g) ?? [];
		expect(cases.length).toBe(HARNESS_CAPABILITIES.length);
	});
});

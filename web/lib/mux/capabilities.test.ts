/**
 * Drift guard: the UI mirror in capabilities.ts must match what the mux
 * adapters actually declare. This reads the mux sources as text (the web
 * package cannot import across the package boundary) and asserts every
 * mirrored value, so a capability change in src/mux fails here instead
 * of silently making the dashboard lie.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	HARNESS_CAPABILITIES,
	SUBSTRATE_CAPABILITIES,
} from "@/lib/mux/capabilities";

const MUX_ROOT = join(process.cwd(), "..", "src", "mux");

function readMuxSource(relative: string): string {
	return readFileSync(join(MUX_ROOT, relative), "utf8");
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
		});
	}

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

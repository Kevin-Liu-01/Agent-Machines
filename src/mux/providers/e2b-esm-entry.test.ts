/**
 * The regression test for the ERR_REQUIRE_ESM production failure.
 *
 * Run: npx tsx --test src/mux/providers/e2b-esm-entry.test.ts
 *
 * WHAT BROKE: the deployed Vercel function logged
 *
 *   Failed to load external module e2b-f4587dfd9ddf46bd:
 *   Error [ERR_REQUIRE_ESM]: require() of ES Module
 *   .../chalk@5.6.2/node_modules/chalk/source/index.js
 *   from .../e2b@2.37.0/node_modules/e2b/dist/index.js not supported.
 *
 * e2b 2.37.0 ships no "exports" map, so `main` (dist/index.js, CommonJS) is
 * what both `require("e2b")` and `import("e2b")` land on -- Node's ESM resolver
 * never reads "module". That CommonJS build require()s ESM-only chalk 5, so it
 * loads only on a Node with require(ESM) (>= 20.19 / >= 22.12). Both adapters
 * therefore import `e2b/dist/index.mjs` explicitly.
 *
 * WHY A CHILD PROCESS: the capability is a process-launch flag, so it cannot be
 * toggled in-process. `--no-experimental-require-module` turns require(ESM)
 * OFF, making this Node behave like the deployed one -- verified inside the
 * child itself via `process.features.require_module`, not via the flag string,
 * so a Node that silently ignored the flag cannot produce a green run.
 *
 * WHY THE NEGATIVE CASE IS NOT OPTIONAL: without it, "the ESM entry loads"
 * would also pass on a Node where everything loads, which is precisely the
 * machine this bug hid on. Asserting that the bare specifier STILL fails is
 * what proves the run reproduces production.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

/** The specifier under test; must match both adapters and the build guard. */
const ESM_ENTRY = "e2b/dist/index.mjs";

/**
 * Probed from web/, the resolution root of the deployed app. The repo root
 * resolves the same physical e2b (one pnpm store), and scripts/assert-e2b-esm-
 * entry.mjs is what asserts that for both roots on every build.
 */
const PROBE = `
const results = {};
results.requireModule = process.features.require_module;
for (const spec of ${JSON.stringify([ESM_ENTRY, "e2b"])}) {
	try {
		const mod = await import(spec);
		results[spec] = typeof mod.Sandbox === "function" ? "OK" : "NO_SANDBOX";
	} catch (error) {
		results[spec] = "FAIL:" + (error && error.code);
	}
}
console.log(JSON.stringify(results));
`;

function probe(flags: string[]): Record<string, string | boolean> {
	const out = execFileSync(process.execPath, [...flags, "--input-type=module", "-e", PROBE], {
		cwd: new URL("../../../web/", import.meta.url).pathname,
		encoding: "utf8",
		timeout: 120_000,
	});
	return JSON.parse(out.trim().split("\n").at(-1) as string);
}

test("e2b's ESM entry loads on a Node that cannot require(ESM)", () => {
	const production = probe(["--no-experimental-require-module"]);

	assert.equal(
		production.requireModule,
		false,
		`the child kept require(ESM) enabled, so this run does not reproduce production: ${JSON.stringify(production)}`,
	);

	assert.equal(
		production[ESM_ENTRY],
		"OK",
		`import("${ESM_ENTRY}") must load without require(ESM) -- this is the production failure. Got: ${JSON.stringify(production)}`,
	);

	// Non-vacuity: the bare specifier is what broke, and it must still break
	// here. If this ever passes, e2b changed its packaging and the deep-path
	// bet in both adapters should be re-argued from measurement, not kept out
	// of habit.
	assert.equal(
		production.e2b,
		"FAIL:ERR_REQUIRE_ESM",
		`import("e2b") unexpectedly succeeded without require(ESM), so this test no longer proves it reproduces the production condition. Re-measure e2b's packaging before trusting it. Got: ${JSON.stringify(production)}`,
	);
});

test("e2b's ESM entry also loads on a Node that can require(ESM)", () => {
	const modern = probe([]);

	assert.equal(
		modern.requireModule,
		true,
		`expected the default runtime to support require(ESM): ${JSON.stringify(modern)}`,
	);
	assert.equal(
		modern[ESM_ENTRY],
		"OK",
		`import("${ESM_ENTRY}") must work on both sides of the require(ESM) boundary; that runtime-independence is the whole reason it was chosen over raising the Node floor. Got: ${JSON.stringify(modern)}`,
	);
});

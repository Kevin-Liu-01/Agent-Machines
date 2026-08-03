/**
 * The published entry points, guarded.
 *
 * ROADMAP 3c: the compiled package is the ONLY import form Turbopack resolves,
 * so `exports` is not a nicety here -- it is the whole interface between the mux
 * and every consumer, including our own dashboard. It is also invisible: every
 * test in this repo imports source paths directly, so a broken `exports` map
 * passes the entire suite and fails at the consumer. Measured 2026-08-02 against
 * a real `npm pack` + `npm install`; these tests keep that measurement true.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "../..");

type Conditions = Record<string, string>;

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
	type?: string;
	main?: string;
	types?: string;
	files?: string[];
	engines?: { node?: string };
	exports: Record<string, Conditions | string>;
};

/** Subpath -> conditions, skipping the plain-string entries like package.json. */
function conditionalEntries(): Array<[string, Conditions]> {
	return Object.entries(pkg.exports).filter(
		(entry): entry is [string, Conditions] => typeof entry[1] === "object",
	);
}

/** `./dist/mux/*.js` with `state` -> `./dist/mux/state.js`. */
function substitute(target: string, star: string): string {
	return target.replace("*", star);
}

test("every export target resolves to a file the compiler will emit", () => {
	// dist/ may not exist (a clean checkout, or CI before build:sdk), so this
	// checks the SOURCE each target is compiled from. That is the stronger
	// assertion anyway: a target whose source is gone is broken even if a stale
	// dist still satisfies it.
	for (const [subpath, conditions] of conditionalEntries()) {
		for (const [condition, target] of Object.entries(conditions)) {
			assert.match(
				target,
				/^\.\/dist\//,
				`${subpath} [${condition}] must be served from dist/, got ${target}`,
			);
			const star = subpath.includes("*") ? "state" : "";
			const source = substitute(target, star)
				.replace(/^\.\/dist\//, "src/")
				.replace(/\.d\.ts$/, ".ts")
				.replace(/\.js$/, ".ts");
			assert.ok(
				existsSync(resolve(ROOT, source)),
				`${subpath} [${condition}] -> ${target} has no source at ${source}`,
			);
		}
	}
});

test("files: dist is the only thing shipped, so nothing outside it may be exported", () => {
	assert.deepEqual(pkg.files, ["dist"]);
	// A target outside dist/ resolves locally and 404s for an installed consumer,
	// which is the failure mode that looks like a broken publish.
	for (const [, conditions] of conditionalEntries()) {
		for (const target of Object.values(conditions)) {
			assert.ok(target.startsWith("./dist/"), target);
		}
	}
});

test("require() support goes through module-sync, never a require condition", () => {
	// This package is ESM-only ("type": "module"). A `require` condition would
	// resolve on EVERY Node and then throw ERR_REQUIRE_ESM at runtime on
	// 20.0-20.18, which engines ">=20" still admits. `module-sync` is matched
	// only by Nodes that can require() ESM (>= 20.19 / 22.12); the rest skip it
	// and get a clear "not exported" instead of a runtime explosion. Measured:
	// with module-sync, `require("agent-machines")` returns 22 exports on v24.
	assert.equal(pkg.type, "module", "the reasoning below assumes an ESM-only package");
	for (const [subpath, conditions] of conditionalEntries()) {
		assert.ok(
			!("require" in conditions),
			`${subpath} declares a require condition; an ESM-only package must use module-sync (see this test)`,
		);
		assert.ok(
			"module-sync" in conditions,
			`${subpath} has no module-sync condition, so require() of it fails`,
		);
	}
});

test("each subpath ships types, and every condition points at the same module", () => {
	for (const [subpath, conditions] of conditionalEntries()) {
		assert.ok(conditions.types, `${subpath} has no types condition`);
		assert.match(conditions.types, /\.d\.ts$/, `${subpath} types must be a .d.ts`);
		// types first: Node ignores order, TypeScript takes the first match, and a
		// types condition listed after import is a well-known silent miss.
		assert.equal(
			Object.keys(conditions)[0],
			"types",
			`${subpath} must list types first`,
		);
		// module-sync and import must be the SAME file. Two different files here
		// means a consumer that require()s and a consumer that imports get two
		// module instances -- and this package keeps module-level state (the
		// placement store singleton in src/mux/state.ts), so that is a real bug,
		// not a style point.
		assert.equal(
			conditions["module-sync"],
			conditions.import,
			`${subpath}: module-sync and import must resolve to one module instance`,
		);
		assert.equal(
			conditions.types.replace(/\.d\.ts$/, ""),
			conditions.import.replace(/\.js$/, ""),
			`${subpath}: types and code must describe the same module`,
		);
	}
});

test("the mux plane is exported by wildcard; the hosted client's internals are not", () => {
	const subpaths = Object.keys(pkg.exports);
	assert.ok(subpaths.includes("./mux"), "the mux plane needs a named entry point");
	assert.ok(subpaths.includes("./mux/*"), "MUX.md documents the mux plane module by module");
	// dist/lib holds the hosted client (src/lib/sdk.ts, routing.ts). Nothing
	// documents those as an API; exporting them by wildcard would promise
	// forever what was written as an internal.
	assert.ok(
		!subpaths.some((subpath) => subpath.startsWith("./lib")),
		"src/lib is the hosted client's internals and must stay private",
	);
	// The root re-exports the mux (`export * from "./mux/index.js"`), so a
	// consumer never NEEDS ./mux -- it is there so importing the router does not
	// drag in the hosted SDK client. If the root ever stops re-exporting it, this
	// comment is the record of why both exist.
	assert.match(
		readFileSync(resolve(ROOT, "src/index.ts"), "utf8"),
		/export \* from "\.\/mux\/index\.js";/,
	);
});

test("package.json is exported, because tooling reads it through the specifier", () => {
	assert.equal(pkg.exports["./package.json"], "./package.json");
});

test("main and types keep pointing at the root export, for pre-exports resolvers", () => {
	const root = pkg.exports["."] as Conditions;
	assert.equal(pkg.main, root.import);
	assert.equal(pkg.types, root.types);
});

/**
 * Fail the build if e2b's ESM entry is not where the adapters load it from.
 *
 * WHY THIS EXISTS: both e2b adapters (web/lib/providers/e2b.ts and
 * src/mux/providers/e2b.ts) load `e2b/dist/index.mjs` by its explicit path
 * rather than the bare specifier, because e2b 2.37.0 ships no "exports" map --
 * `main` is dist/index.js (CJS) and `module` is dist/index.mjs (ESM), and
 * Node's ESM resolver never reads "module", so even `import("e2b")` lands on
 * the CJS build, which `require("chalk")`s an ESM-only chalk 5 and therefore
 * only loads on a Node with require(ESM) (>= 20.19 / >= 22.12). The deployed
 * Vercel function's Node does not have it; that is the production failure this
 * guards. See the block comment in either adapter for the full measurement.
 *
 * WHY A BUILD STEP: `next build` does catch a plainly missing entry -- measured
 * 2026-08-02 by renaming e2b/dist/index.mjs, it exits 1 with "Turbopack build
 * failed with 1 errors: Module not found: Can't resolve 'e2b/dist/index.mjs'".
 * That only holds while the adapters keep NO fallback, and it is not the whole
 * story:
 *   - `build:sdk` and `prepack` produce the published `agent-machines` package
 *     and never run `next build` at all, so nothing else guards that half.
 *   - It checks BOTH resolution roots. The SDK resolves e2b from the repo root
 *     (optional peer + devDependency), the Next app from web/; a fix that holds
 *     at only one is not a fix.
 *   - `tsc` is no help either way: e2b ships a separate dist/index.d.mts, so
 *     types keep resolving after the runtime file is gone.
 *   - It fails in a second, before a two-minute compile, and says what to do.
 *
 * WHY IT ANCHORS ON THE PACKAGE DIRECTORY: `require.resolve("e2b/dist/index.mjs")`
 * alone is a false green, because CommonJS keeps walking up node_modules when a
 * SUBPATH misses even though the package itself was already found. Measured
 * 2026-08-02 with two nested node_modules, inner e2b lacking dist/index.mjs and
 * outer having it:
 *   require.resolve("e2b/package.json")   -> <inner>/node_modules/e2b/package.json
 *   require.resolve("e2b/dist/index.mjs") -> <outer>/node_modules/e2b/dist/index.mjs
 * That is a git worktree, or any nested checkout, silently passing on a sibling's
 * copy of a file the package in use does not have. So the entry is located
 * relative to the resolved `e2b/package.json` and required to live inside that
 * directory, rather than wherever the resolver ends up.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/** The specifier both adapters import; keep these three in step. */
const ENTRY_SUBPATH = "dist/index.mjs";
const SPECIFIER = `e2b/${ENTRY_SUBPATH}`;

/**
 * Both resolution roots that matter, because they can differ: the published SDK
 * resolves e2b from the repo root (an optional peer + devDependency), and the
 * Next app resolves it from web/ (a real dependency). A fix that only holds at
 * one of them is not a fix.
 */
const ROOTS = [
	{ label: "repo root (published agent-machines SDK)", from: join(REPO_ROOT, "package.json") },
	{ label: "web (deployed Next app)", from: join(REPO_ROOT, "web", "package.json") },
];

const problems = [];

for (const root of ROOTS) {
	const require_ = createRequire(root.from);

	let packageJsonPath;
	try {
		packageJsonPath = require_.resolve("e2b/package.json");
	} catch (error) {
		// ERR_PACKAGE_PATH_NOT_EXPORTED here means e2b grew an "exports" map
		// (chalk 5 hides its own package.json exactly this way). That is the one
		// upstream change that could also close the deep ESM path, so it is
		// reported as its own cause rather than as a broken install.
		problems.push(
			error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
				? `${root.label}: e2b now declares an "exports" map that hides ./package.json, so its resolution rules have changed. Re-check which entry exposes the ESM build before trusting ${SPECIFIER}.`
				: `${root.label}: cannot resolve e2b at all (${error.code ?? "unknown"}). Run an install.`,
		);
		continue;
	}

	const packageDir = dirname(packageJsonPath);
	const entry = join(packageDir, ENTRY_SUBPATH);

	if (!existsSync(entry)) {
		problems.push(
			`${root.label}: ${SPECIFIER} is missing (looked for ${entry}). e2b's dist layout changed.`,
		);
		continue;
	}

	// The specifier itself is the authority: an added "exports" map can make it
	// unresolvable even with the file on disk, and that surfaces here.
	const version = JSON.parse(readFileSync(packageJsonPath, "utf8")).version ?? "unknown";
	let resolved;
	try {
		resolved = require_.resolve(SPECIFIER);
	} catch (error) {
		problems.push(
			`${root.label}: ${SPECIFIER} does not resolve from e2b ${version} (${error.code ?? "unknown"}), even though the file is on disk -- e2b's "exports" map now gates it.`,
		);
		continue;
	}

	// It must be the copy inside the package THIS root resolves, not one found
	// by CommonJS walking up node_modules into a parent checkout.
	const outside = relative(packageDir, resolved).startsWith("..");
	if (outside) {
		problems.push(
			`${root.label}: ${SPECIFIER} resolved to ${resolved}, which is OUTSIDE the e2b package this root resolves (${packageDir}). CommonJS walked up node_modules and found someone else's copy; the local install is broken.`,
		);
	}
}

if (problems.length > 0) {
	console.error(
		`assert-e2b-esm-entry: FAIL\n${problems.map((line) => `  - ${line}`).join("\n")}\n\n` +
			`Both e2b adapters import "${SPECIFIER}" on purpose: e2b's CommonJS main require()s ESM-only chalk 5, which needs a Node with require(ESM) (>= 20.19 / >= 22.12), and the deployed function's Node does not have it -- that is the ERR_REQUIRE_ESM production failure. Fix by updating the specifier in web/lib/providers/e2b.ts and src/mux/providers/e2b.ts to e2b's current ESM build (and this script with it), or by pinning e2b to a version that still ships ${SPECIFIER}. Do NOT fall back to the bare "e2b" specifier: it works on a modern Node and dies on the deployed one, which is how this bug shipped green.`,
	);
	process.exit(1);
}

console.log(`assert-e2b-esm-entry: ${SPECIFIER} resolves from both package roots.`);

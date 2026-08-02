/**
 * Merge locally-held env values back over a freshly pulled web/.env.local.
 *
 *   npx tsx scripts/merge-env-local.ts [--from web/.env.local.pre-vercel]
 *
 * `vercel env pull` OVERWRITES the file, so anything local-only (ALLOW_DEV_AUTH
 * for dev auth, a hand-set key) is lost. Rather than hand-editing afterwards --
 * which is how a dev-only flag quietly goes missing and the next `pnpm dev`
 * fails in a way that looks unrelated -- this re-applies the saved copy.
 *
 * Precedence: the PULLED file wins on any key it defines, because those are the
 * project's real values from Vercel. Saved keys are only re-added when the pull
 * did not provide them. Nothing is ever printed, since these are credentials.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET = resolve(ROOT, "web/.env.local");

const args = process.argv.slice(2);
const fromFlag = args.indexOf("--from");
const SAVED = resolve(
	ROOT,
	fromFlag !== -1 && args[fromFlag + 1]
		? args[fromFlag + 1]
		: "web/.env.local.pre-vercel",
);

if (!existsSync(TARGET)) {
	console.error(`No ${TARGET}. Run \`vercel env pull web/.env.local\` first.`);
	process.exit(1);
}
if (!existsSync(SAVED)) {
	console.error(
		`No saved copy at ${SAVED}. Nothing to merge; the pulled file is already in place.`,
	);
	process.exit(1);
}

/** Keys defined by a dotenv-style file, in order, ignoring comments. */
function keysOf(text: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const line of text.split("\n")) {
		const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
		if (match) out.set(match[1], line);
	}
	return out;
}

const pulledText = readFileSync(TARGET, "utf8");
const savedText = readFileSync(SAVED, "utf8");
const pulled = keysOf(pulledText);
const saved = keysOf(savedText);

const restored: string[] = [];
for (const [key, line] of saved) {
	if (!pulled.has(key)) restored.push(line);
}

// Keep a copy of what Vercel produced before touching it, so a bad merge is
// recoverable without a second pull.
copyFileSync(TARGET, `${TARGET}.vercel-pull`);

const merged =
	restored.length > 0
		? `${pulledText.replace(/\n*$/, "\n")}\n# Restored from ${SAVED.replace(`${ROOT}/`, "")} by scripts/merge-env-local.ts\n${restored.join("\n")}\n`
		: pulledText;
writeFileSync(TARGET, merged, "utf8");

const overlap = [...saved.keys()].filter((k) => pulled.has(k));
console.log(`pulled keys:   ${pulled.size}`);
console.log(`restored keys: ${restored.length}${restored.length ? ` (${restored.map((l) => l.split("=")[0].trim()).join(", ")})` : ""}`);
if (overlap.length > 0) {
	console.log(
		`kept Vercel's value for: ${overlap.join(", ")} (the pull is authoritative)`,
	);
}
console.log(`\nwrote ${TARGET}`);
console.log(`raw pull kept at ${TARGET}.vercel-pull`);
const hasOidc = pulled.has("VERCEL_OIDC_TOKEN");
console.log(
	hasOidc
		? "\nVERCEL_OIDC_TOKEN is present -- the vercel lane should now be credentialed."
		: "\nNo VERCEL_OIDC_TOKEN in the pull. The vercel sandbox lane will still be skipped; see docs/VERCEL-SANDBOX-AUTH.md.",
);

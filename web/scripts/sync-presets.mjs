#!/usr/bin/env node
/**
 * Sync the curated preset catalog from the repo's `knowledge/presets.json`
 * into `web/data/presets.json`, the committed artifact the dashboard reads to
 * offer onboarding presets ("memory presets") and seed a user's first Worker +
 * Memory.
 *
 * Mirrors sync-skills.mjs / sync-memory.mjs: the source of truth is the
 * knowledge/ JSON; the web/data JSON is the derived artifact the Vercel build
 * consumes. No-op when `../knowledge` isn't present (Vercel's web/-rooted
 * build) -- the committed JSON is the fallback.
 *
 * After editing knowledge/presets.json, run `npm run sync-data` and commit the
 * updated artifact.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SRC_FILE = join(REPO_ROOT, "knowledge", "presets.json");
const OUT_DIR = join(WEB_ROOT, "data");
const OUT_FILE = join(OUT_DIR, "presets.json");

const REQUIRED_STRING = ["id", "name", "description", "agentKind"];
const REQUIRED_ARRAY = ["skillIds", "toolIds", "mcpServerIds"];

/** Throw on a malformed preset so a bad edit fails the build, not production. */
function validate(presets) {
	if (!Array.isArray(presets)) {
		throw new Error("presets.json must be a JSON array");
	}
	const seen = new Set();
	for (const preset of presets) {
		for (const key of REQUIRED_STRING) {
			if (typeof preset?.[key] !== "string" || !preset[key].trim()) {
				throw new Error(`preset missing string field "${key}": ${JSON.stringify(preset)}`);
			}
		}
		for (const key of REQUIRED_ARRAY) {
			if (!Array.isArray(preset?.[key])) {
				throw new Error(`preset "${preset.id}" missing array field "${key}"`);
			}
		}
		if (seen.has(preset.id)) throw new Error(`duplicate preset id "${preset.id}"`);
		seen.add(preset.id);
	}
}

function main() {
	if (!existsSync(SRC_FILE)) {
		if (existsSync(OUT_FILE)) {
			console.log(
				`sync-presets: ${SRC_FILE} not present (expected on Vercel root=web/); using committed ${OUT_FILE}`,
			);
			return;
		}
		console.error(
			`sync-presets: ${SRC_FILE} not present and no committed ${OUT_FILE} to fall back on`,
		);
		process.exit(1);
	}

	const presets = JSON.parse(readFileSync(SRC_FILE, "utf8"));
	validate(presets);
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(OUT_FILE, `${JSON.stringify(presets, null, 2)}\n`);
	console.log(`sync-presets: wrote ${presets.length} presets -> ${OUT_FILE}`);
}

main();

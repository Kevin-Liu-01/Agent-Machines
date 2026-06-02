#!/usr/bin/env node
/**
 * Sync the default starter pool from `knowledge/defaults.json` into
 * `web/data/defaults.json`, the committed artifact the dashboard reads to seed
 * every account's out-of-box skill/MCP loadout (a curated subset of the
 * bundled personal library; the rest is added from the Registry).
 *
 * Mirrors sync-presets.mjs: knowledge/ is the source of truth; web/data/ is the
 * derived artifact the Vercel build consumes. No-op when `../knowledge` isn't
 * present -- the committed JSON is the fallback.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SRC_FILE = join(REPO_ROOT, "knowledge", "defaults.json");
const OUT_DIR = join(WEB_ROOT, "data");
const OUT_FILE = join(OUT_DIR, "defaults.json");

function validate(data) {
	if (!data || typeof data !== "object") throw new Error("defaults.json must be an object");
	if (!Array.isArray(data.skillIds)) throw new Error("defaults.json missing skillIds array");
	if (!Array.isArray(data.mcpServerIds)) throw new Error("defaults.json missing mcpServerIds array");
}

function main() {
	if (!existsSync(SRC_FILE)) {
		if (existsSync(OUT_FILE)) {
			console.log(
				`sync-defaults: ${SRC_FILE} not present (expected on Vercel root=web/); using committed ${OUT_FILE}`,
			);
			return;
		}
		console.error(
			`sync-defaults: ${SRC_FILE} not present and no committed ${OUT_FILE} to fall back on`,
		);
		process.exit(1);
	}

	const data = JSON.parse(readFileSync(SRC_FILE, "utf8"));
	validate(data);
	const payload = {
		skillIds: data.skillIds,
		mcpServerIds: data.mcpServerIds,
	};
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
	console.log(
		`sync-defaults: wrote ${payload.skillIds.length} skills + ${payload.mcpServerIds.length} MCPs -> ${OUT_FILE}`,
	);
}

main();

#!/usr/bin/env node
/**
 * Sync `knowledge/mcps/catalog.json` into `web/data/mcps-catalog.json`.
 *
 * The web app cannot import repo-root JSON at build time (Next.js root = web/).
 * Same pattern as sync-skills.mjs: regenerate locally, commit the artifact for
 * Vercel builds where the parent directory is not visible.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SRC = join(REPO_ROOT, "knowledge", "mcps", "catalog.json");
const OUT_DIR = join(WEB_ROOT, "data");
const OUT_FILE = join(OUT_DIR, "mcps-catalog.json");

function main() {
	if (!existsSync(SRC)) {
		if (existsSync(OUT_FILE)) {
			console.log(
				`sync-mcp-catalog: ${SRC} not present (expected on Vercel root=web/); using committed ${OUT_FILE}`,
			);
			return;
		}
		console.error(
			`sync-mcp-catalog: ${SRC} not present and no committed ${OUT_FILE} to fall back on`,
		);
		process.exit(1);
	}

	mkdirSync(OUT_DIR, { recursive: true });
	copyFileSync(SRC, OUT_FILE);
	console.log(`sync-mcp-catalog: copied -> ${OUT_FILE}`);
}

main();

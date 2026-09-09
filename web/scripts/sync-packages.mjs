#!/usr/bin/env node
/** Copy the reviewed marketplace snapshot into the web app without network IO. */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const KNOWLEDGE_ROOT = resolve(WEB_ROOT, "../knowledge");
const OUT_DIR = join(WEB_ROOT, "data");

mkdirSync(OUT_DIR, { recursive: true });
for (const file of ["packages.json", "cursor-plugins.json", "cursor-marketplace-registry.json"]) {
	const source = join(KNOWLEDGE_ROOT, file);
	const target = join(OUT_DIR, file);
	if (existsSync(source)) {
		copyFileSync(source, target);
	} else if (!existsSync(target)) {
		throw new Error(`Missing committed catalog ${file}. Run pnpm --dir web refresh-catalog and commit the snapshot.`);
	}
}
console.log("sync-packages: prepared committed marketplace catalogs (offline)");

#!/usr/bin/env node
/** Prepare web/data from committed sources; builds must not fetch catalogs. */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

for (const script of [
	"sync-skills.mjs",
	"sync-mcp-catalog.mjs",
	"sync-harness-counts.mjs",
	"sync-memory.mjs",
	"sync-presets.mjs",
	"sync-defaults.mjs",
	"sync-packages.mjs",
]) {
	const path = join(HERE, script);
	const result = spawnSync(process.execPath, [path], { stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

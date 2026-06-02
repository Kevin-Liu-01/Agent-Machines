#!/usr/bin/env node
/** Run all web/data sync scripts (skills + MCP catalog). */

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
]) {
	const path = join(HERE, script);
	const result = spawnSync(process.execPath, [path], { stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

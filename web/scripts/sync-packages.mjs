#!/usr/bin/env node
/**
 * Re-exports packages from cursor-plugins sync (legacy entry point).
 * Prefer sync-cursor-plugins.mjs which also writes knowledge/packages.json.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [join(HERE, "sync-cursor-plugins.mjs")], {
	stdio: "inherit",
});
process.exit(result.status ?? 1);

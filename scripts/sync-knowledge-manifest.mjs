#!/usr/bin/env node
/**
 * Print a manifest of knowledge/ contents for docs and CI sanity checks.
 * Run: node scripts/sync-knowledge-manifest.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SKILLS = join(ROOT, "knowledge", "skills");
const MCPS = join(ROOT, "knowledge", "mcps", "catalog.json");

function countSkills() {
	if (!existsSync(SKILLS)) return 0;
	return readdirSync(SKILLS, { withFileTypes: true }).filter((e) => {
		if (!e.isDirectory()) return false;
		return existsSync(join(SKILLS, e.name, "SKILL.md"));
	}).length;
}

function loadMcpCatalog() {
	if (!existsSync(MCPS)) return null;
	return JSON.parse(readFileSync(MCPS, "utf8"));
}

function main() {
	const skillCount = countSkills();
	const catalog = loadMcpCatalog();
	const persona = ["SOUL.md", "USER.md", "MEMORY.md", "AGENTS.md"].map((f) => {
		const p = join(ROOT, "knowledge", f);
		return { file: f, exists: existsSync(p), bytes: existsSync(p) ? statSync(p).size : 0 };
	});

	console.log("");
	console.log("Agent Machines knowledge manifest");
	console.log("");
	console.log(`  skills/     ${skillCount} SKILL.md folders`);
	if (catalog) {
		const tiers = catalog.servers.reduce((acc, s) => {
			acc[s.tier] = (acc[s.tier] ?? 0) + 1;
			return acc;
		}, {});
		console.log(`  mcps/       ${catalog.servers.length} servers (${JSON.stringify(tiers)})`);
		console.log(`  catalog     updated ${catalog.updated}`);
	} else {
		console.log("  mcps/       catalog.json missing");
	}
	for (const entry of persona) {
		console.log(`  ${entry.file.padEnd(12)} ${entry.exists ? `${entry.bytes} bytes` : "MISSING"}`);
	}
	console.log("");
}

main();

#!/usr/bin/env node
/**
 * Sync the default Memory Bundle docs from the repo's `knowledge/` persona
 * files into `web/data/memory-default.json`, the committed artifact the
 * dashboard reads to seed every account's starting "owned memory" bundle.
 *
 * Mirrors sync-skills.mjs: source of truth is the .md files; the JSON is the
 * derived artifact the Vercel build consumes. No-op when `../knowledge` isn't
 * present (Vercel's web/-rooted build) -- the committed JSON is the fallback.
 *
 * After editing knowledge/SOUL.md|AGENTS.md|MEMORY.md|USER.md, run
 * `npm run sync-data` and commit the updated JSON.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const KNOWLEDGE_DIR = join(REPO_ROOT, "knowledge");
const OUT_DIR = join(WEB_ROOT, "data");
const OUT_FILE = join(OUT_DIR, "memory-default.json");

// knowledge file -> bundle doc field. The four map 1:1 to the runtime files
// the bootstrap writes (SOUL.md / AGENTS.md / MEMORY.md / USER.md).
const DOC_SOURCES = {
	soul: "SOUL.md",
	agentDocs: "AGENTS.md",
	memory: "MEMORY.md",
	user: "USER.md",
};

function readDoc(file) {
	const path = join(KNOWLEDGE_DIR, file);
	if (!existsSync(path)) return "";
	return readFileSync(path, "utf8").trim();
}

/**
 * Write pretty JSON, but reuse the existing file's timestamp when the rest of
 * the payload is unchanged -- so a no-op sync produces no git diff while real
 * doc edits still re-stamp `generatedAt`.
 */
function writeJsonStable(path, data, tsKey) {
	let stamp = data[tsKey];
	if (existsSync(path)) {
		try {
			const prev = JSON.parse(readFileSync(path, "utf8"));
			const prevRest = { ...prev };
			const nextRest = { ...data };
			delete prevRest[tsKey];
			delete nextRest[tsKey];
			if (prev[tsKey] && JSON.stringify(prevRest) === JSON.stringify(nextRest)) {
				stamp = prev[tsKey];
			}
		} catch {
			// unreadable or non-JSON existing file -> write fresh
		}
	}
	data[tsKey] = stamp;
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
	if (!existsSync(KNOWLEDGE_DIR)) {
		if (existsSync(OUT_FILE)) {
			console.log(
				`sync-memory: ${KNOWLEDGE_DIR} not present (expected on Vercel root=web/); using committed ${OUT_FILE}`,
			);
			return;
		}
		console.error(
			`sync-memory: ${KNOWLEDGE_DIR} not present and no committed ${OUT_FILE} to fall back on`,
		);
		process.exit(1);
	}

	const docs = {};
	for (const [field, file] of Object.entries(DOC_SOURCES)) {
		docs[field] = readDoc(file);
	}
	const payload = { ...docs, generatedAt: new Date().toISOString() };

	mkdirSync(OUT_DIR, { recursive: true });
	writeJsonStable(OUT_FILE, payload, "generatedAt");
	const total = Object.values(docs).reduce((n, s) => n + s.length, 0);
	console.log(`sync-memory: wrote default bundle docs (${total} chars) -> ${OUT_FILE}`);
}

main();

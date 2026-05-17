#!/usr/bin/env node
/**
 * Sync skill content from the personal wiki into `knowledge/skills/`.
 *
 * Two upstream trees:
 *   ~/Documents/GitHub/my-wiki/config/cursor/skills        (canonical personal Cursor skills)
 *   ~/Documents/GitHub/my-wiki/config/dedalus/claude-skills (Dedalus monorepo workflow skills)
 *
 * For each skill we copy `SKILL.md` (only) into a folder named after the
 * skill slug. SKILL assets (rules/, scripts/, references/) are left
 * upstream -- the agent loads SKILL.md as a single file, and pulling in
 * 100+ rule sub-files would balloon the deploy tarball without measurable
 * benefit. Skills that need sub-references can fetch them at runtime.
 *
 * Existing rig-original skills (the curated 13 that shipped with the
 * repo) are preserved unless they're explicitly overwritten by an
 * upstream skill of the same slug. Wiki-version wins on collision -- the
 * wiki is the source of truth for personal skills.
 *
 * Run after editing wiki skills:  node scripts/sync-from-wiki.mjs
 * Then commit knowledge/skills/ + run web sync (predev/prebuild handles).
 */

import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SKILLS_DEST = join(REPO_ROOT, "knowledge", "skills");

const WIKI_ROOT = join(homedir(), "Documents", "GitHub", "kevin-wiki");
const SOURCES = [
	{
		root: join(WIKI_ROOT, "skills", "personal"),
		label: "personal",
	},
	{
		root: join(WIKI_ROOT, "skills", "dedalus"),
		label: "dedalus",
	},
];

/**
 * Skills that physically can't run on the Hermes Linux microVM and
 * shouldn't be synced. Everything else gets imported.
 */
const DENYLIST = new Set([
	"imessage-to-people",       // macOS Messages.app SQLite paths
	"import-spinner-frames",    // wiki-internal workflow
	"codex-automation-admin",   // Codex Desktop sqlite paths
	"skill-audit",              // reads ~/.cursor transcript dirs that don't exist on VM
]);

/**
 * Rig-original skills the repo shipped with. Preserved unless the wiki
 * has a same-slug version (wiki wins -- it's the canonical personal copy).
 */
const RIG_ORIGINALS = new Set([
	"agent-ethos",
	"empirical-verification",
	"production-safety",
	"git-workflow",
	"plan-mode-review",
	"security-audit",
	"reticle-design-system",
	"automation-cron",
	"computer-use",
	"dedalus-machines",
	"cursor-coding",
]);

function listSkills(rootDir) {
	if (!existsSync(rootDir)) return [];
	const out = [];
	for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const skillFile = join(rootDir, entry.name, "SKILL.md");
		if (!existsSync(skillFile)) continue;
		try {
			if (!statSync(skillFile).isFile()) continue;
		} catch {
			continue;
		}
		out.push(entry.name);
	}
	return out;
}

function copyOne(slug, sourceRoot, label) {
	const src = join(sourceRoot, slug, "SKILL.md");
	const dest = join(SKILLS_DEST, slug, "SKILL.md");
	mkdirSync(dirname(dest), { recursive: true });
	const body = readFileSync(src, "utf8");
	writeFileSync(dest, body);
	return { slug, source: label, bytes: Buffer.byteLength(body, "utf8") };
}

function main() {
	if (!existsSync(WIKI_ROOT)) {
		console.error(`sync-from-wiki: wiki not present at ${WIKI_ROOT}`);
		console.error("nothing to do; aborting");
		process.exit(1);
	}
	mkdirSync(SKILLS_DEST, { recursive: true });

	const before = new Set(
		readdirSync(SKILLS_DEST, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name),
	);

	// Wiki wins on slug collision; cursor wins over dedalus on same-slug
	// duplicates between the two upstream trees (cursor is more curated).
	const claimed = new Set();
	const synced = [];
	const skippedDenylist = [];

	for (const { root, label } of SOURCES) {
		for (const slug of listSkills(root)) {
			if (DENYLIST.has(slug)) {
				skippedDenylist.push(`${label}/${slug}`);
				continue;
			}
			if (claimed.has(slug)) continue; // first source wins (cursor first)
			claimed.add(slug);
			synced.push(copyOne(slug, root, label));
		}
	}

	const preserved = [...before].filter(
		(slug) => RIG_ORIGINALS.has(slug) && !claimed.has(slug),
	);
	const overwrittenRigOriginals = [...before].filter(
		(slug) => RIG_ORIGINALS.has(slug) && claimed.has(slug),
	);

	console.log("");
	console.log(`sync-from-wiki -> ${SKILLS_DEST}`);
	console.log("");
	console.log(`  synced     ${synced.length} skills from wiki`);
	console.log(`  preserved  ${preserved.length} rig-original skills (no wiki conflict)`);
	if (overwrittenRigOriginals.length > 0) {
		console.log(`  replaced   ${overwrittenRigOriginals.length} rig originals (wiki has same slug):`);
		for (const slug of overwrittenRigOriginals) {
			console.log(`               ${slug}`);
		}
	}
	if (skippedDenylist.length > 0) {
		console.log(`  skipped    ${skippedDenylist.length} (denylist -- can't run on Linux VM):`);
		for (const item of skippedDenylist) {
			console.log(`               ${item}`);
		}
	}
	console.log("");
	console.log(`Total skill folders: ${synced.length + preserved.length}`);
	console.log("");
	console.log("Next: cd web && npm run sync-skills && git add knowledge web/data/skills.json");
}

main();

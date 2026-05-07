#!/usr/bin/env node
/**
 * Sync the bundled skill library from `knowledge/skills/<slug>/SKILL.md`
 * into a single `web/data/skills.json` artifact that the dashboard imports
 * at request time. The JSON is committed (treat it like a lockfile -- the
 * source of truth is the .md files; the JSON is the derived artifact the
 * Vercel build consumes).
 *
 * The script is a no-op when `../knowledge/skills` doesn't exist (e.g.
 * Vercel's `web/`-rooted build, which never sees the parent directory).
 * In that case we expect `data/skills.json` to already be checked in.
 *
 * For local dev (`predev`) and root-rooted builds, the script regenerates
 * the JSON from current source. After editing a `SKILL.md`, run
 * `npm run sync-skills` and commit the updated JSON alongside.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SKILLS_DIR = join(REPO_ROOT, "knowledge", "skills");
const OUT_DIR = join(WEB_ROOT, "data");
const OUT_FILE = join(OUT_DIR, "skills.json");

const CATEGORY_OF = {
	"agent-ethos": "philosophy",
	"empirical-verification": "philosophy",
	"taste-output": "philosophy",
	"git-workflow": "engineering",
	"production-safety": "engineering",
	"plan-mode-review": "engineering",
	"security-audit": "engineering",
	"frontend-design-taste": "design",
	"reticle-design-system": "design",
	"automation-cron": "ops",
	"computer-use": "ops",
	"dedalus-machines": "ops",
	"cursor-coding": "delegation",
};

function readSkill(slug) {
	const path = join(SKILLS_DIR, slug, "SKILL.md");
	const raw = readFileSync(path, "utf8");
	const { data, content } = matter(raw);
	const tags = Array.isArray(data?.metadata?.hermes?.tags)
		? data.metadata.hermes.tags
		: [];
	const related = Array.isArray(data?.metadata?.hermes?.related_skills)
		? data.metadata.hermes.related_skills
		: [];
	return {
		slug,
		name: data.name ?? slug,
		description: data.description ?? "",
		version: data.version ?? "",
		category: CATEGORY_OF[slug] ?? "uncategorized",
		tags,
		related,
		body: content.trim(),
		bytes: Buffer.byteLength(raw, "utf8"),
	};
}

function main() {
	if (!existsSync(SKILLS_DIR)) {
		if (existsSync(OUT_FILE)) {
			console.log(
				`sync-skills: ${SKILLS_DIR} not present (expected on Vercel root=web/); using committed ${OUT_FILE}`,
			);
			return;
		}
		console.error(
			`sync-skills: ${SKILLS_DIR} not present and no committed ${OUT_FILE} to fall back on`,
		);
		process.exit(1);
	}

	const slugs = readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	const skills = slugs.map(readSkill);
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(OUT_FILE, `${JSON.stringify(skills, null, 2)}\n`);
	console.log(`sync-skills: wrote ${skills.length} skills -> ${OUT_FILE}`);
}

main();

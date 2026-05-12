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

/**
 * Category mapping for the dashboard's Skills browser. Wiki skills have
 * minimal frontmatter (name + description only) so we classify by slug
 * here. Anything missing falls into "uncategorized" and the dashboard
 * still renders it -- the chip is the only thing that's wrong, content
 * is fine.
 */
const CATEGORY_OF = {
	// philosophy -- how to write code, how to think
	"agent-ethos": "philosophy",
	"empirical-verification": "philosophy",
	"taste-output": "philosophy",
	"torvalds": "philosophy",
	"simple": "philosophy",
	"counterfactual": "philosophy",
	"invariant-first-coding": "philosophy",
	"invariant-first-testing": "philosophy",
	"minimal-first-implementation": "philosophy",
	"fail-closed-case-matching": "philosophy",
	"rtfm": "philosophy",

	// engineering -- conventions, refactors, hard rules
	"git-workflow": "engineering",
	"production-safety": "engineering",
	"plan-mode-review": "engineering",
	"comment": "engineering",
	"commit": "engineering",
	"refine": "engineering",
	"fix-types": "engineering",
	"generate-interface": "engineering",
	"stage-refactor-checklist": "engineering",
	"state-machine-dfa": "engineering",
	"column-aligned-fields": "engineering",
	"style-guide": "engineering",
	"test-writing": "engineering",
	"go-style": "engineering",
	"rust-neckbeard": "engineering",
	"ultracite": "engineering",
	"lerp": "engineering",
	"greentext": "engineering",

	// review -- bug finding, audit, security
	"security-audit": "review",
	"bugs": "review",
	"deepsec": "review",
	"code-review": "review",
	"qa": "review",
	"cross-modal-review": "review",
	"recent-code-bugfix": "review",
	"daily-bugfix-check": "review",
	"exemplar-audit": "review",
	"read-and-review": "review",
	"pr-review": "review",
	"postmortem": "review",
	"perf": "review",

	// design -- UI, taste, frontend
	"frontend-design-taste": "design",
	"frontend-design": "design",
	"reticle-design-system": "design",
	"design-engineering": "design",
	"web-design-guidelines": "design",
	"vercel-react-best-practices": "design",
	"shadcn": "design",
	"loading-screens": "design",
	"make-interfaces-feel-better": "design",
	"font-switcher-dev-tool": "design",
	"og-metadata-audit": "design",
	"taste-core": "design",
	"taste-soft": "design",
	"taste-redesign": "design",
	"taste-minimalist": "design",
	"taste-brutalist": "design",
	"taste-stitch": "design",
	"taste-gpt": "design",
	"taste-brandkit": "design",
	"taste-imagegen-web": "design",
	"taste-imagegen-mobile": "design",
	"taste-image-to-code": "design",
	"design-review": "design",

	// content -- writing, voice, marketing
	"copywriting": "content",
	"social-content": "content",
	"social-draft": "content",
	"content-strategy": "content",
	"voice": "content",
	"app-onboarding-questionnaire": "content",
	"seo-audit": "content",
	"seo-geo-optimization": "content",

	// ops -- run things, schedule things, browse the internet
	"automation-cron": "ops",
	"computer-use": "ops",
	"dedalus-machines": "ops",
	"agent-browser": "ops",
	"agent-reach": "ops",
	"agent-activity-log": "ops",
	"closed-loop-development": "ops",
	"project-briefing": "ops",
	"db": "ops",
	"db-write": "ops",
	"dcs-test": "ops",
	"ci-cd-best-practices": "ops",
	"hotfix-preview": "ops",
	"promote": "ops",
	"pr": "ops",
	"issue": "ops",
	"stripe": "ops",
	"update-docs": "ops",
	"mintlify-mdx": "ops",

	// delegation + meta-skill machinery
	"cursor-coding": "delegation",
	"skill-creator": "delegation",
	"skill-auditor": "delegation",
	"find-skills": "delegation",
};

/**
 * Wiki SKILL.md files sometimes have unquoted YAML descriptions
 * containing colons ("uses: a, b, c") which gray-matter rejects.
 * Fall back to a permissive line-by-line scan so a single bad
 * description never blocks the whole sync.
 */
function parseFrontmatterPermissive(raw) {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { data: {}, content: raw };
	const fmText = match[1];
	const content = match[2];
	const data = {};
	for (const line of fmText.split("\n")) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim();
		if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) continue;
		let value = line.slice(idx + 1).trim();
		if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
			value = value.slice(1, -1);
		} else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
			value = value.slice(1, -1);
		}
		data[key] = value;
	}
	return { data, content };
}

function readSkill(slug) {
	const path = join(SKILLS_DIR, slug, "SKILL.md");
	const raw = readFileSync(path, "utf8");
	let data;
	let content;
	try {
		const parsed = matter(raw);
		data = parsed.data ?? {};
		content = parsed.content;
	} catch (err) {
		const fallback = parseFrontmatterPermissive(raw);
		data = fallback.data;
		content = fallback.content;
	}
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

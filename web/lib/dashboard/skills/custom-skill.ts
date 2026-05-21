/**
 * Custom skill authoring — paste, URL import, and link absorption.
 *
 * User skills live at ~/.agent-machines/skills/custom/<slug>/SKILL.md
 * so they never collide with bundled knowledge/skills sync.
 */

import { githubRepoAdapter } from "@/lib/dashboard/registry/github-repo";

const MAX_SKILL_BYTES = 120_000;
const MAX_ABSORB_BYTES = 80_000;

export type SkillInputMode = "paste" | "url" | "absorb";

export type ResolvedSkill = {
	slug: string;
	name: string;
	description: string;
	content: string;
	sourceUrl: string | null;
};

export type ResolveSkillInput = {
	mode: SkillInputMode;
	slug?: string;
	name?: string;
	description?: string;
	content?: string;
	url?: string;
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function slugifySkill(value: string): string {
	const base = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return base.slice(0, 64) || "custom-skill";
}

export function isValidSkillSlug(slug: string): boolean {
	return SLUG_RE.test(slug);
}

export function customSkillId(slug: string): string {
	return `custom-skill:custom/${slug}`;
}

export function customSkillPath(slug: string): string {
	return `~/.agent-machines/skills/custom/${slug}/SKILL.md`;
}

export function parseSkillFrontmatter(content: string): {
	name: string | null;
	description: string | null;
	body: string;
} {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { name: null, description: null, body: content.trim() };
	}
	const block = match[1];
	const body = match[2].trim();
	let name: string | null = null;
	let description: string | null = null;
	for (const line of block.split("\n")) {
		const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
		if (!m) continue;
		if (m[1] === "name") name = m[2].trim().replace(/^["']|["']$/g, "");
		if (m[1] === "description") description = m[2].trim().replace(/^["']|["']$/g, "");
	}
	return { name, description, body };
}

export function ensureSkillMarkdown(
	content: string,
	opts: { slug: string; name?: string; description?: string; sourceUrl?: string | null },
): string {
	const trimmed = content.trim();
	if (trimmed.startsWith("---")) return trimmed;

	const name = opts.name ?? opts.slug;
	const description =
		opts.description ??
		(opts.sourceUrl
			? `Custom skill absorbed from ${opts.sourceUrl}`
			: `Custom skill ${opts.slug} added via Agent Machines dashboard`);

	return [
		"---",
		`name: ${name}`,
		`description: ${description}`,
		"metadata:",
		"  agent-machines:",
		"    origin: user",
		...(opts.sourceUrl ? [`    sourceUrl: ${opts.sourceUrl}`] : []),
		"---",
		"",
		trimmed,
	].join("\n");
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n\n<!-- truncated at ${max} bytes -->`;
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
	const res = await fetch(url, {
		headers: { Accept: "text/plain, text/html, text/markdown, */*" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`fetch failed (${res.status}) for ${url}`);
	const buf = await res.arrayBuffer();
	if (buf.byteLength > maxBytes) {
		throw new Error(`content too large (${buf.byteLength} bytes, max ${maxBytes})`);
	}
	return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function githubRawUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "github.com") return null;
		const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
		if (parts.length < 5 || parts[2] !== "blob") return null;
		const [owner, repo, , branch, ...rest] = parts;
		return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join("/")}`;
	} catch {
		return null;
	}
}

function isGithubRepoUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "github.com") return false;
		const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
		return parts.length === 2 && !["blob", "tree", "raw"].includes(parts[0]);
	} catch {
		return false;
	}
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function githubTreeToRawSkillMd(homepage: string): string | null {
	try {
		const parsed = new URL(homepage);
		if (parsed.hostname !== "github.com") return null;
		const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
		if (parts.length < 5 || parts[2] !== "tree") return null;
		const [owner, repo, , branch, ...rest] = parts;
		const dir = rest.join("/");
		return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${dir}/SKILL.md`;
	} catch {
		return null;
	}
}

async function fetchSkillMarkdownFromUrl(url: string): Promise<string> {
	const blobRaw = githubRawUrl(url);
	if (blobRaw) return fetchText(blobRaw, MAX_SKILL_BYTES);
	if (url.includes("raw.githubusercontent.com") || url.endsWith(".md")) {
		return fetchText(url, MAX_SKILL_BYTES);
	}
	if (isGithubRepoUrl(url)) {
		const items = await githubRepoAdapter.search({ query: url, limit: 5 });
		const skill = items.find((i) => i.kind === "skill");
		if (!skill?.homepage) {
			throw new Error("No SKILL.md found in that GitHub repo");
		}
		const rawSkillUrl = githubTreeToRawSkillMd(skill.homepage);
		if (!rawSkillUrl) {
			throw new Error("Could not resolve SKILL.md path in that repository");
		}
		return fetchText(rawSkillUrl, MAX_SKILL_BYTES);
	}
	throw new Error("URL must be a direct SKILL.md link or a GitHub repository with SKILL.md files");
}

async function absorbUrlToMarkdown(url: string): Promise<string> {
	const text = await fetchText(url, MAX_ABSORB_BYTES);
	const looksHtml = /<\/?[a-z][\s\S]*>/i.test(text.slice(0, 500));
	const body = looksHtml ? stripHtml(text) : text.trim();
	if (body.length < 40) {
		throw new Error("Could not extract enough text from that URL");
	}
	return [
		`# Absorbed reference`,
		"",
		`Source: ${url}`,
		"",
		`Use this skill when work relates to the material below. Prefer the source URL for updates.`,
		"",
		"---",
		"",
		truncate(body, MAX_ABSORB_BYTES - 400),
	].join("\n");
}

export async function resolveSkillInput(input: ResolveSkillInput): Promise<ResolvedSkill> {
	if (input.mode === "paste") {
		const raw = input.content?.trim();
		if (!raw) throw new Error("Paste SKILL.md content or markdown body");
		const slug = slugifySkill(input.slug ?? input.name ?? "custom-skill");
		if (!isValidSkillSlug(slug)) {
			throw new Error("Invalid slug — use lowercase letters, numbers, and hyphens");
		}
		const parsed = parseSkillFrontmatter(raw);
		const content = ensureSkillMarkdown(raw, {
			slug,
			name: input.name ?? parsed.name ?? slug,
			description: input.description ?? parsed.description ?? undefined,
		});
		const meta = parseSkillFrontmatter(content);
		return {
			slug,
			name: meta.name ?? slug,
			description: meta.description ?? `Custom skill ${slug}`,
			content,
			sourceUrl: null,
		};
	}

	const url = input.url?.trim();
	if (!url) throw new Error("URL is required");

	try {
		new URL(url);
	} catch {
		throw new Error("Invalid URL");
	}

	if (input.mode === "url") {
		const markdown = await fetchSkillMarkdownFromUrl(url);
		const parsed = parseSkillFrontmatter(markdown);
		const slug = slugifySkill(input.slug ?? parsed.name ?? url.split("/").pop() ?? "imported");
		if (!isValidSkillSlug(slug)) {
			throw new Error("Could not derive a valid slug — provide one explicitly");
		}
		const content = ensureSkillMarkdown(markdown, {
			slug,
			name: input.name ?? parsed.name ?? slug,
			description: input.description ?? parsed.description ?? undefined,
			sourceUrl: url,
		});
		const meta = parseSkillFrontmatter(content);
		return {
			slug,
			name: meta.name ?? slug,
			description: meta.description ?? `Imported from ${url}`,
			content,
			sourceUrl: url,
		};
	}

	// absorb — any HTTP(S) page, doc, or article
	const absorbed = await absorbUrlToMarkdown(url);
	const slug = slugifySkill(input.slug ?? new URL(url).hostname.replace(/\./g, "-"));
	if (!isValidSkillSlug(slug)) {
		throw new Error("Invalid slug — provide a short name");
	}
	const content = ensureSkillMarkdown(absorbed, {
		slug,
		name: input.name ?? slug,
		description: input.description ?? `Procedures and context absorbed from ${url}`,
		sourceUrl: url,
	});
	return {
		slug,
		name: input.name ?? slug,
		description: input.description ?? `Absorbed from ${url}`,
		content,
		sourceUrl: url,
	};
}

/** Shell command: write SKILL.md on the live machine (base64-safe). */
export function buildInstallSkillShell(slug: string, content: string): string {
	const b64 = Buffer.from(content, "utf8").toString("base64");
	const dir = `$HOME/.agent-machines/skills/custom/${slug}`;
	return [
		"set -e",
		`mkdir -p ${dir}`,
		`echo '${b64}' | base64 -d > ${dir}/SKILL.md`,
		`test -s ${dir}/SKILL.md`,
		`wc -c < ${dir}/SKILL.md`,
	].join(" && ");
}

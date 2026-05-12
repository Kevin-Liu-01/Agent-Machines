/**
 * GitHub repository adapter.
 *
 * Given an owner/repo string, fetches the repo tree via the GitHub API,
 * discovers SKILL.md files, MCP descriptors, and package.json manifests,
 * and normalizes each into RegistryItem entries.
 */

import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { RegistryAdapter, RegistryItem, RegistrySearchOptions } from "./types";

type GitHubTreeEntry = {
	path: string;
	type: "blob" | "tree";
	size?: number;
};

type GitHubTreeResponse = {
	tree: GitHubTreeEntry[];
	truncated: boolean;
};

type GitHubRepo = {
	full_name: string;
	description: string | null;
	stargazers_count: number;
	html_url: string;
	owner: { login: string };
};

function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function fetchRepoMeta(ownerRepo: string): Promise<GitHubRepo> {
	const res = await fetch(`https://api.github.com/repos/${ownerRepo}`, {
		headers: { Accept: "application/vnd.github+json" },
		signal: AbortSignal.timeout(8_000),
	});
	if (!res.ok) throw new Error(`GitHub repo ${res.status}`);
	return (await res.json()) as GitHubRepo;
}

async function fetchTree(ownerRepo: string): Promise<GitHubTreeEntry[]> {
	const res = await fetch(
		`https://api.github.com/repos/${ownerRepo}/git/trees/main?recursive=1`,
		{
			headers: { Accept: "application/vnd.github+json" },
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (!res.ok) throw new Error(`GitHub tree ${res.status}`);
	const body = (await res.json()) as GitHubTreeResponse;
	return body.tree;
}

function discoverItems(
	tree: GitHubTreeEntry[],
	repo: GitHubRepo,
): RegistryItem[] {
	const items: RegistryItem[] = [];
	const seen = new Set<string>();

	for (const entry of tree) {
		if (entry.type !== "blob") continue;

		if (entry.path.endsWith("SKILL.md")) {
			const dir = entry.path.replace(/\/SKILL\.md$/, "");
			const name = dir.split("/").pop() || dir;
			const id = `github:${slug(repo.full_name)}:skill:${slug(name)}`;
			if (seen.has(id)) continue;
			seen.add(id);
			items.push({
				id,
				name,
				kind: "skill",
				description: `Skill from ${repo.full_name}`,
				provider: repo.owner.login,
				source: "github-repo",
				installCommand: `git clone https://github.com/${repo.full_name} /tmp/_skill_import && cp /tmp/_skill_import/${dir}/SKILL.md ~/.agent-machines/skills/${slug(name)}/SKILL.md`,
				logoUrl: null,
				brand: "github",
				stars: repo.stargazers_count,
				version: null,
				homepage: `${repo.html_url}/tree/main/${dir}`,
				installed: false,
			});
		}

		if (entry.path.match(/mcp[^/]*\.json$/i) || entry.path.endsWith("mcp-server.json")) {
			const name = entry.path.split("/").pop()?.replace(/\.json$/, "") || entry.path;
			const id = `github:${slug(repo.full_name)}:mcp:${slug(name)}`;
			if (seen.has(id)) continue;
			seen.add(id);
			items.push({
				id,
				name: `${name} (MCP)`,
				kind: "mcp",
				description: `MCP server descriptor from ${repo.full_name}`,
				provider: repo.owner.login,
				source: "github-repo",
				installCommand: null,
				logoUrl: null,
				brand: "github",
				stars: repo.stargazers_count,
				version: null,
				homepage: `${repo.html_url}/tree/main/${entry.path}`,
				installed: false,
			});
		}

		if (entry.path === "package.json") {
			const id = `github:${slug(repo.full_name)}:pkg`;
			if (seen.has(id)) continue;
			seen.add(id);
			items.push({
				id,
				name: repo.full_name.split("/").pop() || repo.full_name,
				kind: "tool",
				description: repo.description || `Package from ${repo.full_name}`,
				provider: repo.owner.login,
				source: "github-repo",
				installCommand: `npm install -g ${repo.full_name}`,
				logoUrl: null,
				brand: "github",
				stars: repo.stargazers_count,
				version: null,
				homepage: repo.html_url,
				installed: false,
			});
		}
	}

	if (items.length === 0) {
		items.push({
			id: `github:${slug(repo.full_name)}:repo`,
			name: repo.full_name.split("/").pop() || repo.full_name,
			kind: "source",
			description: repo.description || `Repository ${repo.full_name}`,
			provider: repo.owner.login,
			source: "github-repo",
			installCommand: null,
			logoUrl: null,
			brand: "github",
			stars: repo.stargazers_count,
			version: null,
			homepage: repo.html_url,
			installed: false,
		});
	}

	return items;
}

export const githubRepoAdapter: RegistryAdapter = {
	id: "github-repo",
	label: "GitHub",
	async search(opts: RegistrySearchOptions): Promise<RegistryItem[]> {
		if (!opts.query) return [];
		const ownerRepo = opts.query.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
		if (!ownerRepo.includes("/")) return [];

		const key = cacheKey("github-repo", ownerRepo);
		const cached = cacheGet<RegistryItem[]>(key);
		if (cached) return cached;

		const [repo, tree] = await Promise.all([
			fetchRepoMeta(ownerRepo),
			fetchTree(ownerRepo),
		]);
		const items = discoverItems(tree, repo).slice(0, opts.limit ?? 40);
		cacheSet(key, items);
		return items;
	},
};

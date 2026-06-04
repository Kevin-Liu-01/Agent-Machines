/**
 * Format Cursor-style `<ability_info>` blocks injected into chat messages when
 * session attach packages are active.
 */

import type { Pool } from "@/lib/dashboard/pool";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";

import { findPackage } from "./catalog";
import type { ResolvedPackage } from "./types";

function skillDescription(slug: string, pool: Pool): string {
	const fromPool = pool.skills.find((s) => s.slug === slug);
	if (fromPool?.description) return fromPool.description;
	const fromCatalog = listSkills().find((s) => s.slug === slug);
	return fromCatalog?.description ?? slug;
}

function mcpDescription(name: string, pool: Pool): string {
	const fromPool = pool.mcps.find((m) => m.name === name);
	if (fromPool) {
		const toolCount = fromPool.tools.length;
		return `${toolCount} tool${toolCount === 1 ? "" : "s"}`;
	}
	const fromCatalog = listMcpServers().find((m) => m.name === name);
	if (fromCatalog) {
		const toolCount = fromCatalog.tools.length;
		return fromCatalog.source || `${toolCount} tools`;
	}
	return name;
}

export function resolveSessionPackages(
	sessionPackageIds: string[],
	pool: Pool,
): ResolvedPackage[] {
	const out: ResolvedPackage[] = [];
	for (const id of sessionPackageIds) {
		const pkg = findPackage(id);
		if (!pkg) continue;
		out.push({
			package: pkg,
			skills: pkg.skillIds.map((slug) => ({
				slug,
				description: skillDescription(slug, pool),
			})),
			mcps: pkg.mcpServerIds.map((name) => ({
				name,
				description: mcpDescription(name, pool),
			})),
		});
	}
	return out;
}

export function formatAbilityInfoBlock(resolved: ResolvedPackage): string {
	const { package: pkg, skills, mcps } = resolved;
	const lines: string[] = [
		`<ability_info kind="session_attached">`,
		`display_name: ${pkg.name}`,
		`description: ${pkg.description}`,
	];
	if (pkg.homepage) lines.push(`homepage: ${pkg.homepage}`);
	if (pkg.docsUrl) lines.push(`docs_url: ${pkg.docsUrl}`);

	if (skills.length > 0) {
		lines.push("skills:");
		for (const s of skills) {
			lines.push(`  - ${s.slug}: ${s.description}`);
		}
	}

	if (mcps.length > 0) {
		lines.push("mcp_servers:");
		for (const m of mcps) {
			lines.push(`  - ${m.name}`);
		}
	}

	lines.push("</ability_info>");
	return lines.join("\n");
}

export function injectSessionAbilities(
	userText: string,
	sessionPackageIds: string[],
	pool: Pool,
): string {
	const trimmed = userText.trim();
	if (sessionPackageIds.length === 0) return trimmed;

	const resolved = resolveSessionPackages(sessionPackageIds, pool);
	if (resolved.length === 0) return trimmed;

	const blocks = resolved.map(formatAbilityInfoBlock).join("\n\n");
	return `${blocks}\n\n${trimmed}`;
}

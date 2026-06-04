/**
 * Resolve which skills/MCPs are active for a chat session and match packages
 * against the composer draft (Cursor-style Add ___ chips).
 */

import type { Pool } from "@/lib/dashboard/pool";
import { resolveAbilities } from "@/lib/memory/abilities";
import { ABILITY_WILDCARD } from "@/lib/memory/bundle";
import type { MemoryBundle } from "@/lib/user-config/schema";

import { listPackages } from "./catalog";
import type { AbilityPackage, PackageSuggestion, PackageSuggestionKind } from "./types";

export type MatchPackagesInput = {
	draft: string;
	memory: MemoryBundle;
	sessionPackageIds: string[];
	pool: Pool;
};

export type ActiveAbilityIds = {
	skillSlugs: Set<string>;
	mcpNames: Set<string>;
};

/** Skills + MCPs already active via Memory baseline + session-attached packages. */
export function collectActiveAbilityIds(input: {
	memory: MemoryBundle;
	sessionPackageIds: string[];
	pool: Pool;
}): ActiveAbilityIds {
	const resolved = resolveAbilities(input.memory, input.pool);
	const skillSlugs = new Set(resolved.skills.map((s) => s.id));
	const mcpNames = new Set(resolved.mcps.map((m) => m.id));

	// Memory may reference plugin-only skills/MCPs not yet in the pool catalog.
	for (const id of input.memory.skillIds) {
		if (id !== ABILITY_WILDCARD) skillSlugs.add(id);
	}
	for (const id of input.memory.mcpServerIds) {
		if (id !== ABILITY_WILDCARD) mcpNames.add(id);
	}

	for (const packageId of input.sessionPackageIds) {
		const pkg = listPackages().find((p) => p.id === packageId);
		if (!pkg) continue;
		for (const slug of pkg.skillIds) skillSlugs.add(slug);
		for (const name of pkg.mcpServerIds) mcpNames.add(name);
	}

	return { skillSlugs, mcpNames };
}

function packageInPool(pkg: AbilityPackage, pool: Pool): boolean {
	const poolSkills = new Set(pool.skills.map((s) => s.slug));
	const poolMcps = new Set(pool.mcps.map((m) => m.name));
	return (
		pkg.skillIds.every((id) => poolSkills.has(id)) &&
		pkg.mcpServerIds.every((id) => poolMcps.has(id))
	);
}

function packageFullyActive(pkg: AbilityPackage, active: ActiveAbilityIds): boolean {
	return (
		pkg.skillIds.every((id) => active.skillSlugs.has(id)) &&
		pkg.mcpServerIds.every((id) => active.mcpNames.has(id))
	);
}

/** Score how well a draft matches a package's trigger phrases (higher = better). */
export function scorePackageMatch(draft: string, pkg: AbilityPackage): number {
	const text = draft.toLowerCase();
	if (!text.trim()) return 0;

	let score = 0;
	for (const trigger of pkg.triggers) {
		const t = trigger.toLowerCase();
		if (text.includes(t)) score += t.includes(" ") ? 3 : 1;
	}

	// Package name is a weak signal
	if (text.includes(pkg.name.toLowerCase())) score += 2;

	return score;
}

export function matchPackages(input: MatchPackagesInput): PackageSuggestion[] {
	const draft = input.draft.trim();
	if (!draft) return [];

	const active = collectActiveAbilityIds({
		memory: input.memory,
		sessionPackageIds: input.sessionPackageIds,
		pool: input.pool,
	});

	const suggestions: PackageSuggestion[] = [];

	for (const pkg of listPackages()) {
		if (input.sessionPackageIds.includes(pkg.id)) continue;
		if (packageFullyActive(pkg, active)) continue;

		const score = scorePackageMatch(draft, pkg);
		if (score <= 0) continue;

		const inPool = packageInPool(pkg, input.pool);
		const kind: PackageSuggestionKind = inPool ? "matched_in_pool" : "matched_registry";

		suggestions.push({
			packageId: pkg.id,
			name: pkg.name,
			description: pkg.description,
			brand: pkg.brand,
			logoUrl: pkg.logoUrl,
			homepage: pkg.homepage,
			docsUrl: pkg.docsUrl,
			kind,
			score,
			registryItemIds: inPool ? [] : [...pkg.registryItemIds],
		});
	}

	return suggestions.sort((a, b) => b.score - a.score);
}

/** Expand memory wildcard into explicit ids for injection metadata. */
export function memoryUsesWildcard(memory: MemoryBundle): boolean {
	return (
		memory.skillIds.includes(ABILITY_WILDCARD) ||
		memory.mcpServerIds.includes(ABILITY_WILDCARD)
	);
}

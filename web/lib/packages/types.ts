/**
 * Session attach package types — bundled ability groups suggested in the composer.
 */

import type { ServiceSlug } from "@/components/ServiceIcon";

export type AbilityPackage = {
	id: string;
	name: string;
	description: string;
	brand: ServiceSlug | null;
	homepage: string | null;
	docsUrl: string | null;
	marketplaceUrl: string | null;
	logoUrl: string | null;
	triggers: string[];
	skillIds: string[];
	mcpServerIds: string[];
	registryItemIds: string[];
};

export type PackageSuggestionKind = "matched_in_pool" | "matched_registry";

export type PackageSuggestion = {
	packageId: string;
	name: string;
	description: string;
	brand: ServiceSlug | null;
	logoUrl: string | null;
	homepage: string | null;
	docsUrl: string | null;
	kind: PackageSuggestionKind;
	score: number;
	/** Registry catalog ids to install when kind is matched_registry. */
	registryItemIds: string[];
};

export type PackageSkillRef = {
	slug: string;
	description: string;
};

export type PackageMcpRef = {
	name: string;
	description: string;
};

export type ResolvedPackage = {
	package: AbilityPackage;
	skills: PackageSkillRef[];
	mcps: PackageMcpRef[];
};

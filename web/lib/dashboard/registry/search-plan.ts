import type { RegistrySourceId } from "./types";

export const REGISTRY_SOURCE_IDS: ReadonlyArray<RegistrySourceId> = [
	"bundled",
	"skills-sh",
	"mcp-registry",
	"npm",
	"cursor-plugins",
	"github-repo",
	"url-manifest",
];

export type RegistrySearchPlan = {
	sourceIds: ReadonlyArray<RegistrySourceId>;
	scanLiveCursorPlugins: boolean;
};

/** Keep browse instant and reserve the live machine scan for an explicit request. */
export function registrySearchPlan(
	query: string,
	requestedSources: ReadonlyArray<RegistrySourceId> | "all",
): RegistrySearchPlan {
	if (requestedSources === "all") {
		return {
			sourceIds: query.trim() ? REGISTRY_SOURCE_IDS : ["bundled"],
			scanLiveCursorPlugins: false,
		};
	}

	return {
		sourceIds: REGISTRY_SOURCE_IDS.filter((id) => requestedSources.includes(id)),
		scanLiveCursorPlugins: requestedSources.includes("cursor-plugins"),
	};
}

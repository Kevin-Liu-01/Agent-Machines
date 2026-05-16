/**
 * GET /api/registry/search
 *
 * Public (no auth) version of the registry search.
 * Rate-limited to 60 items. Skips cursor-plugins (requires machine).
 */

import {
	skillsShAdapter,
	mcpRegistryAdapter,
	npmAdapter,
	githubRepoAdapter,
	urlManifestAdapter,
} from "@/lib/dashboard/registry";
import type {
	RegistryAdapter,
	RegistryItem,
	RegistrySourceId,
	SourceStatus,
} from "@/lib/dashboard/registry";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";

export const runtime = "nodejs";

const PUBLIC_ADAPTERS: RegistryAdapter[] = [
	skillsShAdapter,
	mcpRegistryAdapter,
	npmAdapter,
	githubRepoAdapter,
	urlManifestAdapter,
];

export async function GET(request: Request): Promise<Response> {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q")?.trim() ?? "";
	const sourceParam = searchParams.get("source") ?? "all";
	const kindParam = searchParams.get("kind") ?? "all";

	const requestedSources: RegistrySourceId[] | "all" =
		sourceParam === "all"
			? "all"
			: (sourceParam.split(",").filter(Boolean) as RegistrySourceId[]);

	const requestedKinds: TrustedAddOnKind[] | "all" =
		kindParam === "all"
			? "all"
			: (kindParam.split(",").filter(Boolean) as TrustedAddOnKind[]);

	const adaptersToRun =
		requestedSources === "all"
			? PUBLIC_ADAPTERS
			: PUBLIC_ADAPTERS.filter((a) => requestedSources.includes(a.id));

	const results = await Promise.allSettled(
		adaptersToRun.map((adapter) =>
			adapter.search({ query, limit: 30 }).then((items) => ({
				adapter,
				items,
			})),
		),
	);

	const allItems: RegistryItem[] = [];
	const sources: SourceStatus[] = [];
	const seenIds = new Set<string>();

	for (const result of results) {
		if (result.status === "fulfilled") {
			const { adapter, items } = result.value;
			for (const item of items) {
				if (seenIds.has(item.id)) continue;
				seenIds.add(item.id);
				allItems.push(item);
			}
			sources.push({ id: adapter.id, label: adapter.label, ok: true, count: items.length });
		} else {
			const idx = results.indexOf(result);
			const adapter = adaptersToRun[idx];
			sources.push({
				id: adapter?.id ?? ("unknown" as RegistrySourceId),
				label: adapter?.label ?? "Unknown",
				ok: false,
				count: 0,
				error: result.reason instanceof Error ? result.reason.message : "adapter failed",
			});
		}
	}

	const filtered =
		requestedKinds === "all"
			? allItems
			: allItems.filter((item) => requestedKinds.includes(item.kind));

	const limited = filtered.slice(0, 60);

	return Response.json(
		{ items: limited, sources },
		{ headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } },
	);
}

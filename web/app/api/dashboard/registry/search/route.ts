/**
 * GET /api/dashboard/registry/search
 *
 * Dispatches a search query to all enabled registry adapters in
 * parallel, merges the results, dedupes by ID, and cross-references
 * the user's customLoadout to mark already-installed items.
 *
 * Query params:
 *   q      -- search term (empty = popular / browse)
 *   source -- comma-separated source IDs to query, or "all"
 *   kind   -- comma-separated kind filters, or "all"
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	skillsShAdapter,
	mcpRegistryAdapter,
	npmAdapter,
	cursorPluginsAdapter,
	githubRepoAdapter,
	urlManifestAdapter,
	setCursorPluginScanResults,
	parseScanOutput,
} from "@/lib/dashboard/registry";
import type {
	RegistryAdapter,
	RegistryItem,
	RegistrySourceId,
	SourceStatus,
} from "@/lib/dashboard/registry";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";
import { isMachineRunning, execOnMachine } from "@/lib/dashboard/exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_ADAPTERS: RegistryAdapter[] = [
	skillsShAdapter,
	mcpRegistryAdapter,
	npmAdapter,
	cursorPluginsAdapter,
	githubRepoAdapter,
	urlManifestAdapter,
];

const ADAPTER_MAP = new Map(ALL_ADAPTERS.map((a) => [a.id, a]));

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

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
			? ALL_ADAPTERS
			: ALL_ADAPTERS.filter((a) => requestedSources.includes(a.id));

	if (adaptersToRun.some((a) => a.id === "cursor-plugins")) {
		try {
			if (await isMachineRunning()) {
				const result = await execOnMachine(
					`find ~/.cursor/plugins/cache -name 'SKILL.md' -type f 2>/dev/null | ` +
					`while read f; do dir=$(dirname "$f"); echo "$(basename "$(dirname "$(dirname "$dir")")")/$(basename "$dir")\t1\t$(head -1 "$f" | sed 's/^#\\s*//')"; done`,
					{ timeoutMs: 10_000 },
				);
				if (result.exitCode === 0 && result.stdout.trim()) {
					setCursorPluginScanResults(parseScanOutput(result.stdout));
				}
			}
		} catch {
			// Machine unavailable -- cursor-plugins adapter returns []
		}
	}

	const config = await getUserConfig();
	const installedIds = new Set(
		config.customLoadout.map((entry) => entry.id),
	);

	const results = await Promise.allSettled(
		adaptersToRun.map((adapter) =>
			adapter.search({ query, limit: 40 }).then((items) => ({
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
				allItems.push({
					...item,
					installed: installedIds.has(item.id) || installedIds.has(item.name),
				});
			}
			sources.push({
				id: adapter.id,
				label: adapter.label,
				ok: true,
				count: items.length,
			});
		} else {
			const adapter = adaptersToRun[results.indexOf(result)];
			sources.push({
				id: adapter?.id ?? ("unknown" as RegistrySourceId),
				label: adapter?.label ?? "Unknown",
				ok: false,
				count: 0,
				error:
					result.reason instanceof Error
						? result.reason.message
						: "adapter failed",
			});
		}
	}

	const filtered =
		requestedKinds === "all"
			? allItems
			: allItems.filter((item) => requestedKinds.includes(item.kind));

	return Response.json(
		{ items: filtered, sources },
		{ headers: { "Cache-Control": "private, max-age=60" } },
	);
}

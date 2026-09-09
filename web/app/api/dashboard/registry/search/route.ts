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
	bundledAdapter,
	skillsShAdapter,
	mcpRegistryAdapter,
	npmAdapter,
	cursorPluginsAdapter,
	githubRepoAdapter,
	urlManifestAdapter,
	createCursorPluginsAdapter,
	parseScanOutput,
} from "@/lib/dashboard/registry";
import type {
	RegistryAdapter,
	RegistryItem,
	RegistrySourceId,
	SourceStatus,
} from "@/lib/dashboard/registry";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";
import { isMachineRunning, execOnMachine, resolveMachine } from "@/lib/dashboard/exec";
import { registrySearchPlan } from "@/lib/dashboard/registry/search-plan";
import type { PluginSkillEntry } from "@/lib/dashboard/registry/cursor-plugins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_ADAPTERS: RegistryAdapter[] = [
	bundledAdapter,
	skillsShAdapter,
	mcpRegistryAdapter,
	npmAdapter,
	cursorPluginsAdapter,
	githubRepoAdapter,
	urlManifestAdapter,
];

/** Per-adapter result cap. Bundled returns its full catalog; network
 *  adapters are capped so one source can't dominate the merge. */
const ADAPTER_LIMIT = 500;

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

	const plan = registrySearchPlan(query, requestedSources);
	const config = await getUserConfig();
	const machine = resolveMachine(config, searchParams.get("machineId"));
	let scanResults: PluginSkillEntry[] = [];

	if (plan.scanLiveCursorPlugins && machine && !machine.archived) {
		try {
			if (await isMachineRunning(machine.id)) {
				const result = await execOnMachine(
					`find ~/.cursor/plugins/cache -name 'SKILL.md' -type f 2>/dev/null | head -n 1000 | ` +
					`while read -r f; do dir=$(dirname "$f"); echo "$(basename "$(dirname "$(dirname "$dir")")")/$(basename "$dir")\t1\t$(head -c 4096 "$f" | head -1 | sed 's/^#\\s*//')"; done | head -c 262144`,
					{ timeoutMs: 10_000, machineId: machine.id },
				);
				if (result.exitCode === 0 && result.stdout.trim()) {
					scanResults = parseScanOutput(result.stdout);
				}
			}
		} catch {
			// Machine unavailable: still return the public marketplace catalog.
		}
	}

	const adaptersToRun = plan.sourceIds
		.map((sourceId) => sourceId === "cursor-plugins" ? createCursorPluginsAdapter(scanResults) : ADAPTER_MAP.get(sourceId))
		.filter((adapter): adapter is RegistryAdapter => Boolean(adapter));
	const installedIds = new Set(
		config.customLoadout.map((entry) => entry.id),
	);

	const results = await Promise.allSettled(
		adaptersToRun.map((adapter) =>
			adapter.search({ query, limit: ADAPTER_LIMIT }).then((items) => ({
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
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}

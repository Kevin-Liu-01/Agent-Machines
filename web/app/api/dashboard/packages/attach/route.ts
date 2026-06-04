/**
 * POST /api/dashboard/packages/attach
 *
 * Attach a session package to the chat. If the package is not yet in the
 * account pool, installs its registry items first (Registry Add flow).
 */

import { lookupRegistryItem } from "@/lib/dashboard/registry/bundled";
import { buildPool } from "@/lib/dashboard/pool";
import { findPackage } from "@/lib/packages/catalog";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { toPublicConfig, type CustomLoadoutEntry } from "@/lib/user-config/schema";
import type { RegistryItem } from "@/lib/dashboard/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttachBody = { packageId: string };

function packageInPool(
	pkg: NonNullable<ReturnType<typeof findPackage>>,
	pool: ReturnType<typeof buildPool>,
): boolean {
	const poolSkills = new Set(pool.skills.map((s) => s.slug));
	const poolMcps = new Set(pool.mcps.map((m) => m.name));
	return (
		pkg.skillIds.every((id) => poolSkills.has(id)) &&
		pkg.mcpServerIds.every((id) => poolMcps.has(id))
	);
}

function toCustomEntry(item: RegistryItem): CustomLoadoutEntry {
	const now = new Date().toISOString();
	const kindMap: Record<string, CustomLoadoutEntry["kind"]> = {
		skill: "skill",
		mcp: "mcp",
		cli: "cli",
		tool: "tool",
		plugin: "plugin",
		provider: "tool",
		source: "tool",
	};
	return {
		id: item.id,
		name: item.name,
		kind: kindMap[item.kind] ?? "tool",
		description: item.description,
		command: item.installCommand,
		enabled: true,
		createdAt: now,
		updatedAt: now,
	};
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}

	let body: AttachBody;
	try {
		body = (await request.json()) as AttachBody;
	} catch {
		return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
	}

	const pkg = findPackage(body.packageId);
	if (!pkg) {
		return Response.json({ ok: false, error: "package_not_found" }, { status: 404 });
	}

	let config = await getUserConfig();
	let pool = buildPool(config);
	let installed = false;

	if (!packageInPool(pkg, pool)) {
		const entries: CustomLoadoutEntry[] = [];
		for (const registryId of pkg.registryItemIds) {
			const item = lookupRegistryItem(registryId);
			if (!item) continue;
			if (config.customLoadout.some((e) => e.id === item.id)) continue;
			entries.push(toCustomEntry(item));
		}
		if (entries.length > 0) {
			config = await setUserConfig({
				customLoadout: [...config.customLoadout, ...entries],
			});
			pool = buildPool(config);
			installed = true;
		}
	}

	const inPool = packageInPool(pkg, pool);
	if (!inPool) {
		return Response.json(
			{
				ok: false,
				error: "not_in_pool",
				message: "Package registry items could not be installed.",
			},
			{ status: 422 },
		);
	}

	return Response.json({
		ok: true,
		packageId: pkg.id,
		installed,
		config: toPublicConfig(config),
	});
}

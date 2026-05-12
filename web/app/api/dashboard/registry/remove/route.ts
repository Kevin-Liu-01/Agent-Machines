/**
 * DELETE /api/dashboard/registry/remove
 *
 * Removes an item from the user's customLoadout in Clerk metadata.
 * Does NOT uninstall from the VM -- safe default; the user can SSH
 * in to clean up binaries if needed.
 */

import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { toPublicConfig } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RemoveBody = {
	itemId: string;
};

export async function DELETE(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let body: RemoveBody;
	try {
		body = (await request.json()) as RemoveBody;
	} catch {
		return Response.json(
			{ error: "invalid JSON body" },
			{ status: 400 },
		);
	}

	if (!body.itemId) {
		return Response.json(
			{ error: "missing itemId" },
			{ status: 400 },
		);
	}

	const config = await getUserConfig();
	const filtered = config.customLoadout.filter((e) => e.id !== body.itemId);

	if (filtered.length === config.customLoadout.length) {
		return Response.json({
			ok: true,
			config: toPublicConfig(config),
			message: "Item not found in loadout.",
		});
	}

	const next = await setUserConfig({ customLoadout: filtered });
	return Response.json({
		ok: true,
		config: toPublicConfig(next),
		message: "Removed from loadout.",
	});
}

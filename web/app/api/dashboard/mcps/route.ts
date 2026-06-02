/**
 * GET /api/dashboard/mcps
 *
 * Returns the user's imported MCP servers (the account-global pool), not the
 * full catalog -- the catalog is browsable in the Registry. Auth-gated.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { importedMcps } from "@/lib/dashboard/pool";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const config = await getUserConfig();
	return Response.json({ servers: importedMcps(config) });
}

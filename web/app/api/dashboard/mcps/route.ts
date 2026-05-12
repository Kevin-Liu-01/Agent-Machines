/**
 * GET /api/dashboard/mcps
 *
 * Returns the static MCP server registry the agent has wired in.
 * Auth-gated. The on-VM source of truth is `~/.agent-machines/config.toml`;
 * this is the documentation reflection so the dashboard renders without
 * needing to round-trip the gateway.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { listMcpServers } from "@/lib/dashboard/mcps";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	return Response.json({ servers: listMcpServers() });
}

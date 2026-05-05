/**
 * Health probe -- used by the chat UI to render an "agent online" badge before
 * the user sends a message. We hit /v1/models because that's the cheapest
 * upstream call that requires a valid bearer token.
 */

import { getServerConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	let config: ReturnType<typeof getServerConfig>;
	try {
		config = getServerConfig();
	} catch (err) {
		const message = err instanceof Error ? err.message : "config_error";
		return Response.json({ ok: false, error: "config_missing", message });
	}

	try {
		const upstream = await fetch(`${config.apiUrl}/models`, {
			headers: { Authorization: `Bearer ${config.apiKey}` },
		});
		const ok = upstream.ok;
		return Response.json({
			ok,
			status: upstream.status,
			model: config.model,
			apiHost: new URL(config.apiUrl).host,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "fetch_failed";
		return Response.json({ ok: false, error: "fetch_failed", message });
	}
}

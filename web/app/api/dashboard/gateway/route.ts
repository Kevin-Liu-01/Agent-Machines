/**
 * GET /api/dashboard/gateway
 *
 * Hits the Hermes gateway's `/v1/models` endpoint, which is the cheapest
 * authenticated probe. We measure the round-trip with `performance.now()`
 * so the dashboard can show real latency. When the gateway is asleep or
 * the cloudflared tunnel is dead, the route surfaces a typed error
 * instead of a 5xx so the UI can render the "offline" state gracefully.
 *
 * Reads the gateway URL + bearer token from the caller's Clerk metadata.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import type { GatewaySummary } from "@/lib/dashboard/types";
import { getGatewayEnvForUser } from "@/lib/user-config/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let env: Awaited<ReturnType<typeof getGatewayEnvForUser>>;
	try {
		env = await getGatewayEnvForUser();
	} catch (err) {
		const message = err instanceof Error ? err.message : "config_error";
		return Response.json(
			{ error: "not_provisioned", message },
			{ status: 404 },
		);
	}

	const start = performance.now();
	try {
		const response = await fetch(`${env.apiUrl}/models`, {
			headers: { Authorization: `Bearer ${env.apiKey}` },
			cache: "no-store",
		});
		const latencyMs = Math.round(performance.now() - start);
		let modelCount: number | null = null;
		if (response.ok) {
			try {
				const body = (await response.json()) as { data?: unknown[] };
				if (Array.isArray(body.data)) modelCount = body.data.length;
			} catch {
				// Body not JSON -- happens during cold-start when the gateway
				// returns an HTML error page. Leave modelCount as null.
			}
		}
		const payload: GatewaySummary = {
			ok: response.ok,
			status: response.status,
			model: env.model,
			apiHost: new URL(env.apiUrl).host,
			latencyMs,
			modelCount,
		};
		return Response.json(payload, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const latencyMs = Math.round(performance.now() - start);
		const payload: GatewaySummary = {
			ok: false,
			status: 0,
			model: env.model,
			apiHost: new URL(env.apiUrl).host,
			latencyMs,
			modelCount: null,
			error: err instanceof Error ? err.message : "fetch_failed",
		};
		return Response.json(payload, {
			headers: { "Cache-Control": "no-store" },
		});
	}
}

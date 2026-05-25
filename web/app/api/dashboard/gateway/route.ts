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
import { resolveMachine } from "@/lib/dashboard/exec";
import { probeGateway } from "@/lib/bootstrap/gateway-lifecycle";
import { resolveGatewayForUser } from "@/lib/gateway/resolver";
import { getProvider } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const machineId = new URL(request.url).searchParams.get("machineId") ?? undefined;

	let env: Awaited<ReturnType<typeof resolveGatewayForUser>>;
	try {
		env = await resolveGatewayForUser(machineId);
	} catch (err) {
		const message = err instanceof Error ? err.message : "config_error";
		return Response.json(
			{ error: "not_provisioned", message },
			{ status: 404 },
		);
	}

	const start = performance.now();
	try {
		const config = await getUserConfig();
		const machine = resolveMachine(config, machineId);
		const provider = machine ? getProvider(machine.providerKind, config.providers) : null;
		const localPort =
			machine?.providerKind === "sprites" ? 8080 :
			machine?.agentKind === "openclaw" ? 18789 : 8642;

		const probe = await probeGateway({
			apiUrl: env.apiUrl,
			apiKey: env.headers.Authorization?.replace(/^Bearer\s+/i, "") ?? "",
			provider: provider ?? undefined,
			machineId: machine?.id,
			localPort,
		});
		const latencyMs = Math.round(performance.now() - start);
		const payload: GatewaySummary = {
			ok: probe.ok,
			status: probe.status,
			model: env.model,
			apiHost: env.apiHost,
			latencyMs,
			modelCount: probe.modelCount,
			...(probe.error ? { error: probe.error } : {}),
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
			apiHost: env.apiHost,
			latencyMs,
			modelCount: null,
			error: err instanceof Error ? err.message : "fetch_failed",
		};
		return Response.json(payload, {
			headers: { "Cache-Control": "no-store" },
		});
	}
}

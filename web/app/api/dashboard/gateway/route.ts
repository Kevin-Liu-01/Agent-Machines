/**
 * GET /api/dashboard/gateway
 *
 * Health probe for a machine's agent gateway. Prefers the machine's public
 * URL when one exists (native provider URL, Dedalus preview, or an opt-in
 * named tunnel), and otherwise probes the gateway **over the provider `exec`
 * primitive** (curl 127.0.0.1 on the box) — so the dashboard reports healthy
 * status with no public URL / Cloudflare tunnel required.
 *
 * codex / claude-code are CLI agents with no HTTP gateway; talk to those via
 * the Terminal console instead.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import type { GatewaySummary } from "@/lib/dashboard/types";
import { resolveMachine } from "@/lib/dashboard/exec";
import {
	gatewayPort,
	probeGateway,
	probeGatewayLocal,
} from "@/lib/bootstrap/gateway-lifecycle";
import { getProvider } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function hostOf(value: string): string {
	try {
		return new URL(value).host;
	} catch {
		return value;
	}
}

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const machineId = new URL(request.url).searchParams.get("machineId") ?? undefined;
	const start = performance.now();

	const config = await getUserConfig();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		return Response.json(
			{ error: "not_provisioned", message: "No machine selected." },
			{ status: 404 },
		);
	}

	// CLI agents have no HTTP gateway — they're driven through the console.
	if (machine.agentKind === "codex" || machine.agentKind === "claude-code") {
		return Response.json(
			{
				error: "no_gateway",
				message: `${machine.agentKind} has no HTTP gateway — use the Terminal console.`,
			},
			{ status: 404 },
		);
	}

	if (!machine.apiKey) {
		return Response.json(
			{ error: "not_provisioned", message: "Gateway not bootstrapped yet." },
			{ status: 404 },
		);
	}

	const provider = getProvider(machine.providerKind, config.providers);
	const port = gatewayPort(machine);
	const apiKey = machine.apiKey;
	const model = machine.agentKind === "openclaw" ? "openclaw" : machine.model;

	try {
		let ok: boolean;
		let status: number;
		let modelCount: number | null = null;
		let apiHost: string;

		if (machine.apiUrl) {
			// Public path: native provider URL / preview / opt-in named tunnel,
			// with an in-VM exec fallback when the public URL is flaky.
			const probe = await probeGateway({
				apiUrl: machine.apiUrl,
				apiKey,
				provider,
				machineId: machine.id,
				localPort: port,
			});
			ok = probe.ok;
			status = probe.status;
			modelCount = probe.modelCount;
			apiHost = hostOf(machine.apiUrl);
		} else {
			// Exec path: no public URL — curl 127.0.0.1 on the box via exec.
			ok = await probeGatewayLocal(provider, machine.id, port, apiKey).catch(
				() => false,
			);
			status = ok ? 200 : 0;
			apiHost = `127.0.0.1:${port} · exec`;
		}

		const latencyMs = Math.round(performance.now() - start);
		const payload: GatewaySummary = {
			ok,
			status,
			model,
			apiHost,
			latencyMs,
			modelCount,
		};
		return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
	} catch (err) {
		const latencyMs = Math.round(performance.now() - start);
		const payload: GatewaySummary = {
			ok: false,
			status: 0,
			model,
			apiHost: machine.apiUrl
				? hostOf(machine.apiUrl)
				: `127.0.0.1:${port} · exec`,
			latencyMs,
			modelCount: null,
			error: err instanceof Error ? err.message : "fetch_failed",
		};
		return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
	}
}

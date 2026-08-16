/**
 * Public readiness probe for the model routes the hosted control plane can
 * actually use. Modern gateway credentials take precedence over the legacy
 * single-machine Hermes URL, which may legitimately disappear when that
 * sandbox sleeps or is replaced.
 */

import { getServerConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthProbe = {
	source: "vercel-ai-gateway" | "openrouter" | "legacy-agent";
	apiUrl: string;
	apiKey: string;
	model: string;
};

const HEALTH_TIMEOUT_MS = 4_000;

function modernHealthProbes(): HealthProbe[] {
	const probes: HealthProbe[] = [];
	const aiGatewayKey = (
		process.env.AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_KEY
	)?.trim();
	if (aiGatewayKey) {
		probes.push({
			source: "vercel-ai-gateway",
			apiUrl: "https://ai-gateway.vercel.sh/v1",
			apiKey: aiGatewayKey,
			model: process.env.AGENT_MODEL?.trim() || "gateway",
		});
	}
	const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
	if (openrouterKey) {
		probes.push({
			source: "openrouter",
			apiUrl: "https://openrouter.ai/api/v1",
			apiKey: openrouterKey,
			model: process.env.AGENT_MODEL?.trim() || "router",
		});
	}
	return probes;
}

function healthProbes(): HealthProbe[] {
	const modern = modernHealthProbes();
	if (modern.length > 0) return modern;
	const legacy = getServerConfig();
	return [{ source: "legacy-agent", ...legacy }];
}

async function probe(candidate: HealthProbe): Promise<Response> {
	const upstream = await fetch(`${candidate.apiUrl}/models`, {
		headers: { Authorization: `Bearer ${candidate.apiKey}` },
		signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
	});
	if (!upstream.ok) throw new Error(`upstream returned ${upstream.status}`);
	return Response.json({
		ok: true,
		status: upstream.status,
		model: candidate.model,
		apiHost: new URL(candidate.apiUrl).host,
		source: candidate.source,
	});
}

export async function GET(): Promise<Response> {
	let candidates: HealthProbe[];
	try {
		candidates = healthProbes();
	} catch (error) {
		const message = error instanceof Error ? error.message : "config_error";
		return Response.json(
			{ ok: false, error: "config_missing", message },
			{ status: 503 },
		);
	}

	try {
		// Both modern routes are independent. Return as soon as either one proves
		// healthy instead of serially paying for a slow or degraded provider.
		return await Promise.any(candidates.map(probe));
	} catch {
		return Response.json(
			{
				ok: false,
				error: "upstream_unavailable",
				sources: candidates.map((candidate) => candidate.source),
			},
			{ status: 503 },
		);
	}
}

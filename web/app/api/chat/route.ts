/**
 * SSE-relaying chat endpoint.
 *
 * The browser POSTs `{ messages: [...] }`. We add the bearer-token-protected
 * Hermes API call server-side (so the token never touches the browser) and
 * stream the SSE response back unchanged. Errors return JSON, not partial SSE.
 *
 * Uses the caller's Clerk-stored gateway env (with env-var fallback for the
 * project owner).
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import type { NextRequest } from "next/server";

import type { ChatRequestBody } from "@/lib/types";
import { resolveMachine } from "@/lib/dashboard/exec";
import { resolveGatewayForUser } from "@/lib/gateway/resolver";
import { getUserConfig } from "@/lib/user-config/clerk";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let body: ChatRequestBody;
	try {
		body = (await request.json()) as ChatRequestBody;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	if (!Array.isArray(body.messages) || body.messages.length === 0) {
		return Response.json({ error: "messages_required" }, { status: 422 });
	}

	const machineId =
		typeof (body as Record<string, unknown>).machineId === "string"
			? ((body as Record<string, unknown>).machineId as string)
			: null;

	// A bootstrapped machine with no public gateway URL is exec-only — the HTTP
	// chat path can't reach it. Point the operator at the Terminal console
	// (which drives the agent over the provider exec channel, no tunnel needed).
	try {
		const config = await getUserConfig();
		const machine = resolveMachine(config, machineId);
		if (
			machine?.apiKey &&
			!machine.apiUrl &&
			machine.agentKind !== "codex" &&
			machine.agentKind !== "claude-code"
		) {
			return Response.json(
				{
					error: "no_http_gateway",
					message:
						"This machine's agent gateway isn't exposed over HTTP. Open the Terminal console to talk to it.",
				},
				{ status: 409 },
			);
		}
	} catch {
		// fall through — resolveGatewayForUser surfaces the real config error
	}

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

	const upstream = await fetch(`${env.apiUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...env.headers,
		},
		body: JSON.stringify({
			model: env.model,
			messages: body.messages,
			stream: true,
		}),
	});

	if (!upstream.ok || !upstream.body) {
		const text = await upstream.text().catch(() => "");
		return Response.json(
			{
				error: "upstream_error",
				status: upstream.status,
				body: text.slice(0, 600),
			},
			{ status: 502 },
		);
	}

	return new Response(upstream.body, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}

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
import { resolveGatewayForUser } from "@/lib/gateway/resolver";
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

	let env: Awaited<ReturnType<typeof resolveGatewayForUser>>;
	try {
		const machineId =
			typeof (body as Record<string, unknown>).machineId === "string"
				? ((body as Record<string, unknown>).machineId as string)
				: null;
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

import { after } from "next/server";

import { isRemovedDedalusRouter } from "@/lib/agents/upstreams";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import {
	AGENT_KINDS,
	PROVIDER_KINDS,
	type AgentKind,
	type ProviderKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

function isRuntime(value: unknown): value is AgentKind {
	return typeof value === "string" && (AGENT_KINDS as readonly string[]).includes(value);
}

function isSandbox(value: unknown): value is ProviderKind | "auto" {
	return (
		value === "auto" ||
		(typeof value === "string" && (PROVIDER_KINDS as readonly string[]).includes(value))
	);
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await context.params;
	const controlPlane = createHostedControlPlane(userId);
	const worker = await controlPlane.store.getWorker(id);
	if (!worker) return Response.json({ error: "not_found" }, { status: 404 });
	return Response.json({
		ok: true,
		worker,
		operations: await controlPlane.store.listOperations(id),
	});
}

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await context.params;
	const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<
		string,
		unknown
	>;
	const controlPlane = createHostedControlPlane(userId);
	const current = await controlPlane.store.getWorker(id);
	if (!current) return Response.json({ error: "not_found" }, { status: 404 });
	if (isRemovedDedalusRouter(body.gatewayProfileId)) {
		return Response.json(
			{
				error: "unsupported_gateway",
				message:
					"Dedalus is a sandbox provider only; choose Vercel AI Gateway or OpenRouter.",
			},
			{ status: 400 },
		);
	}
	const desiredState =
		body.desiredState === "running" || body.desiredState === "sleeping"
			? body.desiredState
			: current.desiredState;
	const accepted = await controlPlane.apply(
		{
			id,
			desiredState,
			spec: {
				...current.spec,
				...(isRuntime(body.runtime) ? { runtime: body.runtime } : {}),
				...(isSandbox(body.sandbox) ? { sandbox: body.sandbox } : {}),
				...(typeof body.model === "string" && body.model.trim()
					? { model: body.model.trim() }
					: {}),
				...(typeof body.gatewayProfileId === "string" && body.gatewayProfileId.trim()
					? { gatewayProfileId: body.gatewayProfileId.trim() }
					: {}),
				...(typeof body.environmentProfileId === "string"
					? { environmentProfileId: body.environmentProfileId.trim() || null }
					: {}),
				...(body.migrationPolicy === "copy" || body.migrationPolicy === "live"
					? { migrationPolicy: body.migrationPolicy }
					: {}),
			},
		},
		{
			idempotencyKey:
				typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
					? body.idempotencyKey.trim()
					: undefined,
		},
	);
	after(async () => {
		await controlPlane.reconcileNext(id);
	});
	return Response.json(
		{
			ok: true,
			worker: accepted.worker,
			operation: accepted.operation,
			statusUrl: `/api/dashboard/control-plane/operations/${accepted.operation.id}`,
		},
		{ status: 202 },
	);
}

export async function DELETE(_request: Request, context: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await context.params;
	const controlPlane = createHostedControlPlane(userId);
	const current = await controlPlane.store.getWorker(id);
	if (!current) return Response.json({ error: "not_found" }, { status: 404 });
	const accepted = await controlPlane.apply({
		id,
		desiredState: "deleted",
		spec: current.spec,
	});
	after(async () => {
		await controlPlane.reconcileNext(id);
	});
	return Response.json(
		{ ok: true, operation: accepted.operation },
		{ status: 202 },
	);
}

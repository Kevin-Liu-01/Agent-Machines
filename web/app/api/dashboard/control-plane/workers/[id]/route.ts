import { after } from "next/server";

import { DEFAULT_ROUTER_ID, isRemovedDedalusRouter } from "@/lib/agents/upstreams";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { initialWorkerModel, modelForEndpoint } from "@/lib/agents/model-endpoint";
import { modelEndpointForSelection } from "@/lib/bootstrap/runner";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfigById } from "@/lib/user-config/clerk";
import { deletionStorageWarning } from "@/lib/dashboard/deletion-warning";
import { getProvider } from "@/lib/providers";
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
	const value: unknown = await request.json().catch(() => null);
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return Response.json({ error: "invalid_body" }, { status: 400 });
	}
	const body = value as Record<string, unknown>;
	if ((body.runtime !== undefined && !isRuntime(body.runtime))
		|| (body.sandbox !== undefined && !isSandbox(body.sandbox))
		|| (body.model !== undefined && (typeof body.model !== "string" || !body.model.trim()
			|| body.model.trim().length > 200 || /[\x00-\x1f\x7f]/.test(body.model)))
		|| (body.gatewayProfileId !== undefined && body.gatewayProfileId !== null && typeof body.gatewayProfileId !== "string")
		|| (body.environmentProfileId !== undefined && body.environmentProfileId !== null && typeof body.environmentProfileId !== "string")
		|| (body.desiredState !== undefined && body.desiredState !== "running" && body.desiredState !== "sleeping")
		|| (body.migrationPolicy !== undefined && body.migrationPolicy !== "copy" && body.migrationPolicy !== "live")) {
		return Response.json({ error: "invalid_body" }, { status: 400 });
	}
	const controlPlane = createHostedControlPlane(userId);
	const current = await controlPlane.store.getWorker(id);
	if (!current) return Response.json({ error: "not_found" }, { status: 404 });
	if (current.desiredState === "deleted" || current.status.phase === "deleting" || current.status.phase === "deleted") {
		return Response.json({ error: "worker_deleted", message: "Deleted Workers cannot be reactivated by an update." }, { status: 409 });
	}
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
	const config = await getUserConfigById(userId);
	const machineId = current.status.placement?.sandboxId
		?? config.workers.find((worker) => worker.id === id)?.lastMachineId;
	if (config.machines.some((machine) => machine.id === machineId && machine.archived)) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	// A desired target provider is not the provider currently owning compute.
	// Preflight explicit pause only; editing an already-idle Worker must not
	// contact the provider or require model credentials merely to remain idle.
	if (body.desiredState === "sleeping" && current.status.placement) {
		const provider = getProvider(current.status.placement.sandbox, config.providers);
		if (provider.capabilities.canSleep !== true) {
			return Response.json({ ok: false, error: "not_supported", message: "This provider does not support manual pause. No compute was stopped." }, { status: 409 });
		}
	}
	const nextRuntime = isRuntime(body.runtime) ? body.runtime : current.spec.runtime;
	const gatewayProfileId = body.gatewayProfileId !== undefined
		? (typeof body.gatewayProfileId === "string" ? body.gatewayProfileId.trim() : "") || DEFAULT_ROUTER_ID
		: current.spec.gatewayProfileId;
	let model = current.spec.model;
	const selectionChanged = nextRuntime !== current.spec.runtime
		|| (gatewayProfileId ?? DEFAULT_ROUTER_ID) !== (current.spec.gatewayProfileId ?? DEFAULT_ROUTER_ID)
		|| (typeof body.model === "string" && body.model.trim() !== current.spec.model);
	if (selectionChanged) {
		try {
			const endpoint = modelEndpointForSelection({ agentKind: nextRuntime, gatewayProfileId: gatewayProfileId ?? null }, config);
			const explicitModel = typeof body.model === "string" ? body.model.trim() : undefined;
			model = initialWorkerModel(nextRuntime, endpoint, explicitModel, current.spec.model);
			if (explicitModel && (nextRuntime === "claude-code" || nextRuntime === "codex")
				&& model !== modelForEndpoint(explicitModel, endpoint)) {
				throw new Error(`Choose a model supported by ${nextRuntime}.`);
			}
		} catch (error) {
			return Response.json({ error: "model_required", message: error instanceof Error ? error.message : "Choose a model for this endpoint." }, { status: 400 });
		}
		const credentials = validateAgentCredentials(nextRuntime, config);
		if (!credentials.ok) {
			return Response.json({ error: "missing_agent_credentials", message: credentials.message }, { status: 400 });
		}
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
				runtime: nextRuntime,
				...(isSandbox(body.sandbox) ? { sandbox: body.sandbox } : {}),
				...(selectionChanged ? { model } : {}),
				...(body.gatewayProfileId !== undefined ? { gatewayProfileId } : {}),
				...(body.environmentProfileId !== undefined
					? { environmentProfileId: typeof body.environmentProfileId === "string" ? body.environmentProfileId.trim() || null : null }
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
		{ ok: true, operation: accepted.operation, storageWarning: deletionStorageWarning(current.status?.placement?.sandbox) },
		{ status: 202 },
	);
}

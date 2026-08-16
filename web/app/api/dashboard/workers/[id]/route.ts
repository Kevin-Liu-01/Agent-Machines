/**
 * GET    /api/dashboard/workers/[id]  — fetch one worker.
 * PATCH  /api/dashboard/workers/[id]  — update fields.
 * DELETE /api/dashboard/workers/[id]  — remove a worker.
 */

import { after } from "next/server";

import { runtimeModel } from "@/lib/agents/runtime-model";
import { isRemovedDedalusRouter } from "@/lib/agents/upstreams";
import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import {
	getUserConfig,
	getUserConfigById,
	setUserConfig,
	setUserConfigById,
} from "@/lib/user-config/clerk";
import { AGENT_KINDS, type AgentKind, type Worker } from "@/lib/user-config/schema";
import {
	DEFAULT_MEMORY_BUNDLE_ID,
	DEFAULT_MODEL,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isAgent(v: unknown): v is AgentKind {
	return typeof v === "string" && (AGENT_KINDS as ReadonlyArray<string>).includes(v);
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const config = await getUserConfig();
	const controlPlane = createHostedControlPlane(userId);
	const [managedWorker, operations] = await Promise.all([
		controlPlane.store.getWorker(id),
		controlPlane.store.listOperations(id),
	]);
	const configuredWorker = (config.workers ?? []).find((worker) => worker.id === id);
	const worker: Worker | null =
		configuredWorker ??
		(managedWorker
			? {
					id: managedWorker.id,
					name: managedWorker.spec.name,
					source: "custom",
					agentKind: managedWorker.spec.runtime,
					model: managedWorker.spec.model ?? DEFAULT_MODEL,
					gatewayProfileId:
						managedWorker.spec.gatewayProfileId ?? "vercel-ai-gateway",
					memoryBundleId:
						managedWorker.spec.memoryBundleId ?? DEFAULT_MEMORY_BUNDLE_ID,
					rolePrompt: managedWorker.spec.rolePrompt ?? null,
					lastMachineId: managedWorker.status.placement?.sandboxId ?? null,
					createdAt: managedWorker.createdAt,
					updatedAt: managedWorker.updatedAt,
				}
			: null);
	if (!worker) return Response.json({ error: "not_found" }, { status: 404 });
	return Response.json({
		ok: true,
		worker,
		managedWorker,
		operations: operations.slice(0, 20),
	});
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	if (isRemovedDedalusRouter(body.gatewayProfileId)) {
		return Response.json(
			{
				error: "unsupported_gateway",
				message: "Dedalus is supported only as a sandbox substrate, not as a model gateway.",
			},
			{ status: 400 },
		);
	}

	const config = await getUserConfig();
	const existing = (config.workers ?? []).find((w) => w.id === id);
	if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

	const updated: Worker = {
		...existing,
		name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
		agentKind: isAgent(body.agentKind) ? body.agentKind : existing.agentKind,
		model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : existing.model,
		gatewayProfileId:
			typeof body.gatewayProfileId === "string" ? body.gatewayProfileId : existing.gatewayProfileId,
		memoryBundleId:
			typeof body.memoryBundleId === "string" ? body.memoryBundleId : existing.memoryBundleId,
		rolePrompt:
			typeof body.rolePrompt === "string"
				? body.rolePrompt
				: body.rolePrompt === null
					? null
					: existing.rolePrompt,
		updatedAt: new Date().toISOString(),
	};
	const spec = {
		name: updated.name,
		runtime: updated.agentKind,
		model: runtimeModel(updated.agentKind, updated.model),
		gatewayProfileId: updated.gatewayProfileId,
		memoryBundleId: updated.memoryBundleId,
		rolePrompt: updated.rolePrompt,
	};
	const controlPlane = createHostedControlPlane(userId);
	const managed = await controlPlane.store.getWorker(id);
	const schedules = (config.crons ?? [])
		.filter((cron) => cron.machineId === existing.lastMachineId)
		.map((cron) => ({
			id: cron.id,
			schedule: cron.schedule,
			prompt: cron.prompt,
			enabled: cron.enabled,
		}));
	const accepted = managed
		? await controlPlane.apply({
				id,
				desiredState: managed.desiredState,
				spec: { ...managed.spec, ...spec, schedules },
			})
		: existing.lastMachineId
			? (
					await submitMachineIntent(userId, existing.lastMachineId, {
						spec,
					})
				).accepted
			: null;

	const next = (config.workers ?? []).map((w) => (w.id === id ? updated : w));
	await setUserConfig({ workers: next });
	if (!accepted) return Response.json({ ok: true, worker: updated });

	if (accepted.operation.status !== "succeeded") {
		after(async () => {
			await controlPlane.reconcileNext(id);
		});
	}
	const alreadyReconciled = accepted.operation.status === "succeeded";
	return Response.json(
		{
			ok: true,
			worker: updated,
			operation: accepted.operation,
			statusUrl: `/api/dashboard/control-plane/operations/${accepted.operation.id}`,
			message: alreadyReconciled
				? "Worker desired state was already reconciled."
				: "Worker update accepted. Runtime configuration is reconciling.",
		},
		{ status: alreadyReconciled ? 200 : 202 },
	);
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const config = await getUserConfig();
	const worker = (config.workers ?? []).find((candidate) => candidate.id === id);
	const controlPlane = createHostedControlPlane(userId);
	const managed = await controlPlane.store.getWorker(id);
	if (!worker && !managed) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	if (!managed && !worker?.lastMachineId) {
		await setUserConfig({ workers: config.workers.filter((candidate) => candidate.id !== id) });
		return Response.json({ ok: true });
	}

	const accepted = managed
		? await controlPlane.apply({ id, spec: managed.spec, desiredState: "deleted" })
		: (
				await submitMachineIntent(userId, worker?.lastMachineId as string, {
					desiredState: "deleted",
				})
			).accepted;
	after(async () => {
		await controlPlane.reconcileNext(id);
		const operation = await controlPlane.store.getOperation(accepted.operation.id);
		if (operation?.status !== "succeeded") return;
		const latest = await getUserConfigById(userId);
		await setUserConfigById(userId, {
			workers: latest.workers.filter((candidate) => candidate.id !== id),
		});
	});
	return Response.json(
		{
			ok: true,
			operation: accepted.operation,
			statusUrl: `/api/dashboard/control-plane/operations/${accepted.operation.id}`,
			message: "Worker deletion accepted. The sandbox will be destroyed before the template is removed.",
		},
		{ status: 202 },
	);
}

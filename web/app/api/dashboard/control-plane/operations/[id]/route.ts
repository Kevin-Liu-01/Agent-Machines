import { getEffectiveUserId } from "@/lib/user-config/identity";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await context.params;
	const controlPlane = createHostedControlPlane(userId);
	const operation = await controlPlane.store.getOperation(id);
	if (!operation) return Response.json({ error: "not_found" }, { status: 404 });
	const worker = await controlPlane.store.getWorker(operation.workerId);
	return Response.json({
		ok: true,
		operation,
		worker,
		machineId: worker?.status.placement?.sandboxId ?? null,
	});
}

/** Retry a failed journal entry without replaying its idempotency key. */
export async function POST(_request: Request, context: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await context.params;
	const controlPlane = createHostedControlPlane(userId);
	const operation = await controlPlane.store.getOperation(id);
	if (!operation) return Response.json({ error: "not_found" }, { status: 404 });
	if (operation.status !== "failed") {
		return Response.json(
			{ error: "operation_not_failed", message: "Only failed operations can be retried." },
			{ status: 409 },
		);
	}
	const worker = await controlPlane.store.getWorker(operation.workerId);
	if (!worker) return Response.json({ error: "worker_not_found" }, { status: 404 });

	const retry =
		operation.payload.type === "reconcile"
			? (
					await controlPlane.apply(
						{
							id: worker.id,
							spec: worker.spec,
							desiredState: worker.desiredState,
						},
						{ forceBootstrap: operation.payload.forceBootstrap },
					)
				).operation
			: await controlPlane.run(
					worker.id,
					operation.payload.prompt,
					`${operation.payload.runKey}:retry:${operation.id}`,
					{
						scheduleId: operation.payload.scheduleId,
						scheduledFor: operation.payload.scheduledFor,
					},
				);
	after(async () => {
		await controlPlane.reconcileNext(worker.id);
	});
	return Response.json(
		{
			ok: true,
			operation: retry,
			statusUrl: `/api/dashboard/control-plane/operations/${retry.id}`,
		},
		{ status: 202 },
	);
}

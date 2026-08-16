import { after } from "next/server";

import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { getUserConfigById } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const config = await getUserConfigById(userId);
	if (!config.activeMachineId) {
		return Response.json({ error: "not_provisioned", message: "Active machine is not set." }, { status: 404 });
	}
	try {
		const submitted = await submitMachineIntent(userId, config.activeMachineId, {
			desiredState: "running",
			idempotencyKey:
				request.headers.get("idempotency-key") ??
				`wake:${config.activeMachineId}:${crypto.randomUUID()}`,
		});
		after(async () => {
			await submitted.controlPlane.reconcileNext(submitted.accepted.worker.id);
		});
		return Response.json(
			{
				ok: true,
				operation: submitted.accepted.operation,
				statusUrl: `/api/dashboard/control-plane/operations/${submitted.accepted.operation.id}`,
				phase: "queued",
			},
			{ status: 202, headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return Response.json(
			{ error: "wake_failed", message: error instanceof Error ? error.message : "wake failed" },
			{ status: 502 },
		);
	}
}

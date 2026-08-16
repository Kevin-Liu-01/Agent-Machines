import { after } from "next/server";

import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	try {
		const submitted = await submitMachineIntent(userId, id, {
			desiredState: "running",
			idempotencyKey:
				request.headers.get("idempotency-key") ?? `wake:${id}:${crypto.randomUUID()}`,
		});
		after(async () => {
			await submitted.controlPlane.reconcileNext(submitted.accepted.worker.id);
		});
		return Response.json(
			{
				ok: true,
				operation: submitted.accepted.operation,
				statusUrl: `/api/dashboard/control-plane/operations/${submitted.accepted.operation.id}`,
				summary: { phase: "queued", state: "starting" },
				needsBootstrap: false,
			},
			{ status: 202, headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "wake failed";
		return Response.json(
			{ ok: false, error: /does not exist/.test(message) ? "not_found" : "wake_failed", message },
			{ status: /does not exist/.test(message) ? 404 : 502 },
		);
	}
}

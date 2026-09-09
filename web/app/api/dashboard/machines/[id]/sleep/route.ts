import { after } from "next/server";

import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { getProvider, MachineProviderError } from "@/lib/providers";
import { getUserConfigById } from "@/lib/user-config/clerk";
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
		// Ownership and real operation support must precede journal adoption:
		// an unsupported request must not change the Worker's desired state.
		const config = await getUserConfigById(userId);
		const machine = config.machines.find((candidate) => candidate.id === id && !candidate.archived);
		if (!machine) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
		const provider = getProvider(machine.providerKind, config.providers);
		if (provider.capabilities.canSleep !== true) {
			return Response.json({ ok: false, error: "not_supported", message: "This provider does not support manual pause. No compute was stopped." }, { status: 409 });
		}
		const submitted = await submitMachineIntent(userId, id, {
			desiredState: "sleeping",
			idempotencyKey:
				request.headers.get("idempotency-key") ?? `sleep:${id}:${crypto.randomUUID()}`,
		});
		after(async () => {
			await submitted.controlPlane.reconcileNext(submitted.accepted.worker.id);
		});
		return Response.json(
			{
				ok: true,
				operation: submitted.accepted.operation,
				statusUrl: `/api/dashboard/control-plane/operations/${submitted.accepted.operation.id}`,
				summary: { phase: "queued", desiredState: "sleeping" },
			},
			{ status: 202, headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "sleep failed";
		const unsupported = error instanceof MachineProviderError && error.kind === "not_supported";
		return Response.json(
			{ ok: false, error: unsupported ? "not_supported" : /does not exist/.test(message) ? "not_found" : "sleep_failed", message },
			{ status: unsupported ? 409 : /does not exist/.test(message) ? 404 : 502 },
		);
	}
}

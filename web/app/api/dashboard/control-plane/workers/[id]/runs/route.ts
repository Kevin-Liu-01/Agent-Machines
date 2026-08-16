import { after } from "next/server";

import { createHostedControlPlane } from "@/lib/control-plane/service";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await context.params;
	const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<
		string,
		unknown
	>;
	const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
	if (!prompt) return Response.json({ error: "prompt_required" }, { status: 400 });
	const runKey =
		typeof body.runKey === "string" && body.runKey.trim()
			? body.runKey.trim()
			: crypto.randomUUID();
	const controlPlane = createHostedControlPlane(userId);
	try {
		const operation = await controlPlane.run(id, prompt, runKey);
		after(async () => {
			await controlPlane.reconcileNext(id);
		});
		return Response.json(
			{
				ok: true,
				operation,
				statusUrl: `/api/dashboard/control-plane/operations/${operation.id}`,
			},
			{ status: 202 },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "run submission failed";
		return Response.json({ error: "run_rejected", message }, { status: 400 });
	}
}

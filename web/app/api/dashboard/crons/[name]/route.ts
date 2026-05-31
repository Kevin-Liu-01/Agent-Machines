/**
 * GET    /api/dashboard/crons/[id]  — fetch one cron.
 * PATCH  /api/dashboard/crons/[id]  — update fields (name/schedule/prompt/enabled/...).
 * DELETE /api/dashboard/crons/[id]  — remove a cron.
 *
 * The dynamic segment is the cron id. (The folder is named `[name]` for
 * historical reasons; the value is treated as the id.)
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { isValidSchedule, normalizeSchedule } from "@/lib/cron/expr";
import type { CronEntry } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { name: id } = await ctx.params;
	const config = await getUserConfig();
	const cron = (config.crons ?? []).find((c) => c.id === id);
	if (!cron) return Response.json({ error: "not_found" }, { status: 404 });
	return Response.json({ ok: true, cron });
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { name: id } = await ctx.params;

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	const config = await getUserConfig();
	const existing = (config.crons ?? []).find((c) => c.id === id);
	if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

	if (typeof body.schedule === "string" && !isValidSchedule(body.schedule)) {
		return Response.json({ error: "invalid_schedule" }, { status: 400 });
	}
	if (typeof body.machineId === "string") {
		const ok = config.machines.some((m) => m.id === body.machineId && !m.archived);
		if (!ok) return Response.json({ error: "machine_not_found" }, { status: 400 });
	}

	const updated: CronEntry = {
		...existing,
		name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
		schedule:
			typeof body.schedule === "string"
				? normalizeSchedule(body.schedule)
				: existing.schedule,
		prompt: typeof body.prompt === "string" ? body.prompt : existing.prompt,
		machineId: typeof body.machineId === "string" ? body.machineId : existing.machineId,
		skills: Array.isArray(body.skills)
			? body.skills.filter((s): s is string => typeof s === "string")
			: existing.skills,
		enabled: typeof body.enabled === "boolean" ? body.enabled : existing.enabled,
	};

	const next = (config.crons ?? []).map((c) => (c.id === id ? updated : c));
	await setUserConfig({ crons: next });
	return Response.json({ ok: true, cron: updated });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { name: id } = await ctx.params;
	const config = await getUserConfig();
	const next = (config.crons ?? []).filter((c) => c.id !== id);
	await setUserConfig({ crons: next });
	return Response.json({ ok: true });
}

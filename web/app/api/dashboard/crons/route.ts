/**
 * GET  /api/dashboard/crons   — list the user's scheduled crons.
 * POST /api/dashboard/crons   — create a cron.
 *
 * Crons persist in the user's config and are fired by the server-side
 * scheduler (`/api/internal/cron/tick`). See `lib/crons/service.ts`.
 */

import { randomUUID } from "node:crypto";

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { isValidSchedule, normalizeSchedule } from "@/lib/cron/expr";
import type { CronEntry } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const config = await getUserConfig();
	return Response.json({
		ok: true,
		crons: config.crons ?? [],
		fetchedAt: new Date().toISOString(),
	});
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	const name = typeof body.name === "string" ? body.name.trim() : "";
	const schedule = typeof body.schedule === "string" ? body.schedule.trim() : "";
	const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
	const machineId = typeof body.machineId === "string" ? body.machineId : "";

	if (!name) return Response.json({ error: "name_required" }, { status: 400 });
	if (!isValidSchedule(schedule)) {
		return Response.json({ error: "invalid_schedule" }, { status: 400 });
	}
	if (!prompt) return Response.json({ error: "prompt_required" }, { status: 400 });

	const config = await getUserConfig();
	const target = config.machines.find((m) => m.id === machineId && !m.archived);
	if (!target) {
		return Response.json({ error: "machine_not_found" }, { status: 400 });
	}

	const skills = Array.isArray(body.skills)
		? body.skills.filter((s): s is string => typeof s === "string")
		: [];

	const cron: CronEntry = {
		id: randomUUID(),
		name,
		schedule: normalizeSchedule(schedule),
		prompt,
		machineId,
		skills,
		enabled: body.enabled !== false,
		createdAt: new Date().toISOString(),
		lastRunAt: null,
		lastStatus: null,
		lastSummary: null,
	};

	const next = [...(config.crons ?? []), cron];
	await setUserConfig({ crons: next });

	return Response.json({ ok: true, cron });
}

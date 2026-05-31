/**
 * POST /api/dashboard/crons/[id]/run — run a cron immediately on its machine.
 *
 * Blocks for the agent one-shot and records the outcome on the cron entry.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { isMachineRunning } from "@/lib/dashboard/exec";
import { runCronOnMachine } from "@/lib/crons/service";
import type { CronEntry } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { name: id } = await ctx.params;

	const config = await getUserConfig();
	const cron = (config.crons ?? []).find((c) => c.id === id);
	if (!cron) return Response.json({ error: "not_found" }, { status: 404 });

	if (!(await isMachineRunning(cron.machineId))) {
		return Response.json(
			{ error: "machine_offline", message: "Wake the machine before running this cron." },
			{ status: 503 },
		);
	}

	const result = await runCronOnMachine(config, cron, { wait: true });
	const ranAt = new Date().toISOString();
	const summary =
		result.message ??
		(result.exitCode === 0 ? "ok" : `exit ${result.exitCode ?? "?"}`);

	const updated: CronEntry = {
		...cron,
		lastRunAt: ranAt,
		lastStatus: result.status,
		lastSummary: summary,
	};
	const next = (config.crons ?? []).map((c) => (c.id === id ? updated : c));
	await setUserConfig({ crons: next });

	return Response.json({
		ok: result.ok,
		status: result.status,
		exitCode: result.exitCode,
		summary,
		output: result.output?.slice(-4000) ?? null,
		cron: updated,
	});
}

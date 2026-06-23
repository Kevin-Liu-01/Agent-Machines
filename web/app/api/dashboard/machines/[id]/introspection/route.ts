import {
	INTROSPECTION_COMMAND,
	parseIntrospection,
} from "@/lib/agents/machine-introspection";
import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const { id: machineId } = await ctx.params;
	if (!(await isMachineRunning(machineId))) {
		return Response.json(
			{
				ok: false,
				error: "machine_offline",
				message: "Machine is not awake.",
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	}

	try {
		const result = await execOnMachine(INTROSPECTION_COMMAND, {
			machineId,
			timeoutMs: 15_000,
		});
		if (result.exitCode !== 0 && !result.stdout.trim()) {
			return Response.json(
				{
					ok: false,
					error: "exec_failed",
					message: result.stderr || `introspection exited ${result.exitCode}`,
				},
				{ headers: { "Cache-Control": "no-store" } },
			);
		}
		return Response.json(
			{
				ok: true,
				data: parseIntrospection(result.stdout),
				exitCode: result.exitCode,
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (err) {
		return Response.json(
			{
				ok: false,
				error: "exec_failed",
				message: err instanceof Error ? err.message : "introspection failed",
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	}
}

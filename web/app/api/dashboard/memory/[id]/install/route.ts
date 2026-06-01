/**
 * POST /api/dashboard/memory/[id]/install — write the bundle's memory docs
 * into the agent runtime on a machine (live, via exec).
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig } from "@/lib/user-config/clerk";
import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import { resolveBundle } from "@/lib/memory/bundle";
import { bundleInstallCommand } from "@/lib/memory/install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;

	const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
	const machineId = typeof body.machineId === "string" ? body.machineId : "";
	if (!machineId) return Response.json({ error: "machine_required" }, { status: 400 });

	const config = await getUserConfig();
	const bundle = resolveBundle(config, id);
	if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });
	const machine = config.machines.find((m) => m.id === machineId);
	if (!machine) return Response.json({ error: "machine_not_found" }, { status: 404 });

	if (!(await isMachineRunning(machineId))) {
		return Response.json(
			{ ok: false, message: "Machine is asleep. Wake it before installing." },
			{ status: 503 },
		);
	}

	try {
		const command = bundleInstallCommand(bundle, machine.agentKind);
		const res = await execOnMachine(command, { machineId, timeoutMs: 30_000 });
		const ok = res.stdout.includes("AM_MEMORY_INSTALLED");
		return Response.json({
			ok,
			message: ok
				? `Installed "${bundle.name}" into ${machine.agentKind} on ${machine.name}.`
				: res.stderr.slice(0, 300) || "install did not confirm",
		});
	} catch (err) {
		return Response.json(
			{ ok: false, message: err instanceof Error ? err.message : "install_failed" },
			{ status: 502 },
		);
	}
}

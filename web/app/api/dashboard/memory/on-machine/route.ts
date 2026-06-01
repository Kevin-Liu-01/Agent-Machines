/**
 * POST /api/dashboard/memory/on-machine — read the installed persona/memory
 * doc contents off a machine so the editor can show + diff them.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { isMachineRunning } from "@/lib/dashboard/exec";
import { readMemoryFromMachine } from "@/lib/memory/on-machine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	const machineId = typeof body.machineId === "string" ? body.machineId : "";
	if (!machineId) return Response.json({ error: "machine_required" }, { status: 400 });

	if (!(await isMachineRunning(machineId))) {
		return Response.json(
			{ ok: false, offline: true, message: "Machine is asleep." },
			{ status: 503 },
		);
	}

	try {
		const docs = await readMemoryFromMachine(machineId);
		return Response.json({ ok: true, docs });
	} catch (err) {
		return Response.json(
			{ ok: false, error: err instanceof Error ? err.message : "read_failed" },
			{ status: 502 },
		);
	}
}

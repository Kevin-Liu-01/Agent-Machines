/**
 * POST /api/dashboard/terminal/resize
 *
 * Resize the interactive tmux console to match the xterm.js viewport so
 * full-screen TUIs (and the agent CLI's own rendering) lay out correctly.
 */

import { execOnMachine } from "@/lib/dashboard/exec";
import { clampDim, resizeCommand } from "@/lib/dashboard/terminal-session";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Body = { machineId?: string; cols?: number; rows?: number };

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as Body;
	const machineId = typeof body.machineId === "string" ? body.machineId : undefined;
	const cols = clampDim(body.cols, 20, 500, 120);
	const rows = clampDim(body.rows, 5, 200, 32);

	try {
		await execOnMachine(resizeCommand(cols, rows), { machineId, timeoutMs: 15_000 });
		return Response.json({ ok: true, cols, rows });
	} catch (err) {
		const message = err instanceof Error ? err.message : "resize failed";
		return Response.json({ error: "resize_failed", message }, { status: 502 });
	}
}

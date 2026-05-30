/**
 * POST /api/dashboard/terminal/session
 *
 * Ensure the per-machine interactive tmux console exists (installing tmux
 * if needed), then return the current screen snapshot + the log byte
 * offset so the client can paint immediately and stream only new output.
 */

import { execOnMachine } from "@/lib/dashboard/exec";
import { isMachineRunningCached } from "@/lib/dashboard/machine-running-cache";
import {
	CONSOLE_SESSION,
	capturePaneCommand,
	clampDim,
	ensureSessionCommand,
	logSizeCommand,
} from "@/lib/dashboard/terminal-session";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const SNAP = "__AM_SNAP__";
const OFF = "__AM_OFF__";

type Body = { machineId?: string; cols?: number; rows?: number };

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as Body;
	const machineId = typeof body.machineId === "string" ? body.machineId : undefined;
	const cols = clampDim(body.cols, 20, 500, 120);
	const rows = clampDim(body.rows, 5, 200, 32);

	if (!(await isMachineRunningCached(machineId))) {
		return Response.json(
			{ error: "machine_offline", message: "Machine is not awake. Wake it first." },
			{ status: 503 },
		);
	}

	const cmd = [
		ensureSessionCommand(cols, rows),
		`printf '\\n${SNAP}\\n'`,
		capturePaneCommand(),
		`printf '\\n${OFF}\\n'`,
		logSizeCommand(),
	].join("\n");

	try {
		const res = await execOnMachine(cmd, { machineId, timeoutMs: 75_000 });
		const out = res.stdout;
		if (out.includes("AM_CONSOLE_NO_TMUX")) {
			return Response.json(
				{ error: "no_tmux", message: "tmux is unavailable and could not be installed on this machine." },
				{ status: 501 },
			);
		}
		const [readyPart, rest = ""] = out.split(SNAP);
		const [snapshot = "", offStr = ""] = rest.split(OFF);
		if (!readyPart.includes("AM_CONSOLE_READY")) {
			return Response.json(
				{ error: "session_failed", message: out.slice(0, 400) || res.stderr.slice(0, 400) },
				{ status: 502 },
			);
		}
		const offset = Number.parseInt(offStr.trim(), 10) || 0;
		return Response.json({
			ok: true,
			session: CONSOLE_SESSION,
			cols,
			rows,
			offset,
			snapshot: snapshot.replace(/^\n/, ""),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "session create failed";
		return Response.json({ error: "session_failed", message }, { status: 502 });
	}
}

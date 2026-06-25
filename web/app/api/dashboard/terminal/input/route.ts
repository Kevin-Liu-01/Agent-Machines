/**
 * POST /api/dashboard/terminal/input
 *
 * Inject keystrokes into the machine's interactive tmux console via
 * `tmux send-keys -H <hex>`. One quick exec per batch; the frontend
 * coalesces rapid keystrokes before posting. Intentionally does NOT
 * gate on isMachineRunning -- that adds a round-trip to every keystroke,
 * and the exec itself surfaces an offline machine.
 */

import { execOnMachine } from "@/lib/dashboard/exec";
import { stripTerminalDeviceResponses } from "@/lib/dashboard/terminal-input";
import { sendKeysCommand } from "@/lib/dashboard/terminal-session";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_INPUT_BYTES = 8_192;

type Body = { machineId?: string; data?: string };

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as Body;
	const machineId = typeof body.machineId === "string" ? body.machineId : undefined;
	const data =
		typeof body.data === "string"
			? stripTerminalDeviceResponses(body.data)
			: "";
	if (!data) return Response.json({ error: "empty_input" }, { status: 400 });
	if (Buffer.byteLength(data, "utf8") > MAX_INPUT_BYTES) {
		return Response.json({ error: "input_too_large" }, { status: 400 });
	}

	try {
		await execOnMachine(sendKeysCommand(data), { machineId, timeoutMs: 6_000 });
		return Response.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "input failed";
		return Response.json({ error: "input_failed", message }, { status: 502 });
	}
}

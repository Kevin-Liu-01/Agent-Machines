/** Read actual runtime histories and transcripts on the selected owned machine. */
import { execOnMachine, isMachineRunning, resolveMachine } from "@/lib/dashboard/exec";
import { isRuntimeSessionId, runtimeSessionsCommand } from "@/lib/dashboard/runtime-sessions";
import type { LiveDataEnvelope, SessionsPayload, SessionTranscriptPayload } from "@/lib/dashboard/types";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfigCached } from "@/lib/user-config/request-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
	if (!(await getEffectiveUserId())) {
		return Response.json({ error: "unauthorized" }, { status: 401, headers });
	}
	const params = new URL(request.url).searchParams;
	const machineId = params.get("machineId") ?? undefined;
	const sessionId = params.get("sessionId") ?? undefined;
	if (sessionId !== undefined && !isRuntimeSessionId(sessionId)) {
		return Response.json({ error: "Invalid session identifier." }, { status: 400, headers });
	}

	try {
		const config = await getUserConfigCached();
		const machine = resolveMachine(config, machineId);
		if (!machine) {
			return Response.json({ error: "Machine not found in your account." }, { status: 404, headers });
		}
		if (!(await isMachineRunning(machine.id))) {
			return Response.json({
				ok: false,
				reason: "machine_offline",
				message: "Wake this machine from its overview to read its saved conversations.",
			}, { headers });
		}
		const result = await execOnMachine(runtimeSessionsCommand(sessionId), {
			machineId: machine.id,
			timeoutMs: 20_000,
		});
		if (result.exitCode !== 0) {
			throw new Error("The native history reader could not run. Verify that Python 3 is installed on this machine.");
		}
		const data = JSON.parse(result.stdout.trim());
		if (data.error === "session_not_found") {
			return Response.json({ error: "Session no longer exists in this machine's history." }, { status: 404, headers });
		}
		if (data.error || (sessionId ? !Array.isArray(data.messages) : !Array.isArray(data.sessions))) {
			throw new Error(data.message || "Native history returned an unreadable response.");
		}
		const envelope: LiveDataEnvelope<SessionsPayload | SessionTranscriptPayload> = {
			ok: true,
			data,
			fetchedAt: new Date().toISOString(),
		};
		return Response.json(envelope, { headers });
	} catch (error) {
		return Response.json({
			ok: false,
			reason: "exec_failed",
			message: error instanceof Error ? error.message : "Native history could not be read.",
		}, { status: 502, headers });
	}
}

/**
 * GET /api/dashboard/cursor
 *
 * Reads `~/.hermes/cursor-runs.jsonl` off the live machine and returns
 * the parsed list of past Cursor agent runs. The cursor-bridge MCP
 * server appends one line per `cursor_agent` / `cursor_resume` call.
 *
 * Auth: Clerk middleware + redundant `auth()` check. Live machine state
 * (failed VM, no machine ID configured) is surfaced as a typed envelope
 * so the UI can render empty / setup states instead of generic 5xx.
 */

import { auth } from "@clerk/nextjs/server";

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import type {
	CursorRun,
	CursorRunsPayload,
	LiveDataEnvelope,
} from "@/lib/dashboard/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PATH = "$HOME/.hermes/cursor-runs.jsonl";
const MAX_LINES = 100;

function parseLine(line: string): CursorRun | null {
	try {
		const raw = JSON.parse(line) as Record<string, unknown>;
		return {
			loggedAt: String(raw.logged_at ?? ""),
			kind: raw.kind === "resume" ? "resume" : "one_shot",
			agentId: String(raw.agent_id ?? ""),
			runId: String(raw.run_id ?? ""),
			status: String(raw.status ?? "unknown"),
			durationMs:
				typeof raw.duration_ms === "number" ? raw.duration_ms : null,
			model: String(raw.model ?? ""),
			workingDir: String(raw.working_dir ?? ""),
			loadedSkills: Array.isArray(raw.loaded_skills)
				? (raw.loaded_skills as string[])
				: [],
			prompt: String(raw.prompt ?? ""),
			finalText: String(raw.final_text ?? ""),
		};
	} catch {
		return null;
	}
}

export async function GET(): Promise<Response> {
	const { userId } = await auth();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	if (!process.env.HERMES_MACHINE_ID || !process.env.DEDALUS_API_KEY) {
		const envelope: LiveDataEnvelope<CursorRunsPayload> = {
			ok: false,
			reason: "config_missing",
			message: "DEDALUS_API_KEY or HERMES_MACHINE_ID is not set",
		};
		return Response.json(envelope);
	}

	if (!(await isMachineRunning())) {
		const envelope: LiveDataEnvelope<CursorRunsPayload> = {
			ok: false,
			reason: "machine_offline",
			message: "Machine is not running. Wake it with `npm run wake`.",
		};
		return Response.json(envelope);
	}

	try {
		const { stdout } = await execOnMachine(
			`if [ -f ${LOG_PATH} ]; then tail -n ${MAX_LINES} ${LOG_PATH}; else echo ""; fi`,
		);
		const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
		const runs: CursorRun[] = lines
			.map(parseLine)
			.filter((r): r is CursorRun => r !== null)
			.reverse();

		const envelope: LiveDataEnvelope<CursorRunsPayload> = {
			ok: true,
			data: {
				runs,
				totalRuns: runs.length,
				logPath: "~/.hermes/cursor-runs.jsonl",
			},
			fetchedAt: new Date().toISOString(),
		};
		return Response.json(envelope, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const envelope: LiveDataEnvelope<CursorRunsPayload> = {
			ok: false,
			reason: "exec_failed",
			message: err instanceof Error ? err.message : "exec failed",
		};
		return Response.json(envelope);
	}
}

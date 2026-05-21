/**
 * POST /api/dashboard/exec
 *
 * Runs an arbitrary shell command on the user's active machine via the
 * Dedalus executions API and returns stdout / stderr / exit code +
 * client-side timestamps. Backs the dashboard's `<TerminalPanel>` so
 * users can poke at their VM (`ls`, `tail`, `which`, `python -V`) the
 * same way they would over SSH, without having to drop into the CLI.
 *
 * Unlike the read-only `execOnMachine` helper used by passive
 * observability routes, this route allows mutations -- the caller is
 * the operator of the machine. We still throttle to one in-flight
 * exec per user via a tiny in-memory map so a runaway loop in the UI
 * can't fan out 100 Dedalus exec creates per second.
 *
 * Rate limit: keyed by Clerk userId (or DEV_USER_ID). One concurrent
 * exec per user; the second concurrent call gets a 429 with the
 * `Retry-After` hint. Soft cap of 60 commands / minute per user via
 * a sliding window.
 */

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COMMAND_TIMEOUT_MS_DEFAULT = 30_000;
const COMMAND_TIMEOUT_MS_MAX = 120_000;
const COMMAND_MAX_LENGTH = 4_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 60;

type RateBucket = {
	timestamps: number[];
	inFlight: boolean;
};

// Per-process map. Persists across requests within the same Node
// worker (Next.js dev / Vercel function). Vercel's per-region cold
// boots reset it, which is fine -- the limit is a guardrail against
// runaway loops, not a security boundary.
const RATE_STATE = new Map<string, RateBucket>();

function pruneAndCheck(userId: string): {
	ok: true;
} | { ok: false; reason: "concurrent" | "rate"; retryAfterMs: number } {
	const now = Date.now();
	let bucket = RATE_STATE.get(userId);
	if (!bucket) {
		bucket = { timestamps: [], inFlight: false };
		RATE_STATE.set(userId, bucket);
	}
	bucket.timestamps = bucket.timestamps.filter(
		(t) => now - t < RATE_WINDOW_MS,
	);
	if (bucket.inFlight) {
		return { ok: false, reason: "concurrent", retryAfterMs: 1500 };
	}
	if (bucket.timestamps.length >= RATE_MAX_PER_WINDOW) {
		const oldest = bucket.timestamps[0]!;
		return {
			ok: false,
			reason: "rate",
			retryAfterMs: Math.max(1000, RATE_WINDOW_MS - (now - oldest)),
		};
	}
	return { ok: true };
}

function markStart(userId: string): void {
	const bucket = RATE_STATE.get(userId);
	if (!bucket) return;
	bucket.inFlight = true;
	bucket.timestamps.push(Date.now());
}

function markEnd(userId: string): void {
	const bucket = RATE_STATE.get(userId);
	if (!bucket) return;
	bucket.inFlight = false;
}

type ExecRequestBody = {
	command?: string;
	timeoutMs?: number;
	machineId?: string;
};

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as ExecRequestBody;
	const command = typeof body.command === "string" ? body.command.trim() : "";
	if (!command) {
		return Response.json(
			{ error: "missing_command", message: "Command is required." },
			{ status: 400 },
		);
	}
	if (command.length > COMMAND_MAX_LENGTH) {
		return Response.json(
			{
				error: "command_too_long",
				message: `Command exceeds ${COMMAND_MAX_LENGTH} char cap. Use a heredoc file or split it.`,
			},
			{ status: 400 },
		);
	}

	const timeoutMs = clampTimeout(body.timeoutMs);

	const gate = pruneAndCheck(userId);
	if (!gate.ok) {
		const retrySeconds = Math.ceil(gate.retryAfterMs / 1000);
		return Response.json(
			{
				error: gate.reason === "concurrent" ? "command_in_flight" : "rate_limited",
				message:
					gate.reason === "concurrent"
						? "A previous command is still running. Wait for it to finish."
						: `Soft cap is ${RATE_MAX_PER_WINDOW} commands per minute. Try again in ${retrySeconds}s.`,
				retryAfterMs: gate.retryAfterMs,
			},
			{
				status: 429,
				headers: { "Retry-After": String(retrySeconds) },
			},
		);
	}

	const machineId = body.machineId ?? undefined;

	if (!(await isMachineRunning(machineId))) {
		return Response.json(
			{
				error: "machine_offline",
				message: "Machine is not awake. Wake it from the dashboard first.",
			},
			{ status: 503 },
		);
	}

	markStart(userId);
	const startedAt = new Date().toISOString();
	const t0 = Date.now();
	try {
		const result = await execOnMachine(command, { timeoutMs, machineId });
		const elapsedMs = Date.now() - t0;
		const finishedAt = new Date().toISOString();
		return Response.json(
			{
				ok: true,
				startedAt,
				finishedAt,
				elapsedMs,
				command,
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (err) {
		const elapsedMs = Date.now() - t0;
		return Response.json(
			{
				ok: false,
				error: "exec_failed",
				message: err instanceof Error ? err.message : "exec failed",
				elapsedMs,
				startedAt,
				finishedAt: new Date().toISOString(),
				command,
			},
			{ status: 502 },
		);
	} finally {
		markEnd(userId);
	}
}

function clampTimeout(raw: unknown): number {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) {
		return COMMAND_TIMEOUT_MS_DEFAULT;
	}
	return Math.min(COMMAND_TIMEOUT_MS_MAX, Math.max(1_000, Math.floor(value)));
}

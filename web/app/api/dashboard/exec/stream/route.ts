/**
 * POST /api/dashboard/exec/stream
 *
 * SSE-streaming version of the exec endpoint. Instead of blocking for
 * up to 30s and returning a single JSON blob, this streams events as
 * the command executes:
 *
 *   event: started    → { command, startedAt }
 *   event: heartbeat  → { elapsedMs }           (every ~800ms while running)
 *   event: output     → { stdout, stderr }      (streamed in chunks if available)
 *   event: done       → { exitCode, stdout, stderr, elapsedMs, finishedAt }
 *   event: error      → { message }
 *
 * The browser sees output arriving progressively so the terminal
 * feels alive instead of dead while waiting.
 */

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMAND_TIMEOUT_MS_DEFAULT = 30_000;
const COMMAND_TIMEOUT_MS_MAX = 120_000;
const COMMAND_MAX_LENGTH = 4_000;
const HEARTBEAT_INTERVAL_MS = 800;

type ExecRequestBody = {
	command?: string;
	timeoutMs?: number;
};

function sseFrame(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
			{ error: "command_too_long", message: `Exceeds ${COMMAND_MAX_LENGTH} chars.` },
			{ status: 400 },
		);
	}

	const timeoutMs = clampTimeout(body.timeoutMs);

	if (!(await isMachineRunning())) {
		return Response.json(
			{ error: "machine_offline", message: "Machine is not awake." },
			{ status: 503 },
		);
	}

	const startedAt = new Date().toISOString();
	const t0 = Date.now();

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const write = (s: string) => controller.enqueue(encoder.encode(s));

			write(sseFrame("started", { command, startedAt }));

			const heartbeat = setInterval(() => {
				write(sseFrame("heartbeat", { elapsedMs: Date.now() - t0 }));
			}, HEARTBEAT_INTERVAL_MS);

			execOnMachine(command, { timeoutMs })
				.then((result) => {
					clearInterval(heartbeat);
					const elapsedMs = Date.now() - t0;
					const finishedAt = new Date().toISOString();

					// Stream output in chunks for large output
					const stdout = result.stdout ?? "";
					const stderr = result.stderr ?? "";
					const CHUNK_SIZE = 4096;

					if (stdout.length > CHUNK_SIZE) {
						for (let i = 0; i < stdout.length; i += CHUNK_SIZE) {
							write(sseFrame("output", {
								stdout: stdout.slice(i, i + CHUNK_SIZE),
								stderr: "",
								chunk: Math.floor(i / CHUNK_SIZE),
								total: Math.ceil(stdout.length / CHUNK_SIZE),
							}));
						}
					}

					write(sseFrame("done", {
						exitCode: result.exitCode,
						stdout,
						stderr,
						elapsedMs,
						finishedAt,
					}));
					controller.close();
				})
				.catch((err) => {
					clearInterval(heartbeat);
					const message = err instanceof Error ? err.message : "exec failed";
					write(sseFrame("error", {
						message,
						elapsedMs: Date.now() - t0,
						finishedAt: new Date().toISOString(),
					}));
					controller.close();
				});
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}

function clampTimeout(raw: unknown): number {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return COMMAND_TIMEOUT_MS_DEFAULT;
	return Math.min(COMMAND_TIMEOUT_MS_MAX, Math.max(1_000, Math.floor(value)));
}

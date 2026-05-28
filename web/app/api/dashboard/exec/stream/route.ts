/**
 * POST /api/dashboard/exec/stream
 *
 * SSE exec gateway: streams stdout from the sandbox while the command runs.
 * Uses detached VM exec + log polling (see lib/dashboard/exec-stream.ts).
 */

import { execStreamOnMachine } from "@/lib/dashboard/exec-stream";
import { isMachineRunning } from "@/lib/dashboard/exec";
import { SSE_HEADERS, sseFrame } from "@/lib/dashboard/sse";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COMMAND_TIMEOUT_MS_DEFAULT = 30_000;
const COMMAND_TIMEOUT_MS_MAX = 120_000;
const COMMAND_MAX_LENGTH = 4_000;
const HEARTBEAT_INTERVAL_MS = 800;

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
			{ error: "command_too_long", message: `Exceeds ${COMMAND_MAX_LENGTH} chars.` },
			{ status: 400 },
		);
	}

	const timeoutMs = clampTimeout(body.timeoutMs);
	const machineId = body.machineId ?? undefined;

	if (!(await isMachineRunning(machineId))) {
		return Response.json(
			{ error: "machine_offline", message: "Machine is not awake." },
			{ status: 503 },
		);
	}

	const startedAt = new Date().toISOString();
	const t0 = Date.now();
	let accumulatedStdout = "";
	let accumulatedStderr = "";

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const write = (s: string) => controller.enqueue(encoder.encode(s));

			write(sseFrame("started", { command, startedAt }));

			const heartbeat = setInterval(() => {
				write(sseFrame("heartbeat", { elapsedMs: Date.now() - t0 }));
			}, HEARTBEAT_INTERVAL_MS);

			try {
				for await (const event of execStreamOnMachine(command, {
					timeoutMs,
					machineId,
					pollMs: 300,
				})) {
					if (event.type === "stdout") {
						accumulatedStdout += event.data;
						write(
							sseFrame("output", {
								stdout: event.data,
								stderr: "",
							}),
						);
					} else if (event.type === "stderr") {
						accumulatedStderr += event.data;
						write(
							sseFrame("output", {
								stdout: "",
								stderr: event.data,
							}),
						);
					} else if (event.type === "exit") {
						clearInterval(heartbeat);
						write(
							sseFrame("done", {
								exitCode: event.exitCode,
								stdout: accumulatedStdout,
								stderr: accumulatedStderr,
								elapsedMs: Date.now() - t0,
								finishedAt: new Date().toISOString(),
							}),
						);
						controller.close();
						return;
					}
				}
				clearInterval(heartbeat);
				write(
					sseFrame("done", {
						exitCode: 0,
						stdout: accumulatedStdout,
						stderr: accumulatedStderr,
						elapsedMs: Date.now() - t0,
						finishedAt: new Date().toISOString(),
					}),
				);
				controller.close();
			} catch (err) {
				clearInterval(heartbeat);
				const message = err instanceof Error ? err.message : "exec failed";
				write(
					sseFrame("error", {
						message,
						elapsedMs: Date.now() - t0,
						finishedAt: new Date().toISOString(),
					}),
				);
				controller.close();
			}
		},
	});

	return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

function clampTimeout(raw: unknown): number {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return COMMAND_TIMEOUT_MS_DEFAULT;
	return Math.min(COMMAND_TIMEOUT_MS_MAX, Math.max(1_000, Math.floor(value)));
}

/**
 * GET /api/dashboard/terminal/stream?machineId=&offset=
 *
 * SSE stream of new interactive-console output starting at byte `offset`.
 * Backed by `streamConsoleOutput` (native tail -f where supported, poll
 * fallback for Dedalus). Emits `output` frames carrying the raw ANSI the
 * tmux pane produced; the client appends `bytes` to its offset so a
 * reconnect resumes without replaying. Bounded by maxDuration; the client
 * reopens with the latest offset when the stream ends.
 */

import { isMachineRunningCached } from "@/lib/dashboard/machine-running-cache";
import { SSE_HEADERS, sseFrame } from "@/lib/dashboard/sse";
import { streamConsoleOutput } from "@/lib/dashboard/terminal-session";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STREAM_BUDGET_MS = 110_000;

function terminalStreamEventResponse(
	event: string,
	data: unknown,
	init?: ResponseInit,
): Response {
	return new Response(sseFrame(event, data), {
		status: 200,
		headers: SSE_HEADERS,
		...init,
	});
}

export async function GET(request: Request): Promise<Response> {
	const start = Date.now();
	const requestId = request.headers.get("x-vercel-id");
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const machineId = url.searchParams.get("machineId")?.trim() || undefined;
	const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

	if (!(await isMachineRunningCached(machineId))) {
		return terminalStreamEventResponse(
			"offline",
			{
				error: "machine_offline",
				message: "Machine is not awake.",
				offset,
			},
			{ headers: { ...SSE_HEADERS, "Cache-Control": "no-cache, no-transform, no-store" } },
		);
	}

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const write = (s: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(s));
				} catch {
					closed = true;
				}
			};

			write(sseFrame("started", { offset }));
			try {
				for await (const event of streamConsoleOutput(machineId, {
					offset,
					maxDurationMs: STREAM_BUDGET_MS,
				})) {
					if (closed) break;
					if (event.type === "stdout" && event.data) {
						write(
							sseFrame("output", {
								data: event.data,
								bytes: Buffer.byteLength(event.data, "utf8"),
							}),
						);
					}
				}
				write(sseFrame("idle", {}));
			} catch (err) {
				const message = err instanceof Error ? err.message : "stream failed";
				console.error(
					JSON.stringify({
						level: "error",
						msg: "terminal_stream_failed",
						route: "/api/dashboard/terminal/stream",
						requestId,
						machineId: machineId ?? null,
						error: message,
						ms: Date.now() - start,
					}),
				);
				write(sseFrame("error", { message }));
			} finally {
				closed = true;
				try {
					controller.close();
				} catch {
					// already closed
				}
			}
		},
	});

	return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

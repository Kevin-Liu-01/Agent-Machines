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

import { SSE_HEADERS, sseFrame } from "@/lib/dashboard/sse";
import {
	isExpectedConsoleStreamEnd,
	streamConsoleOutput,
} from "@/lib/dashboard/terminal-session";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STREAM_BUDGET_MS = 110_000;

export async function GET(request: Request): Promise<Response> {
	const start = Date.now();
	const requestId = request.headers.get("x-vercel-id");
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const machineId = url.searchParams.get("machineId")?.trim() || undefined;
	const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

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
				if (isExpectedConsoleStreamEnd(err)) {
					console.info(
						JSON.stringify({
							level: "info",
							msg: "terminal_stream_reconnect",
							route: "/api/dashboard/terminal/stream",
							requestId,
							machineId: machineId ?? null,
							error: message,
							ms: Date.now() - start,
						}),
					);
					write(sseFrame("idle", { reason: "stream_timeout" }));
					return;
				}
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

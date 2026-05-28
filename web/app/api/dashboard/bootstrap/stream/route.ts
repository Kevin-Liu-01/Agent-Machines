/**
 * GET /api/dashboard/bootstrap/stream?machineId=
 *
 * SSE gateway for bootstrap setup: emits control-plane phase transitions
 * and live VM output from ~/.agent-machines/logs/bootstrap.log.
 */

import { bootstrapLogPath } from "@/lib/bootstrap/bootstrap-log";
import { tailFileStreamOnMachine } from "@/lib/dashboard/exec-stream";
import { isMachineRunning } from "@/lib/dashboard/exec";
import { SSE_HEADERS, sseFrame } from "@/lib/dashboard/sse";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const machineId = url.searchParams.get("machineId")?.trim();
	if (!machineId) {
		return Response.json(
			{ error: "missing_machine_id", message: "machineId query param is required." },
			{ status: 400 },
		);
	}

	if (!(await isMachineRunning(machineId))) {
		return Response.json(
			{ error: "machine_offline", message: "Machine is not awake." },
			{ status: 503 },
		);
	}

	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === machineId);
	if (!machine) {
		return Response.json(
			{ error: "not_found", message: "Machine not found in your account." },
			{ status: 404 },
		);
	}

	const logPath = bootstrapLogPath(machine.providerKind);
	const startedAt = new Date().toISOString();

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const write = (s: string) => controller.enqueue(encoder.encode(s));
			let lastPhaseKey = "";
			let closed = false;

			write(
				sseFrame("started", {
					machineId,
					logPath,
					startedAt,
				}),
			);

			const phasePoller = setInterval(async () => {
				if (closed) return;
				try {
					const latest = await getUserConfig();
					const current = latest.machines.find((m) => m.id === machineId);
					if (!current) return;
					const bs = current.bootstrapState;
					const phaseKey = `${bs.phase}:${bs.current ?? ""}:${bs.completed.length}`;
					if (phaseKey !== lastPhaseKey) {
						lastPhaseKey = phaseKey;
						write(
							sseFrame("phase", {
								phase: bs.phase,
								current: bs.current,
								completed: bs.completed,
								lastError: bs.lastError,
								at: new Date().toISOString(),
							}),
						);
					}
					if (bs.phase === "succeeded" || bs.phase === "failed") {
						write(
							sseFrame("done", {
								phase: bs.phase,
								lastError: bs.lastError,
								finishedAt: bs.finishedAt,
							}),
						);
						closed = true;
						clearInterval(phasePoller);
						controller.close();
					}
				} catch {
					// transient — next tick retries
				}
			}, 900);

			try {
				for await (const event of tailFileStreamOnMachine(logPath, {
					machineId,
					idleMs: 8_000,
					maxDurationMs: 280_000,
					pollMs: 450,
					stopWhen: async () => {
						const latest = await getUserConfig();
						const current = latest.machines.find((m) => m.id === machineId);
						return (
							current?.bootstrapState.phase === "succeeded" ||
							current?.bootstrapState.phase === "failed"
						);
					},
				})) {
					if (closed) break;
					if (event.type === "stdout" && event.data) {
						write(
							sseFrame("log", {
								text: event.data,
								at: new Date().toISOString(),
							}),
						);
					}
				}
			} catch (err) {
				if (!closed) {
					const message = err instanceof Error ? err.message : "bootstrap stream failed";
					write(sseFrame("error", { message }));
				}
			} finally {
				closed = true;
				clearInterval(phasePoller);
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

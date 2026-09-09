import { after } from "next/server";
import { prepareManagedRun, runErrorResponse } from "@/lib/agents/managed-run";
import { consoleEvent, consoleResultEvents, type ConsoleSseEvent } from "@/lib/agents/console-events";
import { processAgentEvent } from "@/lib/agents/parser";
import { createStreamAccumulator } from "@/lib/agents/protocol";
import { loadChat, saveChat, type ChatRecord } from "@/lib/storage/machine-chats";
import type { ManagedRunResult } from "@/lib/agents/managed-run";
import { storageContextFor } from "@/lib/storage/machine-fs";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Console transport for real Worker runs. No HTTP agent/model gateway needed. */
export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	let run: Awaited<ReturnType<typeof prepareManagedRun>>;
	try { run = await prepareManagedRun(request, userId); }
	catch (error) { return runErrorResponse(error); }
	let connected = true;
	const encoder = new TextEncoder();
	let completion: Promise<void>;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let accumulator = createStreamAccumulator();
			let operationId: string | undefined;
			let emittedResult = false;
			let previous: ChatRecord | null | undefined;
			const startedAt = Date.now();
			const emit = (event: ConsoleSseEvent) => {
				accumulator = processAgentEvent(event, accumulator);
				if (connected) {
					try { controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${event.data}\n\n`)); }
					catch { connected = false; }
				}
			};
			const persist = async () => {
				if (!run.conversationId) return;
				if (previous === undefined) previous = await loadChat(run.conversationId, storageContextFor(run.machine));
				const now = new Date().toISOString();
				const record: ChatRecord = {
					id: run.conversationId, title: (run.messages.find((message) => message.role === "user")?.content ?? "Worker conversation").trim().replace(/\s+/g, " ").slice(0, 120),
					machineId: run.machine.id, model: run.machine.model, createdAt: new Date(run.messages[0]?.createdAt ?? startedAt).toISOString(), updatedAt: now,
					messageCount: run.messages.length + 1, sessionPackageIds: run.sessionPackageIds,
					messages: [
						...run.messages.map((message) => ({ ...previous?.messages.find((saved) => saved.id === message.id), ...message, id: message.id ?? crypto.randomUUID(), createdAt: message.createdAt ?? startedAt })),
						{ id: run.assistantTurnId, role: "assistant", content: accumulator.content, createdAt: startedAt, durationMs: Date.now() - startedAt, model: run.machine.model, agentEvents: accumulator.events, operationId },
					],
				};
				await saveChat(record, storageContextFor(run.machine));
			};
			const heartbeat = setInterval(() => {
				if (connected) { try { controller.enqueue(encoder.encode(": worker-running\n\n")); } catch { connected = false; } }
			}, 10_000);
			completion = (async () => {
				try {
					emit(consoleEvent("status", { label: "Preparing Worker run", detail: "The selected runtime executes inside this machine. Activity and the answer appear when the run returns." }));
					const outcome = await run.execute(async (operation) => {
						if (operationId !== operation.id) {
							operationId = operation.id;
							emit(consoleEvent("status", { label: "Worker run recorded", detail: operation.id }));
							await persist();
						}
						// Preserve available failure evidence before execute rejects a
						// nonzero exit/result error. The journal remains authoritative.
						if (!emittedResult && operation.result && (operation.status === "succeeded" || operation.status === "failed")) {
							for (const event of consoleResultEvents(operation.result as ManagedRunResult)) emit(event);
							emittedResult = true;
						}
					});
					if (!outcome.result) throw new Error(`Worker run is ${outcome.operation.status}, not completed. Operation: ${outcome.operation.id}. Another request may own it; inspect its status before retrying with the same run key. Queued work is not guaranteed to execute unattended.`);
					if (!emittedResult) for (const event of consoleResultEvents(outcome.result)) emit(event);
					emit(consoleEvent("status", { label: "Worker run completed", detail: operationId }));
				} catch (error) {
					emit(consoleEvent("error", { message: error instanceof Error ? error.message : "Worker run failed." }));
				} finally {
					try { await persist(); }
					catch (error) { emit(consoleEvent("error", { message: `Chat could not be saved on the Worker. Run evidence remains in operation ${operationId ?? "history"}. ${error instanceof Error ? error.message : ""}` })); }
					clearInterval(heartbeat);
					if (connected) { try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); } catch { /* browser disconnected */ } }
				}
			})();
		},
		cancel() { connected = false; },
	});
	// Disconnecting detaches the viewer, not the journaled work or its save.
	after(() => completion);
	return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}

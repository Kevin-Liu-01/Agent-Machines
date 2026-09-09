import type { ManagedRunResult } from "./managed-run";
export type ConsoleSseEvent = { event: string; data: string };
export function consoleEvent(event: string, data: unknown): ConsoleSseEvent { return { event, data: JSON.stringify(data) }; }
/** Lift native harness evidence into the existing activity protocol. */
export function consoleResultEvents(result: ManagedRunResult): ConsoleSseEvent[] {
	const events: ConsoleSseEvent[] = [];
	for (const event of result.events ?? []) {
		switch (event.type) {
			case "started": events.push(consoleEvent("status", { label: `${event.harness} started`, detail: event.sessionId })); break;
			case "thinking": events.push(consoleEvent("thinking", { delta: event.delta })); break;
			case "tool_call": events.push(consoleEvent("tool.start", { id: event.id, name: event.name, arguments: event.input ?? "{}" })); break;
			case "tool_result": events.push(consoleEvent("tool.done", { id: event.id, output: event.output ?? "", error: event.isError ? event.output || "Tool failed." : undefined })); break;
			case "status": events.push(consoleEvent("status", { label: event.label })); break;
			case "error": events.push(consoleEvent("error", { message: event.message })); break;
			case "text": case "result": case "done": break;
			default: event satisfies never;
		}
	}
	events.push(consoleEvent("thinking.done", {}));
	events.push(consoleEvent("message", { choices: [{ delta: { content: result.text ?? "" } }] }));
	return events;
}

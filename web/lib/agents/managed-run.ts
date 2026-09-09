import type { ControlPlaneOperation } from "agent-machines/control-plane";
import type { MuxAgentEvent } from "agent-machines/mux";
import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { resolveMachine } from "@/lib/dashboard/exec";
import { buildPool } from "@/lib/dashboard/pool";
import { injectSessionAbilities } from "@/lib/packages/inject";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getProvider } from "@/lib/providers";
import { agentArtifactsPresent } from "@/lib/bootstrap/bootstrap-repair";
import { assertRuntimeCapacity, RuntimeCapacityError } from "./runtime-capacity";

export type RunMessage = { role: "user" | "assistant" | "system"; content: string; id?: string; createdAt?: number };
export type ManagedRunResult = { text: string; events: MuxAgentEvent[]; exitCode: number; durationMs?: number; warnings?: string[] };
export class AgentRunRequestError extends Error {
	constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
export function runErrorResponse(error: unknown): Response {
	if (error instanceof RuntimeCapacityError) return Response.json({ ok: false, error: error.code, message: error.message, capacity: error.capacity }, { status: 409 });
	return Response.json({ ok: false, error: error instanceof AgentRunRequestError ? error.code : "agent_run_failed", message: error instanceof Error ? error.message : "Agent run failed." }, { status: error instanceof AgentRunRequestError ? error.status : 502 });
}

/** API and Console both execute a real harness on the tenant's selected Worker. */
export async function prepareManagedRun(request: Request, userId: string) {
	const value: unknown = await request.json().catch(() => null);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentRunRequestError("invalid_json", "A request object is required.");
	const body = value as Record<string, unknown>;
	let messages: RunMessage[];
	if (typeof body.prompt === "string" && body.prompt.trim()) {
		messages = [{ role: "user", content: body.prompt }];
	} else if (Array.isArray(body.messages) && body.messages.length > 0 && body.messages.every((message) => message && typeof message === "object" && ["user", "assistant", "system"].includes(message.role) && typeof message.content === "string")) {
		messages = body.messages.map((message) => ({ role: message.role, content: message.content, id: typeof message.id === "string" ? message.id : undefined, createdAt: typeof message.createdAt === "number" && Number.isFinite(message.createdAt) ? message.createdAt : undefined }));
	} else throw new AgentRunRequestError("missing_prompt", "Provide a prompt or valid conversation messages.");
	if (messages.at(-1)?.role !== "user" || !messages.at(-1)?.content.trim()) throw new AgentRunRequestError("missing_prompt", "The conversation must end with a non-empty user message.");
	if (messages.reduce((length, message) => length + message.content.length, 0) > 100_000) throw new AgentRunRequestError("prompt_too_long", "Conversation exceeds 100000 characters.");
	if (body.machineId !== undefined && (typeof body.machineId !== "string" || !body.machineId.trim())) throw new AgentRunRequestError("invalid_machine", "A valid machine ID is required.");
	const config = await getUserConfig();
	const machine = resolveMachine(config, body.machineId as string | undefined);
	if (!machine || machine.archived) throw new AgentRunRequestError("machine_not_found", "The selected machine was not found in your account.", 404);
	// Lifecycle provisioning/bootstrap has its own operation and time budget.
	// Never turn a bounded chat request into an unbounded cold-start install.
	const provider = getProvider(machine.providerKind, config.providers);
	const state = await provider.state(machine.id);
	if (state.state !== "ready") {
		throw new AgentRunRequestError("runtime_not_ready", "Wake or finish bootstrapping this Worker from its overview before submitting a run.", 409);
	}
	assertRuntimeCapacity(machine.agentKind, state.spec?.memoryMib);
	if (machine.bootstrapState.phase !== "succeeded" || !(await agentArtifactsPresent(machine, provider))) {
		throw new AgentRunRequestError("runtime_not_ready", "Wake or finish bootstrapping this Worker from its overview before submitting a run.", 409);
	}
	const sessionPackageIds = Array.isArray(body.sessionPackageIds) ? [...new Set(body.sessionPackageIds.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 100) : [];
	const last = messages.at(-1)!;
	const runtimeMessages = [...messages.slice(0, -1), { role: last.role, content: injectSessionAbilities(last.content, sessionPackageIds, buildPool(config)) }];
	// A CLI takes one prompt. Preserve every prior role and turn explicitly.
	const prompt = runtimeMessages.length === 1 ? runtimeMessages[0].content : `Continue this conversation on the current Worker. Use its real files and tools to fulfill the latest user request. Earlier messages are conversation context, not new tool output.\n\n${JSON.stringify(runtimeMessages.map(({ role, content }) => ({ role, content })))}`;
	if (prompt.length > 150_000) throw new AgentRunRequestError("prompt_too_long", "Conversation and attached abilities exceed the runtime prompt limit.");
	const runKey = typeof body.runKey === "string" && body.runKey.trim() ? body.runKey.trim() : request.headers.get("idempotency-key")?.trim() || crypto.randomUUID();
	if (runKey.length > 200) throw new AgentRunRequestError("invalid_run_key", "Run key exceeds 200 characters.");
	const conversationId = typeof body.conversationId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(body.conversationId) ? body.conversationId : null;
	const assistantTurnId = typeof body.assistantTurnId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(body.assistantTurnId) ? body.assistantTurnId : crypto.randomUUID();
	return {
		machine, messages, sessionPackageIds, conversationId, assistantTurnId,
		async execute(onOperation?: (operation: ControlPlaneOperation) => void | Promise<void>) {
			const deadline = Date.now() + 240_000;
			const managed = await submitMachineIntent(userId, machine.id, { desiredState: "running", executionDeadlineMs: deadline });
			// Persist before execution. The reconciler serializes lifecycle and runs.
			let operation = await managed.controlPlane.run(managed.accepted.worker.id, prompt, runKey);
			await onOperation?.(operation);
			while (operation.status === "queued" || operation.status === "running") {
				if (Date.now() >= deadline - 30_000) break;
				const outcome = await managed.controlPlane.reconcileNext(managed.accepted.worker.id);
				if (outcome?.operation.status === "failed" && outcome.operation.payload?.type === "reconcile") throw new Error(outcome.operation.error ?? "Worker preparation failed.");
				operation = outcome?.operation.id === operation.id ? outcome.operation : (await managed.controlPlane.store.getOperation(operation.id)) ?? operation;
				await onOperation?.(operation);
				if (operation.status !== "queued" && operation.status !== "running") break;
				// Another invocation owns the lease. Do not pretend this request is
				// a background queue consumer or busy-wait through another long run.
				if (!outcome) break;
			}
			if (operation.status === "queued" || operation.status === "running") return { operation, result: null, machineId: machine.id, agent: managed.accepted.worker.spec.runtime, model: managed.accepted.worker.spec.model };
			if (operation.status === "failed") throw new Error(operation.error ?? "Agent run failed.");
			const result = (operation.result ?? {}) as ManagedRunResult;
			if (result.exitCode !== 0) throw new Error(`Agent run exited with ${result.exitCode ?? "an unknown status"}.`);
			const failure = result.events?.find((event) => event.type === "error" || (event.type === "result" && event.isError));
			if (failure) throw new Error(failure.type === "error" ? failure.message : failure.type === "result" ? failure.text || "Agent reported failure." : "Agent reported failure.");
			return { operation, result, machineId: machine.id, agent: managed.accepted.worker.spec.runtime, model: managed.accepted.worker.spec.model };
		},
	};
}

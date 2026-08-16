import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { resolveMachine } from "@/lib/dashboard/exec";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ChatMessage = {
	role: "user" | "assistant" | "system";
	content: string;
};

type Body = {
	machineId?: string;
	prompt?: string;
	messages?: ChatMessage[];
	runKey?: string;
};

const MAX_PROMPT_LENGTH = 100_000;

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const body = (await request.json().catch(() => ({}))) as Body;
	const prompt = resolvePrompt(body);
	if (!prompt) {
		return Response.json(
			{ error: "missing_prompt", message: "Prompt is required." },
			{ status: 400 },
		);
	}
	if (prompt.length > MAX_PROMPT_LENGTH) {
		return Response.json(
			{ error: "prompt_too_long", message: `Prompt exceeds ${MAX_PROMPT_LENGTH} characters.` },
			{ status: 400 },
		);
	}

	const config = await getUserConfig();
	const machine = resolveMachine(config, body.machineId ?? null);
	if (!machine) {
		return Response.json(
			{
				error: "machine_not_found",
				message: body.machineId
					? `Machine ${body.machineId} was not found.`
					: "No active machine selected.",
			},
			{ status: 404 },
		);
	}

	try {
		const managed = await submitMachineIntent(userId, machine.id, {
			desiredState: "running",
		});
		if (
			managed.accepted.operation.status === "queued" ||
			managed.accepted.operation.status === "running"
		) {
			const lifecycle = await managed.controlPlane.reconcileNext(
				managed.accepted.worker.id,
			);
			if (lifecycle?.operation.status === "failed") {
				throw new Error(lifecycle.operation.error ?? "machine reconciliation failed");
			}
		}

		const runKey =
			body.runKey?.trim() ||
			request.headers.get("idempotency-key")?.trim() ||
			crypto.randomUUID();
		const operation = await managed.controlPlane.run(
			managed.accepted.worker.id,
			prompt,
			runKey,
		);
		let terminal = operation;
		if (operation.status === "queued" || operation.status === "running") {
			const outcome = await managed.controlPlane.reconcileNext(
				managed.accepted.worker.id,
			);
			terminal =
				outcome?.operation.id === operation.id
					? outcome.operation
					: (await managed.controlPlane.store.getOperation(operation.id)) ?? operation;
		}
		if (terminal.status === "failed") {
			return Response.json(
				{ ok: false, error: "agent_run_failed", message: terminal.error },
				{ status: 502 },
			);
		}
		if (terminal.status !== "succeeded") {
			return Response.json(
				{
					ok: true,
					status: terminal.status,
					operation: terminal,
					statusUrl: `/api/dashboard/control-plane/operations/${terminal.id}`,
				},
				{ status: 202 },
			);
		}
		const result = (terminal.result ?? {}) as {
			text?: string;
			events?: unknown[];
			exitCode?: number;
			durationMs?: number;
		};
		return Response.json({
			ok: true,
			mode: "control-plane",
			machineId: machine.id,
			agent: managed.accepted.worker.spec.runtime,
			model: managed.accepted.worker.spec.model,
			text: result.text ?? "",
			events: result.events ?? [],
			exitCode: result.exitCode ?? 0,
			durationMs: result.durationMs,
			operation: terminal,
		});
	} catch (error) {
		return Response.json(
			{
				ok: false,
				error: "agent_run_failed",
				message: error instanceof Error ? error.message : "agent run failed",
			},
			{ status: 502 },
		);
	}
}

function resolvePrompt(body: Body): string | null {
	if (typeof body.prompt === "string" && body.prompt.trim()) return body.prompt;
	if (!Array.isArray(body.messages)) return null;
	return (
		[...body.messages]
			.reverse()
			.find((message) => message.role === "user" && message.content.trim())
			?.content ?? null
	);
}

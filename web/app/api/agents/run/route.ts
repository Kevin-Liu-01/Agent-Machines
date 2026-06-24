import { agentOneShotInvocation } from "@/lib/dashboard/agent-launch";
import { resolveMachine } from "@/lib/dashboard/exec";
import { getProvider } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import type { AgentKind, MachineRef } from "@/lib/user-config/schema";

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
	timeoutMs?: number;
};

const MAX_PROMPT_LENGTH = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

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
			{
				error: "prompt_too_long",
				message: `Prompt exceeds ${MAX_PROMPT_LENGTH} characters.`,
			},
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

	if (shouldUseGateway(machine)) {
		try {
			const text = await runViaGateway(machine, prompt);
			return Response.json({
				ok: true,
				mode: "gateway",
				machineId: machine.id,
				agent: machine.agentKind,
				model: machine.model,
				text,
			});
		} catch (err) {
			return Response.json(
				{
					ok: false,
					error: "gateway_run_failed",
					message: err instanceof Error ? err.message : "gateway run failed",
				},
				{ status: 502 },
			);
		}
	}

	const invocation = agentOneShotInvocation(machine.agentKind);
	if (!invocation) {
		return Response.json(
			{
				error: "agent_not_runnable",
				message: `${machine.agentKind} does not expose a one-shot run path yet.`,
			},
			{ status: 400 },
		);
	}

	try {
		const provider = getProvider(machine.providerKind, config.providers);
		const command = `export AM_CRON_PROMPT=${shQuote(prompt)}; ${invocation}`;
		const result = await provider.exec(machine.id, command, {
			timeoutMs: clampTimeout(body.timeoutMs),
		});
		const text = result.stdout.trim() || result.stderr.trim();
		return Response.json(
			{
				ok: result.exitCode === 0,
				mode: "exec",
				machineId: machine.id,
				agent: machine.agentKind,
				model: machine.model,
				text,
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			},
			{ status: result.exitCode === 0 ? 200 : 502 },
		);
	} catch (err) {
		return Response.json(
			{
				ok: false,
				error: "agent_run_failed",
				message: err instanceof Error ? err.message : "agent run failed",
			},
			{ status: 502 },
		);
	}
}

function resolvePrompt(body: Body): string | null {
	if (typeof body.prompt === "string" && body.prompt.trim().length > 0) {
		return body.prompt;
	}
	if (!Array.isArray(body.messages)) return null;
	const lastUser = [...body.messages]
		.reverse()
		.find((message) => message.role === "user" && message.content.trim());
	return lastUser?.content ?? null;
}

function shouldUseGateway(machine: MachineRef): boolean {
	if (machine.agentKind === "codex" || machine.agentKind === "claude-code") {
		return false;
	}
	return Boolean(machine.apiUrl && machine.apiKey);
}

async function runViaGateway(
	machine: MachineRef,
	prompt: string,
): Promise<string> {
	if (!machine.apiUrl || !machine.apiKey) {
		throw new Error("Machine has no HTTP agent gateway.");
	}
	const upstream = await fetch(`${normalizeOpenAiBase(machine.apiUrl)}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${machine.apiKey}`,
		},
		body: JSON.stringify({
			model: gatewayModel(machine.agentKind, machine.model),
			messages: [{ role: "user", content: prompt }],
			stream: true,
		}),
	});
	if (!upstream.ok || !upstream.body) {
		const text = await upstream.text().catch(() => "");
		throw new Error(text || `HTTP ${upstream.status}`);
	}
	return readOpenAiStream(upstream.body);
}

function gatewayModel(agentKind: AgentKind, model: string): string {
	return agentKind === "openclaw" ? "openclaw" : model;
}

function normalizeOpenAiBase(value: string): string {
	const trimmed = value.trim().replace(/\/$/, "");
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

async function readOpenAiStream(
	body: ReadableStream<Uint8Array>,
): Promise<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let text = "";

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";
		for (const event of events) {
			for (const line of event.split("\n")) {
				if (!line.startsWith("data: ")) continue;
				const payload = line.slice(6).trim();
				if (payload === "[DONE]") return text;
				try {
					const parsed = JSON.parse(payload) as {
						choices?: Array<{ delta?: { content?: string } }>;
					};
					text += parsed.choices?.[0]?.delta?.content ?? "";
				} catch {
					// Ignore progress frames and provider-specific annotations.
				}
			}
		}
	}

	return text;
}

function shQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function clampTimeout(raw: unknown): number {
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
	return Math.min(MAX_TIMEOUT_MS, Math.max(1_000, Math.floor(value)));
}

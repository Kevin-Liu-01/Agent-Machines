import type { AgentKind, AgentMeta, AgentOperationModel } from "@/lib/types";

/**
 * Canonical agent metadata registry.
 *
 * Used by landing-page components, the dashboard setup wizard,
 * and the command-toggle panel. Agents are grouped by operation
 * model: autonomous agents have a built-in driver that wakes
 * them up on schedule; task-driven CLIs require per-task human
 * instruction but can be automated via headless/exec flags.
 */
export const AGENTS: ReadonlyArray<AgentMeta> = [
	{
		id: "hermes",
		name: "Hermes",
		by: "Nous Research",
		operationModel: "autonomous",
		tagline: "memory . cron . sessions . MCP-native",
		capabilities: "Self-improving agent with persistent memory, cron scheduling, session history, MCP host, subagents, and FTS5 search. Works with any OpenAI-compatible endpoint -- 30+ providers out of the box.",
		providerKeys: ["DEDALUS_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
		providerOptions: [
			{ key: "DEDALUS_API_KEY", label: "Dedalus Router", hint: "routes 200+ models with one key via api.dedaluslabs.ai/v1" },
			{ key: "OPENAI_API_KEY", label: "OpenAI direct", hint: "platform.openai.com" },
			{ key: "ANTHROPIC_API_KEY", label: "Anthropic direct", hint: "console.anthropic.com" },
			{ key: "OPENROUTER_API_KEY", label: "OpenRouter", hint: "gateway to 200+ models" },
			{ key: "AI_GATEWAY_URL + AI_GATEWAY_KEY", label: "Any OpenAI-compatible", hint: "LiteLLM, Portkey, RelayPlane, self-hosted" },
		],
		installCmd: "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash",
		runCmd: "hermes",
		headlessCmd: "hermes gateway",
		docsUrl: "https://hermes-agent.nousresearch.com/docs/",
		githubUrl: "https://github.com/NousResearch/hermes-agent",
		logoMark: "nous",
		serviceSlug: null,
	},
	{
		id: "openclaw",
		name: "OpenClaw",
		by: "OpenClaw",
		operationModel: "autonomous",
		tagline: "computer use . browser . shell . vision",
		capabilities: "Autonomous agent with browser, screenshot, shell, vision, and computer-use. Multi-channel gateway (Telegram, Slack, WhatsApp) with baked-in skills and scheduling. Accepts any provider key.",
		providerKeys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEDALUS_API_KEY"],
		providerOptions: [
			{ key: "ANTHROPIC_API_KEY", label: "Anthropic direct", hint: "console.anthropic.com -- default provider" },
			{ key: "OPENAI_API_KEY", label: "OpenAI direct", hint: "platform.openai.com" },
			{ key: "DEDALUS_API_KEY", label: "Dedalus Router", hint: "set ANTHROPIC_BASE_URL to api.dedaluslabs.ai/v1" },
			{ key: "OPENROUTER_API_KEY", label: "OpenRouter", hint: "gateway to 200+ models" },
			{ key: "AI_GATEWAY_URL + AI_GATEWAY_KEY", label: "Any OpenAI-compatible", hint: "LiteLLM, Portkey, self-hosted" },
		],
		installCmd: "npm install -g openclaw@latest",
		runCmd: "openclaw",
		headlessCmd: "openclaw gateway run",
		docsUrl: "https://documentation.openclaw.ai/",
		githubUrl: "https://github.com/openclaw/openclaw",
		logoMark: "openclaw",
		serviceSlug: null,
	},
	{
		id: "claude-code",
		name: "Claude Code",
		by: "Anthropic",
		operationModel: "task-driven",
		tagline: "agentic coding . file edit . shell . SDK",
		capabilities: "Terminal coding agent with deep repo awareness, multi-step tool use, and the Agent SDK for programmatic headless execution. Can be automated via cron + claude -p --dangerously-skip-permissions.",
		providerKeys: ["ANTHROPIC_API_KEY"],
		providerOptions: [
			{ key: "ANTHROPIC_API_KEY", label: "Anthropic API key", hint: "console.anthropic.com/settings/keys" },
			{ key: "claude auth login", label: "Anthropic subscription", hint: "Pro / Max / Team / Enterprise" },
		],
		installCmd: "curl -fsSL https://claude.ai/install.sh | bash",
		runCmd: "claude",
		headlessCmd: 'claude -p "task description"',
		docsUrl: "https://code.claude.com/docs/",
		githubUrl: "https://github.com/anthropics/claude-code",
		logoMark: "anthropic",
		serviceSlug: "anthropic",
	},
	{
		id: "codex",
		name: "Codex CLI",
		by: "OpenAI",
		operationModel: "task-driven",
		tagline: "agentic coding . sandbox . exec mode",
		capabilities: "Terminal coding agent with sandbox isolation, workspace-write and full-access modes. Non-interactive via codex exec for CI/CD and automation. JSONL output for programmatic parsing.",
		providerKeys: ["OPENAI_API_KEY"],
		providerOptions: [
			{ key: "OPENAI_API_KEY", label: "OpenAI API key", hint: "platform.openai.com/api-keys" },
			{ key: "codex login", label: "ChatGPT subscription", hint: "Plus / Pro / Business / Edu / Enterprise" },
		],
		installCmd: "npm install -g @openai/codex",
		runCmd: "codex",
		headlessCmd: 'codex exec "task description"',
		docsUrl: "https://developers.openai.com/codex/",
		githubUrl: "https://github.com/openai/codex",
		logoMark: "openai",
		serviceSlug: "openai",
	},
];

export const AGENT_KINDS: ReadonlyArray<AgentKind> = AGENTS.map((a) => a.id);

export function getAgentMeta(id: AgentKind): AgentMeta {
	const found = AGENTS.find((a) => a.id === id);
	if (!found) throw new Error(`Unknown agent kind: ${id}`);
	return found;
}

export function agentsByModel(model: AgentOperationModel): AgentMeta[] {
	return AGENTS.filter((a) => a.operationModel === model);
}

export const AUTONOMOUS_AGENTS = agentsByModel("autonomous");
export const TASK_DRIVEN_AGENTS = agentsByModel("task-driven");

import type { AgentKind } from "@/lib/user-config/schema";
import { DEFAULT_MODEL } from "@/lib/user-config/schema";

/** Native coding CLIs do not accept OpenRouter-style provider prefixes. */
export const DEFAULT_CLAUDE_CODE_MODEL = "claude-opus-4-8";
export const DEFAULT_CODEX_MODEL = "gpt-5.6-sol";

export function runtimeModel(agent: AgentKind, requested?: string | null): string {
	const value = requested?.trim() ?? "";
	switch (agent) {
		case "claude-code": {
			const native = value.startsWith("anthropic/")
				? value.slice("anthropic/".length)
				: value;
			return native.startsWith("claude-") ? native : DEFAULT_CLAUDE_CODE_MODEL;
		}
		case "codex": {
			const native = value.startsWith("openai/")
				? value.slice("openai/".length)
				: value;
			return /^(?:gpt-|o\d)/.test(native) && !native.includes("/")
				? native
				: DEFAULT_CODEX_MODEL;
		}
		case "hermes":
		case "openclaw": {
			const routed = value || DEFAULT_MODEL;
			if (routed.includes("/")) return routed;
			if (/^(?:gpt-|o\d)/.test(routed)) return `openai/${routed}`;
			if (routed.startsWith("claude-")) return `anthropic/${routed}`;
			return routed;
		}
	}
}

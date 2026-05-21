import type { Mark } from "@/components/Logo";
import type { AgentKind, ProviderKind } from "@/lib/user-config/schema";

import { agentMetaForKind } from "./agent-styling";

const PROVIDER_MARK: Record<ProviderKind, Mark> = {
	dedalus: "dedalus",
	e2b: "e2b",
	sprites: "sprites",
};

export function machineLogoMark(): Mark {
	return "am";
}

export function providerLogoMark(kind: ProviderKind): Mark {
	return PROVIDER_MARK[kind] ?? "dedalus";
}

export function agentLogoMark(agentKind: AgentKind): Mark {
	return agentMetaForKind(agentKind).logoMark as Mark;
}

/** Best-effort model vendor mark from gateway model string. */
export function modelLogoMark(model: string): Mark | null {
	const m = model.toLowerCase();
	if (m.includes("anthropic") || m.includes("claude")) return "anthropic";
	if (m.includes("openai") || m.includes("gpt") || m.includes("codex")) return "openai";
	return null;
}

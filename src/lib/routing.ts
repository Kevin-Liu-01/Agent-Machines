export type AgentKind = "hermes" | "openclaw" | "claude-code" | "codex";
export type SandboxKind = "dedalus" | "e2b" | "sprites" | "vercel";

export type MachineSpec = {
	vcpu: number;
	memoryMib: number;
	storageGib: number;
};

export type AgentRoute = {
	agent: AgentKind;
	sandbox: SandboxKind;
	model: string;
	persistent: boolean;
	spec: MachineSpec;
	name?: string;
	gatewayProfileId?: string | null;
	environmentProfileId?: string | null;
};

export type AgentCreateInput = {
	agent: AgentKind;
	sandbox: SandboxKind;
	model?: string;
	persistent?: boolean;
	spec?: Partial<MachineSpec>;
	name?: string;
	gatewayProfileId?: string | null;
	environmentProfileId?: string | null;
};

const DEFAULT_SPEC: MachineSpec = {
	vcpu: 1,
	memoryMib: 2048,
	storageGib: 10,
};

const MODEL_ALIASES: Record<string, string> = {
	"claude-opus-4.8": "anthropic/claude-opus-4-8",
	"claude-opus-4.7": "anthropic/claude-opus-4-7",
	"claude-opus-4-8": "anthropic/claude-opus-4-8",
	"claude-opus-4-7": "anthropic/claude-opus-4-7",
	"claude-sonnet-4.6": "anthropic/claude-sonnet-4-6",
	"claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
	"sonnet-4.6": "anthropic/claude-sonnet-4-6",
};

export function normalizeModel(model: string | undefined): string {
	const trimmed = model?.trim();
	if (!trimmed) return "anthropic/claude-opus-4-8";
	return MODEL_ALIASES[trimmed] ?? trimmed;
}

export function resolveAgentRoute(input: AgentCreateInput): AgentRoute {
	return {
		agent: input.agent,
		sandbox: input.sandbox,
		model: normalizeModel(input.model),
		persistent: input.persistent ?? true,
		spec: {
			vcpu: input.spec?.vcpu ?? DEFAULT_SPEC.vcpu,
			memoryMib: input.spec?.memoryMib ?? DEFAULT_SPEC.memoryMib,
			storageGib: input.spec?.storageGib ?? DEFAULT_SPEC.storageGib,
		},
		name: input.name,
		gatewayProfileId: input.gatewayProfileId ?? null,
		environmentProfileId: input.environmentProfileId ?? null,
	};
}

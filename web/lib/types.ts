import type { CompositeMark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";
import type { AgentKind } from "@/lib/user-config/schema";

/* ------------------------------------------------------------------ */
/* Agent taxonomy                                                      */
/* ------------------------------------------------------------------ */

export type { AgentKind } from "@/lib/user-config/schema";

export type AgentOperationModel = "autonomous" | "task-driven";

export type ProviderOption = {
	key: string;
	label: string;
	hint?: string;
};

export type AgentMeta = {
	id: AgentKind;
	name: string;
	by: string;
	operationModel: AgentOperationModel;
	tagline: string;
	capabilities: string;
	/** Primary provider key(s) shown by default. */
	providerKeys: string[];
	/** All accepted provider options -- direct APIs, gateways, subscriptions. */
	providerOptions: ProviderOption[];
	installCmd: string;
	runCmd: string;
	headlessCmd?: string;
	docsUrl: string;
	githubUrl: string;
	logoMark: CompositeMark;
	serviceSlug: ServiceSlug | null;
};

/* ------------------------------------------------------------------ */
/* Chat primitives                                                     */
/* ------------------------------------------------------------------ */

export type Role = "user" | "assistant" | "system";

export type ToolCallStatus = "running" | "completed" | "error";

export type ToolCall = {
	id: string;
	name: string;
	arguments: string;
	result?: string;
	status: ToolCallStatus;
	startedAt: number;
	completedAt?: number;
};

export type ThinkingBlock = {
	id: string;
	content: string;
	startedAt: number;
	completedAt?: number;
};

export type MessageEvent =
	| { type: "tool_call"; toolCall: ToolCall }
	| { type: "thinking"; thinking: ThinkingBlock }
	| { type: "status"; label: string; detail?: string; timestamp: number };

export type Message = {
	id: string;
	role: Role;
	content: string;
	createdAt: number;
	events?: MessageEvent[];
	model?: string;
	durationMs?: number;
};

export type ChatRequestBody = {
	messages: Array<{ role: Role; content: string }>;
};

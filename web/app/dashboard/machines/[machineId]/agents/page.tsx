import { notFound } from "next/navigation";

import { AgentsPanel, type AgentCardData } from "@/components/dashboard/AgentsPanel";
import { agentCredentialRequirements } from "@/lib/agents/credentials";
import {
	DEFAULT_ROUTER_ID,
	agentUpstreamReadiness,
	agentUsesRouter,
	requiredNativeUpstream,
} from "@/lib/agents/upstreams";
import { getUserConfig } from "@/lib/user-config/clerk";
import { AGENT_KINDS, AGENT_LABEL, toPublicConfig } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ machineId: string }> };

export default async function MachineAgentsPage({ params }: Params) {
	const { machineId } = await params;
	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === machineId);
	if (!machine) notFound();

	// Which inference upstreams have a key on file — drives readiness without
	// exposing the keys themselves.
	const aiConfigured: Record<string, boolean> = {
		dedalus: Boolean(config.providers.dedalus?.apiKey),
		anthropic: Boolean(config.aiProviderKeys.anthropic),
		openai: Boolean(config.aiProviderKeys.openai),
		openrouter: Boolean(config.aiProviderKeys.openrouter),
		google: Boolean(config.aiProviderKeys.google),
		vercelAiGateway: Boolean(config.aiProviderKeys.vercelAiGateway),
		custom: Boolean(config.aiProviderKeys.custom?.key),
	};
	const routerId = machine.gatewayProfileId ?? DEFAULT_ROUTER_ID;

	const agents: AgentCardData[] = AGENT_KINDS.map((kind) => {
		const readiness = agentUpstreamReadiness(kind, routerId, aiConfigured);
		const requirements = agentCredentialRequirements(kind).map((r) => ({
			field: r.field,
			label: r.label,
			required: r.required,
			signupUrl: r.signupUrl,
			configured: aiConfigured[r.field] ?? false,
		}));
		return {
			kind,
			label: AGENT_LABEL[kind],
			isActive: kind === machine.agentKind,
			usesRouter: agentUsesRouter(kind),
			nativeUpstream: requiredNativeUpstream(kind),
			readiness: { status: readiness.status, detail: readiness.detail },
			requirements,
		};
	});

	return (
		<AgentsPanel
			machineId={machine.id}
			machineName={machine.name}
			activeAgentKind={machine.agentKind}
			model={machine.model}
			agents={agents}
			cursorHasKey={Boolean(config.cursorApiKey)}
			machines={toPublicConfig(config).machines}
		/>
	);
}

import { redirect } from "next/navigation";

import { OverviewClient } from "@/components/dashboard/OverviewClient";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";
import { getUserConfig } from "@/lib/user-config/clerk";
import { activeMachine } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
	// First-time visitors land in the focused onboarding flow before
	// they ever see the busy dashboard. After provisioning, they're
	// redirected back here for the live machine view.
	let needsOnboarding = false;
	let activeMachineId: string | null = null;
	let agentKind: import("@/lib/user-config/schema").AgentKind = "hermes";
	let model: string | null = null;
	let cronCount = 0;
	try {
		const config = await getUserConfig();
		needsOnboarding = !config.machines.some((m) => !m.archived);
		activeMachineId = config.activeMachineId;
		cronCount = (config.crons ?? []).length;
		const active = activeMachine(config);
		if (active) {
			agentKind = active.agentKind;
			model = active.model ?? null;
		} else {
			agentKind = config.draftAgentKind;
			model = config.draftModel ?? null;
		}
	} catch {
		// Auth / config probe failed -- the layout will surface the right
		// error; render the degraded overview below.
	}
	if (needsOnboarding) redirect("/onboarding");

	const skills = listSkills();
	const mcps = listMcpServers();
	const tools = mcps.reduce((acc, server) => acc + server.tools.length, 0);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="OVERVIEW"
				title="Activity"
				description="Machine wake time, agent work, and service touchpoints — filterable by time range, agent, and service."
			/>
			<OverviewClient
				counts={{
					skills: skills.length,
					mcps: mcps.length,
					tools,
					crons: cronCount,
				}}
				agentKind={agentKind}
				model={model}
				activeMachineId={activeMachineId}
			/>
		</div>
	);
}

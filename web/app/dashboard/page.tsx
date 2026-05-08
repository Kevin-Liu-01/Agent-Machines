import { redirect } from "next/navigation";

import { OverviewClient } from "@/components/dashboard/OverviewClient";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { listCrons } from "@/lib/dashboard/crons";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	activeMachine,
	type AgentKind,
} from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
	// First-time visitors land in the focused onboarding flow before
	// they ever see the busy dashboard. After provisioning, they're
	// redirected back here for the live machine view.
	let needsOnboarding = false;
	let agentKind: AgentKind = "hermes";
	let model: string | null = null;
	try {
		const config = await getUserConfig();
		needsOnboarding = !config.machines.some((m) => !m.archived);
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
	const crons = listCrons();
	const tools = mcps.reduce((acc, server) => acc + server.tools.length, 0);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="OVERVIEW"
				title="Live agent state"
				description="Machine health, gateway probe, and a tour of what the agent has on disk. Counters are baked at build time. Machine and gateway poll every 5s."
			/>
			<OverviewClient
				counts={{
					skills: skills.length,
					mcps: mcps.length,
					tools,
					crons: crons.length,
				}}
				agentKind={agentKind}
				model={model}
			/>
		</div>
	);
}

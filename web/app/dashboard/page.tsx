import { OverviewClient } from "@/components/dashboard/OverviewClient";
import { CapabilityMap } from "@/components/dashboard/CapabilityMap";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WorkerLaunchpad } from "@/components/dashboard/WorkerLaunchpad";
import { WorkerSystemMap } from "@/components/dashboard/WorkerSystemMap";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";
import { getUserConfigForRequest } from "@/lib/user-config/clerk";
import { activeMachine } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
	// The dashboard is action-first even for an empty account: credentials are
	// gated inline and the first Worker can be launched without a detour through
	// the legacy multi-page setup wizard.
	let activeMachineId: string | null = null;
	let agentKind: import("@/lib/user-config/schema").AgentKind = "hermes";
	let model: string | null = null;
	let cronCount = 0;
	let hasMachines = false;
	try {
		const config = await getUserConfigForRequest();
		activeMachineId = config.activeMachineId;
		cronCount = (config.crons ?? []).length;
		hasMachines = config.machines.some((machine) => !machine.archived);
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
	const skills = listSkills();
	const mcps = listMcpServers();
	const tools = mcps.reduce((acc, server) => acc + server.tools.length, 0);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="WORKER SYSTEM"
				title="Your durable digital workforce"
				description="Take a useful Worker off the shelf or assemble one from modular primitives. Keep its identity, responsibility, memory, files, schedules, and evidence while the runtime, model, and sandbox change underneath it."
			/>
			<DashboardPageBody>
				<WorkerSystemMap />
				<WorkerLaunchpad />
				<CapabilityMap hasMachine={hasMachines} />
			</DashboardPageBody>
			{hasMachines ? (
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
			) : null}
		</div>
	);
}

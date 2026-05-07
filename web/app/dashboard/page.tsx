import { OverviewClient } from "@/components/dashboard/OverviewClient";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { listCrons } from "@/lib/dashboard/crons";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
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
			/>
		</div>
	);
}

import { LoadoutPanel } from "@/components/dashboard/LoadoutPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getUserConfig } from "@/lib/user-config/clerk";
import { listMcpServers } from "@/lib/dashboard/mcps";
import { listSkills } from "@/lib/dashboard/skills";
import {
	BUILTIN_TOOLS,
	SERVICES,
	TASKS,
	buildTrustedAddOnCatalog,
	computeCounts,
} from "@/lib/dashboard/loadout";

export const dynamic = "force-dynamic";

export default async function MachineLoadoutPage() {
	const config = await getUserConfig();
	const skills = listSkills();
	const mcps = listMcpServers();
	const catalog = buildTrustedAddOnCatalog({
		skills,
		mcps,
		builtins: BUILTIN_TOOLS,
		services: SERVICES,
		tasks: TASKS,
	});
	const mcpToolCount = mcps.reduce((sum, m) => sum + m.tools.length, 0);
	const counts = computeCounts({
		skills: skills.length,
		mcpServers: mcps.length,
		mcpTools: mcpToolCount,
		trustedAddOns: catalog.length,
	});
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="LOADOUT"
				title="This machine's loadout"
				description="Everything callable from the chat surface on this machine."
			/>
			<LoadoutPanel
				counts={counts}
				skills={skills}
				mcps={mcps}
				builtins={[...BUILTIN_TOOLS]}
				services={[...SERVICES]}
				tasks={[...TASKS]}
				catalog={catalog}
				customLoadout={config.customLoadout}
				loadoutSources={config.loadoutSources}
				loadoutPresets={config.loadoutPresets}
				activeLoadoutPresetId={config.activeLoadoutPresetId}
			/>
		</div>
	);
}

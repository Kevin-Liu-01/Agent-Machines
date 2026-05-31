import { PageHeader } from "@/components/dashboard/PageHeader";
import { RegistryBrowser } from "@/components/dashboard/RegistryBrowser";
import { getUserConfig } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

export default async function RegistryPage() {
	const config = await getUserConfig();
	const installedIds = config.customLoadout.map((entry) => entry.id);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="REGISTRY"
				title="Browse and install tools, skills, MCPs, and CLIs"
				description="The installable catalog — search skills.sh, the MCP server registry, npm, Cursor plugins, GitHub repos, and URL manifests, then Add to a machine. Distinct from Loadout, which shows the stack already active on a given machine."
			/>
			<RegistryBrowser installedIds={installedIds} />
		</div>
	);
}

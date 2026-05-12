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
				description="Search across skills.sh, the MCP server registry, npm, Cursor plugins, GitHub repos, and URL manifests. Click Add to install onto your machine and add to your loadout."
			/>
			<RegistryBrowser installedIds={installedIds} />
		</div>
	);
}

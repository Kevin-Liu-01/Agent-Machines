import { PageHeader } from "@/components/dashboard/PageHeader";
import { RegistryBrowser } from "@/components/dashboard/RegistryBrowser";
import { getUserConfigForRequest } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

export default async function RegistryPage() {
	const config = await getUserConfigForRequest();
	// Library membership is not evidence that an item is installed on a Worker.
	const installedIds = config.customLoadout.map((entry) => entry.id);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="REGISTRY"
				title="Build your Worker’s library"
				description="Discover skills, MCPs, CLIs, and tools. Save an item first, then review its command and choose a Worker to install it. MCP servers and plugins may need credentials and runtime-specific setup; saving is not verification."
			/>
			<RegistryBrowser installedIds={installedIds} machines={config.machines.filter((machine) => !machine.archived).map(({ id, name }) => ({ id, name }))} activeMachineId={config.activeMachineId} />
		</div>
	);
}

import { PageHeader } from "@/components/dashboard/PageHeader";
import { SandboxRouterPanel } from "@/components/dashboard/SandboxRouterPanel";
import { SetupWizard } from "@/components/dashboard/SetupWizard";
import { resolveRoute } from "@/lib/mux/route";
import {
	getUserConfigForRequest,
} from "@/lib/user-config/clerk";
import { toPublicConfig } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
	const config = await getUserConfigForRequest();
	const { route, skipped } = resolveRoute(config);
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="SETUP"
				title="Set up your Worker"
				description="Connect your sandbox and model accounts, choose an agent, and launch a persistent workspace. Your credentials stay private."
			/>
			<div className="px-5 pb-6 md:px-7">
				<SandboxRouterPanel route={route} skipped={skipped} />
			</div>
			<SetupWizard
				initialConfig={toPublicConfig(config)}
				defaults={{
					machineSpec: config.draftSpec,
					model: config.draftModel,
					hasOwnerDaytonaKey: Boolean(config.providers.daytona?.apiKey),
					hasOwnerCursorKey: Boolean(config.cursorApiKey),
					hasOwnerMachine: config.machines.length > 0,
				}}
			/>
		</div>
	);
}

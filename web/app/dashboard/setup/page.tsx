import { PageHeader } from "@/components/dashboard/PageHeader";
import { SandboxRouterPanel } from "@/components/dashboard/SandboxRouterPanel";
import { SetupWizard } from "@/components/dashboard/SetupWizard";
import { resolveRoute } from "@/lib/mux/route";
import { getOwnerDefaults, getUserConfig } from "@/lib/user-config/clerk";
import { toPublicConfig } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
	const config = await getUserConfig();
	const defaults = getOwnerDefaults();
	const { route, skipped } = resolveRoute(config);
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="SETUP"
				title="Provision a persistent agent"
				description="Bring a provider key, pick Hermes or OpenClaw, size the environment, and provision. Both agents can be bootstrapped from the UI into a durable machine profile; secrets persist in Clerk private metadata. Claude Code and Codex CLI are also available as task-driven agents."
			/>
			<div className="px-5 pb-6 md:px-7">
				<SandboxRouterPanel route={route} skipped={skipped} />
			</div>
			<SetupWizard
				initialConfig={toPublicConfig(config)}
				defaults={{
					machineSpec: defaults.draftSpec,
					model: defaults.draftModel,
					hasOwnerDedalusKey: Boolean(defaults.providers.dedalus?.apiKey),
					hasOwnerCursorKey: Boolean(defaults.cursorApiKey),
					hasOwnerMachine: defaults.machines.length > 0,
				}}
			/>
		</div>
	);
}

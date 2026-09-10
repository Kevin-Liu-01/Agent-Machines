import { PageHeader } from "@/components/dashboard/PageHeader";
import { SandboxRouterPanel } from "@/components/dashboard/SandboxRouterPanel";
import { SetupWizard } from "@/components/dashboard/SetupWizard";
import { cn } from "@/lib/cn";
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
		<div className={cn("flex min-w-0 flex-col")}>
			<PageHeader
				kicker="Setup"
				title="Set up your Worker"
				description="Connect your accounts, choose an agent, and launch a persistent workspace."
			/>
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
			<section aria-labelledby="setup-routing-heading" className={cn("space-y-3 px-5 pb-7 pt-2 md:px-7")}>
				<h2 id="setup-routing-heading" className={cn("text-lg font-semibold text-[var(--ret-text)]")}>Routing preferences</h2>
				<SandboxRouterPanel route={route} skipped={skipped} />
			</section>
		</div>
	);
}

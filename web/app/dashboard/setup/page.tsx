import { PageHeader } from "@/components/dashboard/PageHeader";
import { SandboxRouterPanel } from "@/components/dashboard/SandboxRouterPanel";
import { SetupWizard } from "@/components/dashboard/SetupWizard";
import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { listPresets } from "@/lib/dashboard/presets";
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
				title="Quickstart"
			/>
			<DashboardPageBody>
				<OnboardingFlow embedded initialConfig={toPublicConfig(config)} presets={listPresets()} />
				<details className={cn("max-w-[1040px] rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]")}>
					<summary className={cn("cursor-pointer px-6 py-5 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>Advanced setup and routing</summary>
					<p className={cn("border-t border-[var(--ret-border)] px-6 pt-5 text-sm leading-6 text-[var(--ret-text-muted)]")}>Continue the saved step-by-step configuration to set requested resources and account defaults. These steps save as you go; creating compute remains a separate action.</p>
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
					<section aria-labelledby="setup-routing-heading" className={cn("space-y-3 px-6 pb-6 pt-2")}>
						<h2 id="setup-routing-heading" className={cn("text-lg font-semibold text-[var(--ret-text)]")}>Routing preferences</h2>
						<SandboxRouterPanel route={route} skipped={skipped} />
					</section>
				</details>
			</DashboardPageBody>
		</div>
	);
}

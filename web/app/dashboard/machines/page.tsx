import { Suspense } from "react";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";

import { MachinesPanel } from "@/components/dashboard/MachinesPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReticleButton } from "@/components/reticle/ReticleButton";

export const dynamic = "force-dynamic";

/**
 * Fleet home. Stats + the "machines created" chart moved to the Overview;
 * here we keep one-click deploy, the machine list (cards or compact table),
 * and a single fleet activity monitor.
 */
export default function MachinesPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="Workspaces"
				title="Workspaces"
				description="Find a workspace, open its terminal, or manage its runtime and compute."
				right={
					<>
						<ReticleButton as="a" href="/dashboard/agents" variant="ghost" size="sm">
							Saved setups
						</ReticleButton>
					</>
				}
			/>
			<Suspense fallback={<DashboardPageBody><DashboardLoadingState label="Loading your machines…" /></DashboardPageBody>}>
				<MachinesPanel />
			</Suspense>
		</div>
	);
}

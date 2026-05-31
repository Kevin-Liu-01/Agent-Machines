import { Suspense } from "react";

import { ActivityOverviewPanel } from "@/components/dashboard/ActivityOverviewPanel";
import { DeployAndTalk } from "@/components/dashboard/DeployAndTalk";
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
				kicker="FLEET"
				title="Your machines"
				description="Deploy, browse, and open machines. Switch between cards and a compact table; fleet stats and trends live on the Overview."
				right={
					<ReticleButton
						as="a"
						href="/dashboard/setup"
						variant="primary"
						size="sm"
					>
						New machine
					</ReticleButton>
				}
			/>
			<div className="px-5 pt-5">
				<DeployAndTalk />
			</div>
			<Suspense fallback={null}>
				<MachinesPanel />
			</Suspense>
			<div className="px-5 pb-6">
				<ActivityOverviewPanel />
			</div>
		</div>
	);
}

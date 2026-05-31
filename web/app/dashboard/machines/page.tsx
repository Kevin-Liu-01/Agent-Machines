import { Suspense } from "react";

import { DeployAndTalk } from "@/components/dashboard/DeployAndTalk";
import { FleetAnalytics } from "@/components/dashboard/FleetAnalytics";
import { MachinesPanel } from "@/components/dashboard/MachinesPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReticleButton } from "@/components/reticle/ReticleButton";

export const dynamic = "force-dynamic";

export default function MachinesPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="FLEET"
				title="Your machines"
				description="Every machine on the account: live state, resource trends, and one-click deploy. Open a machine to drill into its console, terminal, logs, and loadout."
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
			<div className="flex flex-col gap-5 px-5 pt-5">
				<FleetAnalytics />
				<DeployAndTalk />
			</div>
			<Suspense fallback={null}>
				<MachinesPanel />
			</Suspense>
		</div>
	);
}

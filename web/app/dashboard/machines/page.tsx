import { Suspense } from "react";

import { DeployAndTalk } from "@/components/dashboard/DeployAndTalk";
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
				description="Live fleet activity across every machine. Click Chat to interact in split view, or Open to drill into terminal, logs, and loadout."
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
		</div>
	);
}

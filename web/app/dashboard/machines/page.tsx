import { Suspense } from "react";

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
				artSlug="machines"
				kicker="FLEET"
				title="Your machines"
				description="See health, runtime, provider, loadout, activity, and migration state at a glance. Every machine action stays scoped to the worker you selected."
				right={
					<>
						<ReticleButton as="a" href="/dashboard/agents" variant="ghost" size="sm">
							Agent templates
						</ReticleButton>
						<ReticleButton as="a" href="/dashboard/setup" variant="primary" size="sm">
							New machine
						</ReticleButton>
					</>
				}
			/>
			<Suspense fallback={null}>
				<MachinesPanel />
			</Suspense>
		</div>
	);
}

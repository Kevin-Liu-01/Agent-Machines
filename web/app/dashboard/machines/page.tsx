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
				description="Every machine tied to your account, across providers. Click a machine to open its dedicated dashboard with live data, chat, terminal, and loadout."
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
			<MachinesPanel />
		</div>
	);
}

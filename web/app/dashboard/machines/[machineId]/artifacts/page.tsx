import { ArtifactsPanel } from "@/components/dashboard/ArtifactsPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function MachineArtifactsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="ARTIFACTS"
				title="Persistent files"
				description="Artifacts and outputs from this machine."
			/>
			<ArtifactsPanel />
		</div>
	);
}

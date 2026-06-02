import { WorkersLibrary } from "@/components/dashboard/WorkersLibrary";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { listPresets } from "@/lib/dashboard/presets";

export const dynamic = "force-dynamic";

export default function WorkersPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="WORKERS"
				title="Workers"
				description="Deployable presets — a runtime, a model/router, and a Memory (persona + abilities). Start from a curated preset or an existing Memory, then deploy onto any machine."
			/>
			<DashboardPageBody>
				<WorkersLibrary presets={listPresets()} />
			</DashboardPageBody>
		</div>
	);
}

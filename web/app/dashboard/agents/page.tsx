import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WorkersLibrary } from "@/components/dashboard/WorkersLibrary";
import { listPresets } from "@/lib/dashboard/presets";

export const dynamic = "force-dynamic";

export default function AgentsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="WORKER LIBRARY"
				title="Take a Worker off the shelf"
				description="Choose the job first. Each specialist starts with a role, memory, skills, connectors, and runtime; its durable identity survives whichever sandbox runs it."
			/>
			<DashboardPageBody>
				<WorkersLibrary presets={listPresets()} />
			</DashboardPageBody>
		</div>
	);
}

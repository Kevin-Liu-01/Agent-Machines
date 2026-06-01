import { WorkersLibrary } from "@/components/dashboard/WorkersLibrary";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function WorkersPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="WORKERS"
				title="Workers"
				description="Reusable agent templates — a runtime, a model/router, and an owned-memory bundle. Create one, then deploy it onto any machine."
			/>
			<DashboardPageBody>
				<WorkersLibrary />
			</DashboardPageBody>
		</div>
	);
}

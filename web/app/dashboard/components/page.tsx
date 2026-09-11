import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { HarnessComponentGrid } from "@/components/marketing/HarnessComponents";
import { cn } from "@/lib/cn";

export default function ComponentsPage() {
	return (
		<div className={cn("flex min-w-0 flex-col")}>
			<PageHeader
				kicker="Building blocks"
				title="Understand the parts. Configure your setup."
				description="Explore the building blocks, then open their settings or source."
			/>
			<DashboardPageBody>
				<HarnessComponentGrid dashboard />
			</DashboardPageBody>
		</div>
	);
}

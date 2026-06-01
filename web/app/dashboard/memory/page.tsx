import { MemoryLibrary } from "@/components/dashboard/MemoryLibrary";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function MemoryPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="MEMORY"
				title="Owned memory"
				description="Portable bundles of persona, rules, agent docs, and abilities. Install one into any agent, export it as a pastable prompt, or import your existing setup. Workers reference a bundle."
			/>
			<DashboardPageBody>
				<MemoryLibrary />
			</DashboardPageBody>
		</div>
	);
}

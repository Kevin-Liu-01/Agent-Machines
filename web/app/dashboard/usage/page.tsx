import { UsagePanel } from "@/components/dashboard/UsagePanel";
import { BenchmarksClient } from "@/components/dashboard/benchmarks/BenchmarksClient";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WorkspaceTabs, INSIGHT_TABS } from "@/components/dashboard/WorkspaceTabs";

export const dynamic = "force-dynamic";

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
	const { tab } = await searchParams;
	if (tab !== "benchmarks") return <UsagePanel />;
	return <div>
		<PageHeader kicker="Insights" title="Insights" description="Compare compute, inspect the evidence, and choose where to run." />
		<WorkspaceTabs label="Insights sections" active="benchmarks" items={INSIGHT_TABS} />
		<BenchmarksClient embedded />
	</div>;
}

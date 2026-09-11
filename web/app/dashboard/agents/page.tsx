import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WorkersLibrary } from "@/components/dashboard/WorkersLibrary";
import { listPresets } from "@/lib/dashboard/presets";
import { selectedPreset } from "@/lib/onboarding/preset-selection";
import { MemoryLibrary } from "@/components/dashboard/MemoryLibrary";
import { StudioBlueprint } from "@/components/dashboard/StudioBlueprint";
import { WorkspaceTabs, STUDIO_TABS } from "@/components/dashboard/WorkspaceTabs";

export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const presets = listPresets();
	const params = await searchParams;
	const preset = selectedPreset(presets, params.preset);
	const tab = params.tab === "memory" && !preset ? "memory" : "setups";
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="Studio"
				title="Studio"
				description="Shape the agent. Keep its knowledge. Launch when you’re ready."
			/>
			<WorkspaceTabs label="Studio sections" active={tab} items={STUDIO_TABS} />
			<DashboardPageBody>
				{tab === "memory" ? <MemoryLibrary /> : <><StudioBlueprint /><div id="agent-setups" className="scroll-mt-20"><WorkersLibrary key={preset?.id ?? "catalog"} presets={presets} initialPresetId={preset?.id} /></div></>}
			</DashboardPageBody>
		</div>
	);
}

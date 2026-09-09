import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WorkersLibrary } from "@/components/dashboard/WorkersLibrary";
import { listPresets } from "@/lib/dashboard/presets";
import { selectedPreset } from "@/lib/onboarding/preset-selection";

export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const presets = listPresets();
	const preset = selectedPreset(presets, (await searchParams).preset);
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="WORKER LIBRARY"
				title="Take a Worker off the shelf"
				description="Choose the job first. Each specialist starts with a role, memory, skills, connectors, and runtime; its durable identity survives whichever sandbox runs it."
			/>
			<DashboardPageBody>
				<WorkersLibrary key={preset?.id ?? "catalog"} presets={presets} initialPresetId={preset?.id} />
			</DashboardPageBody>
		</div>
	);
}

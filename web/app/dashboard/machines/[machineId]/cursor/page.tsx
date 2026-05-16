import { CursorRunsList } from "@/components/dashboard/CursorRunsList";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function MachineCursorRunsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="CURSOR -- ~/.agent-machines/cursor-runs.jsonl"
				title="Code delegations"
				description="Cursor agent delegations from this machine."
			/>
			<CursorRunsList />
		</div>
	);
}

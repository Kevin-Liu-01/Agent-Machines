import { CursorRunsList } from "@/components/dashboard/CursorRunsList";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function CursorRunsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="CURSOR -- ~/.hermes/cursor-runs.jsonl"
				title="Code delegations"
				description="Every time Hermes hands code work off to a Cursor agent, the cursor-bridge MCP server appends a record here. Click a row to inspect the run -- prompt, loaded skills, working directory, final text, and status."
			/>
			<CursorRunsList />
		</div>
	);
}

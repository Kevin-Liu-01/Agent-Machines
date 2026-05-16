import { PageHeader } from "@/components/dashboard/PageHeader";
import { SessionsList } from "@/components/dashboard/SessionsList";

export const dynamic = "force-dynamic";

export default function MachineSessionsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="SESSIONS -- ~/.agent-machines/sessions/"
				title="Conversation history"
				description="Sessions on this machine, polled every 30 seconds."
			/>
			<SessionsList />
		</div>
	);
}

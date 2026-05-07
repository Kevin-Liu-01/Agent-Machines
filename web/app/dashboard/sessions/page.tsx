import { PageHeader } from "@/components/dashboard/PageHeader";
import { SessionsList } from "@/components/dashboard/SessionsList";

export const dynamic = "force-dynamic";

export default function SessionsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="SESSIONS -- ~/.hermes/sessions/"
				title="Conversation history"
				description="Hermes stores one SQLite DB per session. The dashboard polls the live machine every 30s and lists every conversation it's holding. Transcript drill-in is a follow-up; this view tells you what's there and how heavy each one is."
			/>
			<SessionsList />
		</div>
	);
}

import { Chat } from "@/components/Chat";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function DashboardChatPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="LIVE -- /v1/chat/completions"
				title="Chat"
				description="Streams from the OpenAI-compatible gateway on the deployed machine. Tools fire on the VM. Memory persists across sessions, scoped to the machine -- not your browser."
			/>
			<div className="px-6 py-6">
				<Chat />
			</div>
		</div>
	);
}

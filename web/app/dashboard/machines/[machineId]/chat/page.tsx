import { ChatShell } from "@/components/dashboard/ChatShell";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getUserConfig } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

type Props = {
	params: Promise<{ machineId: string }>;
};

export default async function MachineChatPage({ params }: Props) {
	const { machineId } = await params;
	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === machineId);
	const agentLabel = machine?.agentKind === "openclaw" ? "openclaw" : "hermes";

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`CHAT -- ${agentLabel} gateway`}
				title="Chat"
				description="Streams from the resolved gateway profile for this machine."
			/>
			<ChatShell
				activeMachineId={machineId}
				model={machine?.model ?? null}
			/>
		</div>
	);
}

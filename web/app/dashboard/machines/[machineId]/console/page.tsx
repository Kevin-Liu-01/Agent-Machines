import { AgentConsole } from "@/components/agent-console/AgentConsole";
import { getUserConfigForRequest } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

type Props = {
	params: Promise<{ machineId: string }>;
};

export default async function MachineConsolePage({ params }: Props) {
	const { machineId } = await params;
	const config = await getUserConfigForRequest();
	const machine = config.machines.find((m) => m.id === machineId);

	return (
		<AgentConsole
			activeMachineId={machineId}
			model={machine?.model ?? null}
			agentKind={machine?.agentKind ?? null}
		/>
	);
}

import { AgentConsole } from "@/components/agent-console/AgentConsole";
import { notFound } from "next/navigation";
import { buildPool } from "@/lib/dashboard/pool";
import { resolveAbilities } from "@/lib/memory/abilities";
import { defaultMemoryBundle, resolveBundle } from "@/lib/memory/bundle";
import { resolveMachineWorker } from "@/lib/workers/resolve";
import { getUserConfigForRequest } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

type Props = {
	params: Promise<{ machineId: string }>;
};

export default async function MachineConsolePage({ params }: Props) {
	const { machineId } = await params;
	const config = await getUserConfigForRequest();
	const machine = config.machines.find((m) => m.id === machineId);
	if (!machine || machine.archived) notFound();
	const worker = resolveMachineWorker(config, machine);
	const memory = resolveBundle(config, worker.memoryBundleId) ?? defaultMemoryBundle();
	const abilities = resolveAbilities(memory, buildPool(config));
	const loadoutItems = [
		...abilities.skills.map((item) => ({ ...item, kind: "skill" as const })),
		...abilities.mcps.map((item) => ({ ...item, kind: "mcp" as const })),
		...abilities.tools.map((item) => ({ ...item, kind: "tool" as const })),
	];

	return (
		<AgentConsole
			key={machineId}
			activeMachineId={machineId}
			model={machine?.model ?? null}
			agentKind={machine?.agentKind ?? null}
			loadoutItems={loadoutItems}
		/>
	);
}

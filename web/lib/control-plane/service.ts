import { AgentMachinesControlPlane } from "agent-machines/control-plane";

import { HostedWorkerRuntimeDriver } from "./hosted-driver";
import { createHostedControlPlaneStore } from "./store";
import type { UserConfig } from "@/lib/user-config/schema";

export function createHostedControlPlane(
	userId: string,
	initialConfig: UserConfig | null = null,
): AgentMachinesControlPlane {
	return new AgentMachinesControlPlane(
		createHostedControlPlaneStore(userId),
		new HostedWorkerRuntimeDriver(userId, initialConfig),
		{
			// Reconciliation renews this lease while it is alive. If a serverless
			// invocation disappears, the scheduler can reclaim it after two minutes;
			// the fenced token prevents the dead owner from committing afterward.
			leaseMs: 2 * 60_000,
		},
	);
}

/** Shared demo types — safe for client and server imports. */

export type DemoLiveState = {
	state: string;
	rawPhase: string;
	lastError: string | null;
};

export type DemoFleetSnapshot = {
	extraMachines: import("@/lib/user-config/schema").MachineRef[];
	activeMachineId: string | null;
	live: Record<
		string,
		DemoLiveState & {
			provisionedAt?: number;
		}
	>;
};

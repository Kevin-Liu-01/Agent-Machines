import type { AgentKind } from "@/lib/user-config/schema";

export type RuntimeCapacity = {
	status: "blocked" | "unverified" | "not-blocked" | "not-applicable";
	memoryMib: number | null;
	message?: string;
};

/** Admission evidence, not a guarantee that an arbitrary workload will fit.
 * OpenClaw's first exec tool OOM-killed the process on a real 512 MiB E2B
 * allocation (2026-09-09), including isolated no-model-billing reproductions.
 * Never substitute the user's requested RAM for the provider's observation. */
export function runtimeCapacity(agent: AgentKind, observedMemoryMib: unknown): RuntimeCapacity {
	if (agent !== "openclaw") return { status: "not-applicable", memoryMib: null };
	if (typeof observedMemoryMib !== "number" || !Number.isFinite(observedMemoryMib) || observedMemoryMib <= 0) {
		return { status: "unverified", memoryMib: null, message: "The provider has not reported this Worker's RAM; OpenClaw capacity is unverified." };
	}
	if (observedMemoryMib <= 512) {
		return {
			status: "blocked", memoryMib: observedMemoryMib,
			message: `This Worker reports ${observedMemoryMib} MiB of RAM. OpenClaw tool execution ran out of memory on 512 MiB in live testing. Choose a larger allocation (for E2B, a larger-memory template) before running OpenClaw. Reinstalling the runtime or changing requested RAM does not resize this machine.`,
		};
	}
	return { status: "not-blocked", memoryMib: observedMemoryMib };
}

export class RuntimeCapacityError extends Error {
	readonly code = "insufficient_runtime_memory";
	constructor(readonly capacity: RuntimeCapacity) {
		super(capacity.message ?? "The allocation has insufficient memory for this runtime.");
		this.name = "RuntimeCapacityError";
	}
}

export function assertRuntimeCapacity(agent: AgentKind, observedMemoryMib: unknown): RuntimeCapacity {
	const capacity = runtimeCapacity(agent, observedMemoryMib);
	if (capacity.status === "blocked") throw new RuntimeCapacityError(capacity);
	return capacity;
}

/**
 * Provider-aware paths for persistent machine storage.
 */

import type { MachineRef, ProviderKind } from "@/lib/user-config/schema";

export function homeFor(providerKind: ProviderKind): string {
	if (providerKind === "e2b") return "/home/user";
	if (providerKind === "sprites") return "/home/sprite";
	if (providerKind === "vercel") return "/vercel/sandbox";
	return "/home/machine";
}

export function appDataRootFor(providerKind: ProviderKind): string {
	return `${homeFor(providerKind)}/.agent-machines`;
}

/** Dedalus default — prefer `storageContextFor(machine)` for scoped ops. */
export const APP_DATA_ROOT = appDataRootFor("dedalus");

export type MachineStorageContext = {
	machineId: string;
	appDataRoot: string;
};

export function storageContextFor(
	machine: Pick<MachineRef, "id" | "providerKind">,
): MachineStorageContext {
	return {
		machineId: machine.id,
		appDataRoot: appDataRootFor(machine.providerKind),
	};
}

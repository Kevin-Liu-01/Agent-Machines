"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { PublicMachineRef } from "@/lib/user-config/schema";

type MachineContextValue = {
	machineId: string;
	machine: PublicMachineRef | null;
};

const MachineContext = createContext<MachineContextValue | null>(null);

export function MachineProvider({
	machineId,
	machine,
	children,
}: MachineContextValue & { children: ReactNode }) {
	return (
		<MachineContext.Provider value={{ machineId, machine }}>
			{children}
		</MachineContext.Provider>
	);
}

export function useMachineContext(): MachineContextValue {
	const ctx = useContext(MachineContext);
	if (!ctx) {
		throw new Error("useMachineContext must be used within a MachineProvider");
	}
	return ctx;
}

export function useOptionalMachineContext(): MachineContextValue | null {
	return useContext(MachineContext);
}

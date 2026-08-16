"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { PublicUserConfig } from "@/lib/user-config/schema";

const DashboardConfigContext = createContext<PublicUserConfig | null>(null);

export function DashboardConfigProvider({
	children,
	config,
}: {
	children: ReactNode;
	config: PublicUserConfig;
}) {
	return (
		<DashboardConfigContext.Provider value={config}>
			{children}
		</DashboardConfigContext.Provider>
	);
}

export function useDashboardConfig(): PublicUserConfig | null {
	return useContext(DashboardConfigContext);
}

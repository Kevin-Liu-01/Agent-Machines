import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { PublicUserConfig } from "@/lib/user-config/schema";

import { DashboardConfigProvider } from "./DashboardConfigProvider";
import { DashboardChrome } from "./DashboardChrome";
import { DashboardReticleProvider } from "./DashboardReticleProvider";

type Props = {
	children: ReactNode;
	config: PublicUserConfig;
};

export function DashboardShell({ children, config }: Props) {
	const setupComplete = config.machines.some((m) => !m.archived);

	return (
		<DashboardConfigProvider config={config}>
			<DashboardReticleProvider>
				<a
					href="#dashboard-content"
					className={cn("sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:bg-[var(--ret-bg)] focus:px-4 focus:py-3 focus:text-sm focus:text-[var(--ret-text)] focus:[clip:auto] focus:outline-2 focus:outline-[var(--ret-text)]")}
				>
					Skip to content
				</a>
				<DashboardChrome machines={config.machines} setupComplete={setupComplete}>{children}</DashboardChrome>
			</DashboardReticleProvider>
		</DashboardConfigProvider>
	);
}

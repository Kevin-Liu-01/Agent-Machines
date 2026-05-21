import type { ReactNode } from "react";

import { BrandHomeLockup } from "@/components/BrandHomeLockup";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { DASHBOARD_SHELL_HEADER_ROW } from "@/lib/dashboard/shell-chrome";
import { cn } from "@/lib/cn";
import type { PublicUserConfig } from "@/lib/user-config/schema";

import { DashboardReticleProvider } from "./DashboardReticleProvider";
import { SidebarNav } from "./SidebarNav";
import { StatusHeader } from "./StatusHeader";

type Props = {
	children: ReactNode;
	config: PublicUserConfig;
};

export function DashboardShell({ children, config }: Props) {
	const active = config.machines.find((m) => m.id === config.activeMachineId);
	const agentKind = active?.agentKind ?? config.draftAgentKind;
	const setupComplete = config.machines.some((m) => !m.archived);

	return (
		<DashboardReticleProvider>
		<div className="relative grid min-h-[100dvh] bg-[var(--ret-bg-soft)] lg:grid-cols-[220px_1fr]">
			<aside className="sticky top-0 z-10 hidden h-[100dvh] self-start border-r border-[var(--ret-border)] bg-[var(--ret-bg)] lg:flex lg:flex-col">
				<div
					className={cn(
						DASHBOARD_SHELL_HEADER_ROW,
						"bg-[var(--ret-bg)] px-3",
					)}
				>
					<BrandHomeLockup density="sidebar" className="w-full" />
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<SidebarNav setupComplete={setupComplete} machines={config.machines} />
				</div>
				<div className="mt-auto border-t border-[var(--ret-border)]">
					<ReticleHatch className="h-24" pitch={6} />
				</div>
			</aside>
			<div className="relative z-10 flex min-h-[100dvh] min-w-0 flex-col bg-[var(--ret-bg)]">
				<StatusHeader agentKind={agentKind} activeMachineId={active?.id} machines={config.machines} />
				<main className="flex-1">{children}</main>
			</div>
		</div>
		</DashboardReticleProvider>
	);
}

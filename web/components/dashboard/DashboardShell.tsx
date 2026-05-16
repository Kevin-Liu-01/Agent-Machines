import type { ReactNode } from "react";

import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import type { PublicUserConfig } from "@/lib/user-config/schema";

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
		<div className="relative grid min-h-[100dvh] bg-[var(--ret-bg-soft)] lg:grid-cols-[220px_1fr]">
			<aside className="relative z-10 hidden border-r border-[var(--ret-border)] bg-[var(--ret-bg)] lg:flex lg:flex-col">
				<SidebarNav setupComplete={setupComplete} machines={config.machines} />
				<div className="mt-auto border-t border-[var(--ret-border)]">
					<ReticleHatch className="h-24" pitch={6} />
				</div>
			</aside>
			<div className="relative z-10 flex min-h-[100dvh] min-w-0 flex-col bg-[var(--ret-bg)]">
				<StatusHeader agentKind={agentKind} activeMachineId={active?.id} machines={config.machines} />
				<main className="flex-1">{children}</main>
			</div>
		</div>
	);
}

import type { ReactNode } from "react";

import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { WingBackground } from "@/components/WingBackground";
import type { PublicUserConfig } from "@/lib/user-config/schema";

import { SidebarNav } from "./SidebarNav";
import { StatusHeader } from "./StatusHeader";

type Props = {
	children: ReactNode;
	config: PublicUserConfig;
};

/**
 * Persistent dashboard frame. The sidebar collapses below the lg breakpoint
 * (we hide it; the marketing landing is the small-screen entry point). The
 * status header sticks to the top and stays visible over scrolled content.
 *
 * Receives the caller's `PublicUserConfig` from the server-side layout.
 * SidebarNav uses it to decorate the Setup row with a "needs attention"
 * dot until the user provisions a machine; StatusHeader uses it to
 * render the agent switcher with the current agent.
 *
 * The active machine determines the rendered agent variant in the
 * status header. If no active machine, defaults to Hermes.
 */
export function DashboardShell({ children, config }: Props) {
	const active = config.machines.find((m) => m.id === config.activeMachineId);
	const agentKind = active?.agentKind ?? config.draftAgentKind;
	const setupComplete = config.machines.some((m) => !m.archived);
	return (
		<div className="relative grid min-h-[100dvh] bg-[var(--ret-bg-soft)] lg:grid-cols-[220px_1fr]">
			{/*
			  Brand backdrop covering the entire dashboard shell. Sits
			  at z-0 + pointer-events-none; the sidebar and main column
			  overlay it via their solid --ret-bg backgrounds, so the
			  texture only paints in the hairline gap between the
			  sidebar and content + softly under the blurred sticky
			  header. Cloud variant in light mode, nyx-lines in dark.
			*/}
			<WingBackground variant="cloud" />
			<aside className="relative z-10 hidden border-r border-[var(--ret-border)] bg-[var(--ret-bg)] lg:flex lg:flex-col">
				<SidebarNav setupComplete={setupComplete} />
				<div className="mt-auto border-t border-[var(--ret-border)]">
					<ReticleHatch className="h-24" pitch={6} />
				</div>
			</aside>
			<div className="relative z-10 flex min-h-[100dvh] min-w-0 flex-col bg-[var(--ret-bg)]">
				<StatusHeader agentKind={agentKind} />
				<main className="flex-1">{children}</main>
			</div>
		</div>
	);
}

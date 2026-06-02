"use client";

import { ChatShell } from "@/components/dashboard/ChatShell";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { AGENT_LABEL, type AgentKind } from "@/lib/user-config/schema";

type Props = {
	machineId: string;
	name: string;
	agentKind: AgentKind;
	model: string;
	onClose: () => void;
};

/**
 * Right-hand split pane on /dashboard/machines?focus=<id>.
 * Embeds ChatShell for the focused machine without leaving the fleet view.
 */
export function FleetInteractPane({
	machineId,
	name,
	agentKind,
	model,
	onClose,
}: Props) {
	return (
		<ReticleFrame className="flex min-h-0 flex-col overflow-hidden lg:sticky lg:top-[var(--dashboard-header-h,3.5rem)] lg:max-h-[calc(100dvh-var(--dashboard-header-h,3.5rem)-2rem)]">
			<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="min-w-0">
					<p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						Interact
					</p>
					<p className="truncate text-[13px] font-semibold text-[var(--ret-text)]">
						{name}
					</p>
					<p className="truncate text-[10px] text-[var(--ret-text-dim)]">
						{AGENT_LABEL[agentKind]} · {model}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<ReticleButton
						as="a"
						href={`/dashboard/machines/${machineId}/chat`}
						variant="ghost"
						size="sm"
					>
						Full page
					</ReticleButton>
					<ReticleButton variant="ghost" size="sm" onClick={onClose}>
						Close
					</ReticleButton>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				<ChatShell activeMachineId={machineId} model={model} />
			</div>
		</ReticleFrame>
	);
}

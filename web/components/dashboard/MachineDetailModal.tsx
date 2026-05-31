"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Logo, type Mark } from "@/components/Logo";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { ObservabilityPanel } from "@/components/dashboard/ObservabilityPanel";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { cn } from "@/lib/cn";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
	PROVIDER_LABEL,
	type AgentKind,
	type ProviderKind,
} from "@/lib/user-config/schema";

/**
 * Per-machine detail modal. Surfaces the observability panel
 * (identity / latency / activity / breakdown) for one machine instead of
 * pinning it to the Overview for the implicit active machine. Opened by
 * clicking a machine in the fleet; "Open machine" drills into the full
 * machine dashboard.
 */

export type DetailMachine = {
	id: string;
	name: string;
	agentKind: AgentKind;
	providerKind: ProviderKind;
	model: string;
	archived?: boolean;
	capabilities: ProviderCapabilities | null;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

const PROVIDER_MARK: Record<ProviderKind, Mark> = {
	dedalus: "dedalus",
	e2b: "e2b",
	sprites: "sprites",
	vercel: "vercel",
};

const STATE_TONE: Record<string, string> = {
	ready: "text-[var(--ret-green)]",
	starting: "text-[var(--ret-purple)]",
	sleeping: "text-[var(--ret-amber)]",
	error: "text-[var(--ret-red)]",
};

export function MachineDetailModal({
	machine,
	active,
	onClose,
	onChange,
}: {
	machine: DetailMachine;
	active: boolean;
	onClose: () => void;
	onChange: () => Promise<void>;
}) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	if (!mounted) return null;

	const stateName = machine.live.ok ? machine.live.state : "unknown";

	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`${machine.name} detail`}
			className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-[6vh] backdrop-blur-sm"
			onMouseDown={onClose}
		>
			<div
				className="w-full max-w-[920px] border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
				onMouseDown={(e) => e.stopPropagation()}
			>
				<header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-4 py-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<Logo mark={PROVIDER_MARK[machine.providerKind]} size={18} />
						<div className="min-w-0">
							<p className="truncate text-[14px] text-[var(--ret-text)]">
								{machine.name}
								{active ? (
									<span className="ml-2 border border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] px-1 text-[8px] uppercase tracking-[0.2em] text-[var(--ret-purple)]">
										active
									</span>
								) : null}
							</p>
							<p className="truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
								{AGENT_LABEL[machine.agentKind]} · {PROVIDER_LABEL[machine.providerKind]} ·{" "}
								<span className={cn("uppercase", STATE_TONE[stateName])}>
									{stateName}
								</span>{" "}
								· {machine.id}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<ReticleButton
							as="a"
							href={`/dashboard/machines/${machine.id}`}
							variant="primary"
							size="sm"
						>
							Open machine <ArrowUpRight size={13} />
						</ReticleButton>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close"
							className="flex h-7 w-7 items-center justify-center border border-[var(--ret-border)] text-[var(--ret-text-muted)] transition-colors hover:border-[var(--ret-border-hover)] hover:text-[var(--ret-text)]"
						>
							<X size={15} />
						</button>
					</div>
				</header>

				<div className="max-h-[72vh] overflow-y-auto p-4">
					<ObservabilityPanel
						agentKind={machine.agentKind}
						modelOverride={machine.model}
						machineSummary={null}
						activeMachineId={machine.id}
					/>
					<div className="mt-4 flex justify-end border-t border-[var(--ret-border)] pt-3">
						<MachineActions
							machineId={machine.id}
							state={stateName as MachineActionState}
							capabilities={machine.capabilities}
							active={active}
							archived={machine.archived ?? false}
							allowDestroy
							onChange={onChange}
						/>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}

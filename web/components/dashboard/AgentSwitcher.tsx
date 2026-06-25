"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import {
	headerControlKicker,
	headerControlTrigger,
	headerControlValue,
	headerPopover,
	headerPopoverTitle,
} from "@/lib/dashboard/header-chrome";
import { cn } from "@/lib/cn";
import {
	type AgentMachineCandidate,
	selectAgentMachine,
} from "@/lib/dashboard/agent-switching";
import { useSidebarPopoverStyle } from "@/lib/dashboard/sidebar-popover";
import {
	AGENT_KINDS,
	type AgentKind,
	type PublicMachineRef,
} from "@/lib/user-config/schema";

type Props = {
	value: AgentKind;
	/** Current route machine id. Used to avoid selecting the same machine
	 * when another real machine already runs the requested agent. */
	activeMachineId?: string;
	machines?: PublicMachineRef[];
	surface?: "header" | "sidebar";
};

const LABEL: Record<AgentKind, string> = {
	hermes: "Hermes",
	openclaw: "OpenClaw",
	"claude-code": "Claude Code",
	codex: "Codex CLI",
};

const TAGLINE: Record<AgentKind, string> = {
	hermes: "self-improving . persistent memory . MCP-native",
	openclaw: "computer-use . shell . browser . vision",
	"claude-code": "edit repos . run shell . SDK . headless",
	codex: "ship tasks . sandbox . JSONL . CI",
};

const MARK: Record<AgentKind, "nous" | "openclaw" | "claudecode" | "codex"> = {
	hermes: "nous",
	openclaw: "openclaw",
	"claude-code": "claudecode",
	codex: "codex",
};

const SOURCE: Record<AgentKind, string> = {
	hermes: "Nous Research",
	openclaw: "OpenClaw",
	"claude-code": "Anthropic",
	codex: "OpenAI",
};

type SwitcherMessage = {
	tone: "info" | "error";
	text: string;
};

type MachineCatalogResponse = {
	machines?: AgentMachineCandidate[];
};

/**
 * Header dropdown that lets the user swap their agent personality.
 * The trigger always reads as a swap control (chevron + "swap" hint)
 * so it's obvious the rig supports more than Hermes. The dropdown
 * shows both agents with logo, source, and tagline so the choice is
 * informed even on first visit.
 *
 * What the swap actually does:
 *
 *   1. POST /api/dashboard/admin/setup with `draftAgentKind` so the
 *      next provisioned machine ships with the chosen agent.
 *   2. If a real machine already runs that agent, open its console and set it
 *      active in the background.
 *
 * We intentionally do not mutate the current machine's `agentKind`. That field
 * describes what was bootstrapped on the VM; changing it here would relabel a
 * Hermes box as OpenClaw without installing OpenClaw.
 */
export function AgentSwitcher({
	value,
	activeMachineId,
	machines = [],
	surface = "header",
}: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState<AgentKind | null>(null);
	const [message, setMessage] = useState<SwitcherMessage | null>(null);
	const [catalog, setCatalog] = useState<AgentMachineCandidate[]>([]);
	const ref = useRef<HTMLDivElement | null>(null);
	const sidebar = surface === "sidebar";
	const sidebarPopoverStyle = useSidebarPopoverStyle({
		anchorRef: ref,
		enabled: sidebar,
		open,
		width: 320,
	});

	useEffect(() => {
		if (!open) return;
		function handler(event: MouseEvent) {
			if (!ref.current) return;
			if (ref.current.contains(event.target as Node)) return;
			setOpen(false);
		}
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const loadCatalog = useCallback(async (): Promise<AgentMachineCandidate[]> => {
		const response = await fetch("/api/dashboard/machines", { cache: "no-store" });
		if (!response.ok) return [];
		const body = (await response.json().catch(() => ({}))) as MachineCatalogResponse;
		const nextCatalog = body.machines ?? [];
		setCatalog(nextCatalog);
		return nextCatalog;
	}, []);

	useEffect(() => {
		if (!open || catalog.length > 0) return;
		void loadCatalog().catch(() => undefined);
	}, [catalog.length, loadCatalog, open]);

	async function machineForAgent(next: AgentKind): Promise<AgentMachineCandidate | null> {
		const localTarget = selectAgentMachine({
			knownMachines: machines,
			catalogMachines: catalog,
			agentKind: next,
			currentMachineId: activeMachineId,
		});
		if (localTarget) return localTarget;

		const freshCatalog = await loadCatalog();
		return selectAgentMachine({
			knownMachines: [],
			catalogMachines: freshCatalog,
			agentKind: next,
			currentMachineId: activeMachineId,
		});
	}

	async function saveDraft(next: AgentKind): Promise<void> {
		const response = await fetch("/api/dashboard/admin/setup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ draftAgentKind: next }),
		});
		if (!response.ok) {
			throw new Error(`setup HTTP ${response.status}`);
		}
		if (response.body) await response.body.cancel().catch(() => undefined);
	}

	async function activateMachine(machineId: string): Promise<void> {
		const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ active: true }),
		});
		if (!response.ok) throw new Error(`machine HTTP ${response.status}`);
	}

	async function pick(next: AgentKind) {
		if (next === value || pending) {
			setOpen(false);
			return;
		}
		setPending(next);
		setMessage(null);
		let keepOpen = false;
		try {
			const targetMachine = await machineForAgent(next);
			if (targetMachine) {
				setOpen(false);
				router.push(
					`/dashboard/machines/${encodeURIComponent(targetMachine.id)}/console`,
				);
				void Promise.allSettled([
					activateMachine(targetMachine.id),
					saveDraft(next),
				]).then(() => router.refresh());
			} else {
				await saveDraft(next);
				keepOpen = true;
				setMessage({
					tone: "info",
					text: `No ${LABEL[next]} machine yet. Draft saved.`,
				});
				router.refresh();
			}
		} catch (err) {
			setMessage({
				tone: "error",
				text: err instanceof Error ? err.message : "switch failed",
			});
			keepOpen = true;
		} finally {
			setPending(null);
			setOpen(keepOpen);
		}
	}

	return (
		<div className="relative min-w-0 max-w-full" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					headerControlTrigger(open),
					sidebar && "h-8 w-full min-w-0 justify-start overflow-hidden px-2",
				)}
				aria-haspopup="listbox"
				aria-expanded={open}
				title="Switch agent runtime"
			>
				<span
					className={cn(
						headerControlKicker,
						sidebar
							? "w-[58px] shrink-0 tracking-[0.16em]"
							: "hidden md:inline",
					)}
				>
					Agent
				</span>
				<Logo mark={MARK[value]} size={14} className="shrink-0" />
				<span
					className={cn(
						headerControlValue,
						sidebar && "min-w-0 flex-1 text-right",
					)}
				>
					{LABEL[value]}
				</span>
				<span
					className={cn(
						"flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-[var(--ret-purple)]",
					)}
				>
					<span className={sidebar ? "sr-only" : "hidden sm:inline"}>Swap</span>
					<svg
						viewBox="0 0 10 10"
						className={cn(
							"h-2 w-2 transition-transform",
							open ? "rotate-180" : "",
						)}
						fill="currentColor"
					>
						<path d="M5 7 L1 3 H9 z" />
					</svg>
				</span>
			</button>
			{open ? (
				<ul
					role="listbox"
					style={sidebarPopoverStyle}
					className={cn(
						headerPopover,
						"max-w-[calc(100vw-24px)] overflow-hidden",
						sidebar
							? cn(
								"!fixed !right-auto !top-auto w-auto",
								!sidebarPopoverStyle && "pointer-events-none invisible",
							)
							: "w-72",
					)}
				>
					<li className={cn(headerPopoverTitle, "list-none uppercase tracking-[0.12em]")}>
						Pick an agent
					</li>
						{AGENT_KINDS.map((kind) => {
							const selected = kind === value;
							const inFlight = pending === kind;
							const targetMachine = selected
								? null
								: selectAgentMachine({
										knownMachines: machines,
										catalogMachines: catalog,
										agentKind: kind,
										currentMachineId: activeMachineId,
									});
							const className = cn(
								"flex w-full min-w-0 items-start gap-3 overflow-hidden border-b border-[var(--ret-border)] px-3 py-2.5 text-left transition-colors last:border-b-0",
								selected
									? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
									: "hover:bg-[var(--ret-surface)]",
							);
							const option = (
								<>
									<Logo mark={MARK[kind]} size={20} className="mt-0.5 shrink-0" />
									<span className="min-w-0 flex-1">
										<span className="flex min-w-0 items-center gap-2">
											<span className="shrink-0 font-mono text-[12px] text-[var(--ret-text)]">
												{LABEL[kind]}
											</span>
											<span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
												by {SOURCE[kind]}
											</span>
										</span>
										<span
											className="mt-0.5 block truncate font-mono text-[10px] text-[var(--ret-text-muted)]"
											title={TAGLINE[kind]}
										>
											{inFlight ? "switching..." : TAGLINE[kind]}
										</span>
										{targetMachine ? (
											<span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
												opens {targetMachine.name ?? targetMachine.id}
											</span>
										) : null}
									</span>
									{selected ? (
										<span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-purple)]">
											active
										</span>
									) : null}
								</>
							);
							return (
								<li key={kind}>
									<button
										type="button"
										onClick={() => void pick(kind)}
										disabled={Boolean(pending)}
										className={className}
									>
										{option}
									</button>
								</li>
							);
					})}
					{message ? (
						<li
							className={cn(
								"break-words border-t px-3 py-1.5 font-mono text-[10px]",
								message.tone === "error"
									? "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)]"
									: "border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text-muted)]",
							)}
						>
							{message.text}
						</li>
					) : null}
					<li className="break-words border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-1.5 font-mono text-[10px] leading-relaxed text-[var(--ret-text-muted)]">
						{activeMachineId
							? "switches to that agent's machine, or saves the draft"
							: "sets the agent for the next provisioned machine"}
					</li>
				</ul>
			) : null}
		</div>
	);
}

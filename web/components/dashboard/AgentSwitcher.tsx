"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
	codex: "execute tasks . sandbox . JSONL . CI",
};

const MARK: Record<AgentKind, "nous" | "openclaw" | "anthropic" | "openai"> = {
	hermes: "nous",
	openclaw: "openclaw",
	"claude-code": "anthropic",
	codex: "openai",
};

const SOURCE: Record<AgentKind, string> = {
	hermes: "Nous Research",
	openclaw: "OpenClaw",
	"claude-code": "Anthropic",
	codex: "OpenAI",
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
export function AgentSwitcher({ value, activeMachineId, machines = [] }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState<AgentKind | null>(null);
	const [error, setError] = useState<string | null>(null);
	const ref = useRef<HTMLDivElement | null>(null);

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

	async function machineForAgent(next: AgentKind): Promise<string | null> {
		const known = machines.filter((machine) => !machine.archived);
		if (known.length > 0) return bestMachineForAgent(known, next, activeMachineId);

		const response = await fetch("/api/dashboard/machines", { cache: "no-store" });
		if (!response.ok) return null;
		const body = (await response.json().catch(() => ({}))) as {
			machines?: Array<{
				id: string;
				agentKind: AgentKind;
				providerKind?: string;
				archived?: boolean;
				apiUrl?: string | null;
				bootstrapState?: { phase: string; lastError?: string | null };
				live?: { ok: boolean; state?: string };
			}>;
		};
		const liveMachines = body.machines?.filter((machine) => !machine.archived) ?? [];
		return bestMachineForAgent(liveMachines, next, activeMachineId);
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
		const response = await fetch(`/api/dashboard/machines/${machineId}`, {
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
		setError(null);
		let keepOpen = false;
		try {
			const targetMachineId = await machineForAgent(next);
			if (targetMachineId) {
				setOpen(false);
				router.push(`/dashboard/machines/${targetMachineId}/console`);
				void activateMachine(targetMachineId)
					.then(() => saveDraft(next))
					.catch(() => undefined);
			} else {
				await saveDraft(next);
				keepOpen = true;
				setError(`No ${LABEL[next]} machine yet. Draft saved.`);
				router.refresh();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "switch failed");
			keepOpen = true;
		} finally {
			setPending(null);
			setOpen(keepOpen);
		}
	}

	return (
		<div className="relative" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={headerControlTrigger(open)}
				aria-haspopup="listbox"
				aria-expanded={open}
				title="Switch agent (Hermes <-> OpenClaw)"
			>
				<span className={cn(headerControlKicker, "hidden md:inline")}>
					Agent
				</span>
				<Logo mark={MARK[value]} size={14} />
				<span className={headerControlValue}>{LABEL[value]}</span>
				<span
					className={cn(
						"flex items-center gap-0.5 text-[10px] font-medium text-[var(--ret-purple)]",
					)}
				>
					<span className="hidden sm:inline">Swap</span>
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
					className={cn(headerPopover, "w-72")}
				>
					<li className={cn(headerPopoverTitle, "list-none uppercase tracking-[0.12em]")}>
						Pick an agent
					</li>
						{AGENT_KINDS.map((kind) => {
							const selected = kind === value;
							const inFlight = pending === kind;
							const targetMachineId = selected
								? null
								: bestMachineForAgent(
										machines.filter((machine) => !machine.archived),
										kind,
										activeMachineId,
									);
							const targetHref = targetMachineId
								? `/dashboard/machines/${targetMachineId}/console`
								: null;
							const className = cn(
								"flex w-full items-start gap-3 border-b border-[var(--ret-border)] px-3 py-2.5 text-left transition-colors last:border-b-0",
								selected
									? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
									: "hover:bg-[var(--ret-surface)]",
							);
							const option = (
								<>
									<Logo mark={MARK[kind]} size={20} className="mt-0.5" />
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-2">
											<span className="font-mono text-[12px] text-[var(--ret-text)]">
												{LABEL[kind]}
											</span>
											<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
												by {SOURCE[kind]}
											</span>
										</span>
										<span className="mt-0.5 block font-mono text-[10px] text-[var(--ret-text-muted)]">
											{inFlight ? "switching..." : TAGLINE[kind]}
										</span>
									</span>
									{selected ? (
										<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-purple)]">
											active
										</span>
									) : null}
								</>
							);
							if (targetHref && targetMachineId) {
								return (
									<li key={kind}>
										<Link
											href={targetHref}
											onClick={() => {
												setPending(kind);
												setOpen(false);
												void activateMachine(targetMachineId)
													.then(() => saveDraft(kind))
													.catch(() => undefined)
													.finally(() => setPending(null));
											}}
											className={className}
										>
											{option}
										</Link>
									</li>
								);
							}
							return (
								<li key={kind}>
									<button
										type="button"
										onClick={() => void pick(kind)}
										disabled={inFlight}
										className={className}
									>
										{option}
									</button>
								</li>
							);
					})}
					{error ? (
						<li className="border-t border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 px-3 py-1.5 font-mono text-[10px] text-[var(--ret-red)]">
							{error}
						</li>
					) : null}
					<li className="border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-1.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
						{activeMachineId
							? "switches to that agent's machine, or saves the draft"
							: "sets the agent for the next provisioned machine"}
					</li>
				</ul>
			) : null}
		</div>
	);
}

function bestMachineForAgent(
	machines: Array<{
		id: string;
		agentKind: AgentKind;
		providerKind?: string;
		apiUrl?: string | null;
		bootstrapState?: { phase: string; lastError?: string | null };
		live?: { ok: boolean; state?: string };
	}>,
	agentKind: AgentKind,
	currentMachineId?: string,
): string | null {
	const matches = machines
		.filter((machine) => machine.agentKind === agentKind)
		.sort((a, b) => machineScore(b) - machineScore(a));
	const target =
		matches.find((machine) => machine.id !== currentMachineId) ?? matches[0];
	return target?.id ?? null;
}

function machineScore(machine: {
	providerKind?: string;
	apiUrl?: string | null;
	bootstrapState?: { phase: string; lastError?: string | null };
	live?: { ok: boolean; state?: string };
}): number {
	const ready = machine.live?.ok && machine.live.state === "ready";
	const booted = machine.bootstrapState?.phase === "succeeded";
	const reachable = Boolean(machine.apiUrl);
	const cleanBootstrap = !machine.bootstrapState?.lastError;
	return (
		(ready ? 8 : 0) +
		(reachable ? 4 : 0) +
		(booted ? 4 : 0) +
		(cleanBootstrap ? 2 : 0) +
		(machine.providerKind === "sprites" ? 1 : 0)
	);
}

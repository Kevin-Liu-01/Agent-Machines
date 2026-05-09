"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import {
	AGENT_LABEL,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

/**
 * Persistent machine switcher in the dashboard header.
 *
 * Lives next to the gateway badge so the operator can swap which
 * machine the dashboard is targeting from any page (Chat, Terminal,
 * Logs, ...) without having to navigate back to /dashboard. Mirrors
 * the shape of <AgentSwitcher>: trigger + popover + outside-click
 * dismiss.
 *
 * Each row in the popover has the machine's name, agent, spec, and
 * a live state chip. Clicking a row PATCHes
 * `/api/dashboard/machines/<id>` with `active: true`, refreshes the
 * router so server components re-fetch their config, and closes the
 * popover. The "+ Spin up" footer link goes to /dashboard where the
 * `<FleetMonitor>` form lives.
 */

const POLL_MS = 8000;

type LiveMachine = {
	id: string;
	providerKind: ProviderKind;
	agentKind: AgentKind;
	name: string;
	spec: MachineSpec;
	model: string;
	createdAt: string;
	apiUrl: string | null;
	hasApiKey: boolean;
	archived?: boolean;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

type Payload = {
	ok: boolean;
	machines: LiveMachine[];
	activeMachineId: string | null;
};

const STATE_TONE: Record<string, string> = {
	ready: "ok",
	starting: "info",
	sleeping: "muted",
	destroying: "warn",
	destroyed: "muted",
	error: "warn",
	unknown: "muted",
};

const AGENT_MARK: Record<AgentKind, "nous" | "openclaw"> = {
	hermes: "nous",
	openclaw: "openclaw",
};

export function MachineSwitcher() {
	const router = useRouter();
	const [data, setData] = useState<Payload | null>(null);
	const [open, setOpen] = useState(false);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);

	const refresh = useCallback(async (): Promise<void> => {
		try {
			const response = await fetch("/api/dashboard/machines", {
				cache: "no-store",
			});
			if (!response.ok) return;
			const body = (await response.json()) as Payload;
			setData(body);
		} catch {
			// transient, next tick will retry
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		if (!open) return;
		function onClick(event: MouseEvent): void {
			const target = event.target as Node | null;
			if (!target) return;
			if (triggerRef.current?.contains(target)) return;
			if (popoverRef.current?.contains(target)) return;
			setOpen(false);
		}
		function onKey(event: KeyboardEvent): void {
			if (event.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const setActive = useCallback(
		async (machineId: string): Promise<void> => {
			setPendingId(machineId);
			try {
				const response = await fetch(`/api/dashboard/machines/${machineId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ active: true }),
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				await refresh();
				router.refresh();
				setOpen(false);
			} catch {
				// Surface failure via the spinner staying down; the
				// switcher will refresh on the next poll tick.
			} finally {
				setPendingId(null);
			}
		},
		[refresh, router],
	);

	const machines = data?.machines.filter((m) => !m.archived) ?? [];
	const active = machines.find((m) => m.id === data?.activeMachineId) ?? null;

	return (
		<div className="relative">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
				className={cn(
					"flex items-center gap-2 border bg-[var(--ret-bg)] px-2.5 py-1 font-mono text-[11px] transition-colors",
					"border-[var(--ret-border)] hover:border-[var(--ret-purple)]/50 hover:text-[var(--ret-text)]",
					open && "border-[var(--ret-purple)]/60 text-[var(--ret-text)]",
				)}
				title={
					active
						? `Active: ${active.name}. Click to switch machine.`
						: "Pick a machine"
				}
			>
				<span className="text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					machine
				</span>
				<span className="hidden max-w-[140px] truncate text-[var(--ret-text)] md:inline">
					{active?.name ?? "none"}
				</span>
				{active ? (
					<StateDot state={active.live.ok ? active.live.state : "unknown"} />
				) : null}
				<svg
					viewBox="0 0 12 12"
					className={cn(
						"h-2.5 w-2.5 transition-transform",
						open ? "rotate-180" : "rotate-0",
					)}
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M2.5 4.5 L6 8 L9.5 4.5" />
				</svg>
			</button>

			{open ? (
				<div
					ref={popoverRef}
					role="listbox"
					className="absolute right-0 top-full z-50 mt-1 w-[320px] border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_18px_44px_rgba(0,0,0,0.22)]"
				>
					<header className="flex items-center justify-between border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						<span>fleet</span>
						<span>{machines.length} total</span>
					</header>
					<ul className="max-h-[420px] overflow-y-auto">
						{machines.length === 0 ? (
							<li className="px-3 py-4 font-mono text-[11px] text-[var(--ret-text-muted)]">
								No machines yet. Use Spin up below.
							</li>
						) : null}
						{machines.map((machine) => {
							const isActive = machine.id === data?.activeMachineId;
							const stateName = machine.live.ok ? machine.live.state : "unknown";
							const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
							return (
								<li key={machine.id} role="option" aria-selected={isActive}>
									<button
										type="button"
										onClick={() => void setActive(machine.id)}
										disabled={pendingId === machine.id || isActive}
										className={cn(
											"flex w-full items-start gap-2 border-b border-[var(--ret-border)] px-3 py-2 text-left transition-colors",
											isActive
												? "bg-[var(--ret-purple-glow)]"
												: "hover:bg-[var(--ret-surface)]",
											pendingId === machine.id && "opacity-60",
										)}
									>
										<StateDot state={stateName} />
										<div className="min-w-0 flex-1">
											<p className="flex items-center gap-1.5 font-mono text-[12px] text-[var(--ret-text)]">
												<span className="truncate">{machine.name}</span>
												{isActive ? (
													<span className="shrink-0 border border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] px-1 text-[8px] uppercase tracking-[0.22em] text-[var(--ret-purple)]">
														active
													</span>
												) : null}
											</p>
											<p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
												<Logo
													mark={AGENT_MARK[machine.agentKind]}
													size={10}
												/>
												<span>{AGENT_LABEL[machine.agentKind]}</span>
												<span>.</span>
												<span>
													{machine.spec.vcpu}v . {memGib}G
												</span>
												<span>.</span>
												<span className="capitalize">{stateName}</span>
											</p>
											<p
												className="truncate font-mono text-[9px] text-[var(--ret-text-muted)]"
												title={machine.id}
											>
												{machine.id}
											</p>
										</div>
									</button>
								</li>
							);
						})}
					</ul>
					<footer className="flex items-center justify-between border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em]">
						<Link
							href="/dashboard/machines"
							onClick={() => setOpen(false)}
							className="text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
						>
							manage fleet
						</Link>
						<Link
							href="/dashboard"
							onClick={() => setOpen(false)}
							className="text-[var(--ret-purple)] hover:underline"
						>
							+ spin up
						</Link>
					</footer>
				</div>
			) : null}
		</div>
	);
}

function StateDot({ state }: { state: string }) {
	const tone = STATE_TONE[state] ?? "muted";
	const cls =
		tone === "ok"
			? "bg-[var(--ret-green)]"
			: tone === "warn"
				? "bg-[var(--ret-amber)]"
				: tone === "info"
					? "bg-[var(--ret-purple)] animate-pulse"
					: "bg-[var(--ret-text-muted)]";
	return (
		<span
			aria-hidden="true"
			className={cn("mt-1 inline-block h-1.5 w-1.5 shrink-0", cls)}
		/>
	);
}

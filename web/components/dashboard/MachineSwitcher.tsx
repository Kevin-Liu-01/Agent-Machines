"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import {
	headerControlKicker,
	headerControlTrigger,
	headerControlValue,
	headerPopover,
	headerPopoverTitle,
} from "@/lib/dashboard/header-chrome";
import { useSidebarPopoverStyle } from "@/lib/dashboard/sidebar-popover";
import { cn } from "@/lib/cn";
import {
	AGENT_LABEL,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";
import type { ProviderCapabilities } from "@/lib/providers";

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
	capabilities: ProviderCapabilities | null;
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

const AGENT_MARK: Record<AgentKind, "nous" | "openclaw" | "claudecode" | "codex"> = {
	hermes: "nous",
	openclaw: "openclaw",
	"claude-code": "claudecode",
	codex: "codex",
};

type Props = {
	currentMachineId?: string | null;
	surface?: "header" | "sidebar";
};

export function MachineSwitcher({
	currentMachineId = null,
	surface = "header",
}: Props) {
	const router = useRouter();
	const pathname = usePathname();
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

	const targetPathFor = useCallback(
		(machineId: string): string | null => {
			if (!currentMachineId) return null;
			return pathname.replace(
				/^\/dashboard\/machines\/[^/]+/,
				`/dashboard/machines/${machineId}`,
			);
		},
		[currentMachineId, pathname],
	);

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
				const targetPath = targetPathFor(machineId);
				if (targetPath && targetPath !== pathname) router.push(targetPath);
				else router.refresh();
				setOpen(false);
			} catch {
				// Surface failure via the spinner staying down; the
				// switcher will refresh on the next poll tick.
			} finally {
				setPendingId(null);
			}
		},
		[pathname, refresh, router, targetPathFor],
	);

	const machines = data?.machines.filter((m) => !m.archived) ?? [];
	const active = machines.find((m) => m.id === data?.activeMachineId) ?? null;
	const displayed =
		machines.find((m) => m.id === currentMachineId) ?? active ?? null;
	const sidebar = surface === "sidebar";
	const sidebarPopoverStyle = useSidebarPopoverStyle({
		anchorRef: triggerRef,
		enabled: sidebar,
		open,
		width: 320,
	});

	return (
		<div className="relative min-w-0 max-w-full">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
				className={cn(
					headerControlTrigger(open),
					sidebar && "h-8 w-full min-w-0 justify-start overflow-hidden px-2",
				)}
				title={
					displayed
						? `${currentMachineId ? "Viewing" : "Active"}: ${displayed.name}. Click to switch machine.`
					: "Pick a machine"
				}
			>
				<span
					className={cn(
						headerControlKicker,
						sidebar && "w-[58px] shrink-0 tracking-[0.16em]",
					)}
				>
					Machine
				</span>
				<span
					className={cn(
						headerControlValue,
						sidebar
							? "min-w-0 flex-1 text-right"
							: "hidden max-w-[140px] md:inline",
					)}
				>
					{displayed?.name ?? "none"}
				</span>
				{displayed ? (
					<StateDot
						state={displayed.live.ok ? displayed.live.state : "unknown"}
					/>
				) : null}
				<svg
					viewBox="0 0 12 12"
					className={cn(
						"h-2.5 w-2.5 shrink-0 transition-transform",
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
					style={sidebarPopoverStyle}
					className={cn(
						headerPopover,
						"mt-1 max-w-[calc(100vw-24px)] overflow-hidden",
						sidebar
							? cn(
								"!fixed !right-auto !top-auto w-auto",
								!sidebarPopoverStyle && "pointer-events-none invisible",
							)
							: "w-[320px]",
					)}
				>
					<header
						className={cn(
							headerPopoverTitle,
							"flex items-center justify-between uppercase tracking-[0.12em]",
						)}
					>
						<span>fleet</span>
						<span>{machines.length} total</span>
					</header>
					<ul className="max-h-[min(420px,55dvh)] overflow-y-auto">
						{machines.length === 0 ? (
							<li className="px-3 py-4 text-[12px] italic text-[var(--ret-text-muted)]">
								No machines yet. Use Spin up below.
							</li>
						) : null}
						{machines.map((machine) => {
							const isActive = machine.id === data?.activeMachineId;
							const isViewing = machine.id === displayed?.id;
							const stateName = machine.live.ok ? machine.live.state : "unknown";
							const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
							return (
								<li
									key={machine.id}
									role="option"
									aria-selected={isViewing}
									className={cn(
										"flex flex-col gap-1 border-b border-[var(--ret-border)] px-3 py-2 transition-colors",
										isViewing
											? "bg-[var(--ret-purple-glow)]"
											: "hover:bg-[var(--ret-surface)]",
										pendingId === machine.id && "opacity-60",
									)}
								>
									{/* The meta block is still a button so a
									    keyboard or pointer click on the
									    label sets-active in one motion --
									    that's the most common intent for
									    this dropdown. Per-machine wake /
									    sleep / archive / destroy live in
									    the MachineActions row below so the
									    full lifecycle is reachable without
									    leaving the popover. */}
									<button
										type="button"
										onClick={() => void setActive(machine.id)}
										disabled={pendingId === machine.id || (isViewing && isActive)}
										className="flex w-full min-w-0 items-start gap-2 text-left disabled:cursor-default"
									>
										<StateDot state={stateName} className="mt-1" />
										<div className="min-w-0 flex-1">
											<p className="flex min-w-0 items-center gap-1.5 font-mono text-[12px] text-[var(--ret-text)]">
												<span className="min-w-0 truncate" title={machine.name}>
													{machine.name}
												</span>
												{isViewing ? (
													<span className="shrink-0 border border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] px-1 text-[8px] uppercase tracking-[0.22em] text-[var(--ret-purple)]">
														viewing
													</span>
												) : null}
												{isActive && !isViewing ? (
													<span className="shrink-0 border border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] px-1 text-[8px] uppercase tracking-[0.22em] text-[var(--ret-purple)]">
														active
													</span>
												) : null}
											</p>
											<p className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
												<Logo
													mark={AGENT_MARK[machine.agentKind]}
													size={10}
													className="shrink-0"
												/>
												<span className="truncate">{AGENT_LABEL[machine.agentKind]}</span>
												<span>.</span>
												<span className="shrink-0">
													{machine.spec.vcpu}v . {memGib}G
												</span>
												<span>.</span>
												<span className="shrink-0 capitalize">{stateName}</span>
											</p>
											<p
												className="truncate font-mono text-[9px] text-[var(--ret-text-muted)]"
												title={machine.id}
											>
												{machine.id}
											</p>
										</div>
									</button>
									<MachineActions
										machineId={machine.id}
										state={stateName as MachineActionState}
										capabilities={machine.capabilities}
										active={isActive}
										compact
										onChange={async () => {
											await refresh();
											router.refresh();
										}}
									/>
									<Link
										href={`/dashboard/machines/${machine.id}/console`}
										onClick={() => setOpen(false)}
										className="self-end font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:underline"
									>
										talk
									</Link>
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

function StateDot({
	state,
	className,
}: {
	state: string;
	className?: string;
}) {
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
			className={cn("block h-1.5 w-1.5 shrink-0", cls, className)}
		/>
	);
}

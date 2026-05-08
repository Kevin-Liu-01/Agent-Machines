"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import { AGENT_KINDS, type AgentKind } from "@/lib/user-config/schema";

type Props = {
	value: AgentKind;
};

const LABEL: Record<AgentKind, string> = {
	hermes: "Hermes",
	openclaw: "OpenClaw",
};

const TAGLINE: Record<AgentKind, string> = {
	hermes: "self-improving . persistent memory . MCP-native",
	openclaw: "computer-use . shell . browser . vision",
};

const MARK: Record<AgentKind, "nous" | "openclaw"> = {
	hermes: "nous",
	openclaw: "openclaw",
};

const SOURCE: Record<AgentKind, string> = {
	hermes: "Nous Research",
	openclaw: "Dedalus Labs",
};

/**
 * Header dropdown that lets the user swap their agent personality.
 * The trigger always reads as a swap control (chevron + "swap" hint)
 * so it's obvious the rig supports more than Hermes. The dropdown
 * shows both agents with logo, source, and tagline so the choice is
 * informed even on first visit.
 *
 * The actual switch is a POST to `/api/dashboard/admin/setup`; the
 * gateway behavior catches up lazily on the next reload (PR2 will
 * trigger a SOUL.md rewrite + gateway restart so the change is
 * immediate).
 */
export function AgentSwitcher({ value }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState<AgentKind | null>(null);
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

	async function pick(next: AgentKind) {
		if (next === value || pending) {
			setOpen(false);
			return;
		}
		setPending(next);
		try {
			const response = await fetch("/api/dashboard/admin/setup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ draftAgentKind: next }),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			router.refresh();
		} catch {
			// Swallowed; the next refresh will surface state.
		} finally {
			setPending(null);
			setOpen(false);
		}
	}

	return (
		<div className="relative" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					"flex items-center gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1 transition-colors",
					"hover:border-[var(--ret-purple)]/50 hover:bg-[var(--ret-surface)]",
					open ? "border-[var(--ret-purple)]/50 bg-[var(--ret-surface)]" : "",
				)}
				aria-haspopup="listbox"
				aria-expanded={open}
				title="Switch agent (Hermes <-> OpenClaw)"
			>
				<span className="hidden font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)] md:inline">
					agent
				</span>
				<Logo mark={MARK[value]} size={14} />
				<span className="font-mono text-[11px] text-[var(--ret-text)]">
					{LABEL[value]}
				</span>
				<span
					className={cn(
						"flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-[0.18em]",
						"text-[var(--ret-purple)]",
					)}
				>
					<span>swap</span>
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
					className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
				>
					<li className="border-b border-[var(--ret-border)] bg-[var(--ret-surface)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						pick an agent
					</li>
					{AGENT_KINDS.map((kind) => {
						const selected = kind === value;
						const inFlight = pending === kind;
						return (
							<li key={kind}>
								<button
									type="button"
									onClick={() => void pick(kind)}
									disabled={inFlight}
									className={cn(
										"flex w-full items-start gap-3 border-b border-[var(--ret-border)] px-3 py-2.5 text-left transition-colors last:border-b-0",
										selected
											? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
											: "hover:bg-[var(--ret-surface)]",
									)}
								>
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
								</button>
							</li>
						);
					})}
					<li className="border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-1.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
						switching changes the draft for new machines; existing machines keep their agent
					</li>
				</ul>
			) : null}
		</div>
	);
}

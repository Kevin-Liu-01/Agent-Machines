"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";
import { AGENT_LABEL, type AgentKind } from "@/lib/user-config/schema";

/**
 * Dashboard command palette (Cmd/Ctrl+K).
 *
 * One surface to jump anywhere: fuzzy-search every machine, every fleet
 * page, and the per-machine surfaces (console, terminal, logs, ...) for
 * the machine you're currently in or the active one. Renders its own
 * header trigger plus a portal-mounted modal so it works on every
 * dashboard route without prop drilling. Machines are fetched lazily on
 * open (not polled) so the palette stays cheap.
 */

const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;
const MACHINES_DEFAULT_CAP = 8;

type Group = "navigate" | "surfaces" | "machines" | "actions";

type Command = {
	id: string;
	group: Group;
	label: string;
	hint?: string;
	keywords?: string;
	href: string;
};

type LiveMachine = {
	id: string;
	name: string;
	agentKind: AgentKind;
	providerLabel?: string;
	archived?: boolean;
	live: { ok: true; state: string } | { ok: false; reason: string };
};

type MachinesPayload = {
	ok: boolean;
	machines: LiveMachine[];
	activeMachineId: string | null;
};

const GROUP_LABEL: Record<Group, string> = {
	surfaces: "On this machine",
	navigate: "Navigate",
	machines: "Go to machine",
	actions: "Actions",
};

const GROUP_ORDER: Group[] = ["surfaces", "navigate", "machines", "actions"];

const NAV_ITEMS: ReadonlyArray<{ label: string; href: string; keywords: string }> = [
	{ label: "Overview", href: "/dashboard", keywords: "home dashboard fleet activity" },
	{ label: "Machines", href: "/dashboard/machines", keywords: "fleet containers list deploy" },
	{ label: "Usage", href: "/dashboard/usage", keywords: "cost billing resources spend" },
	{ label: "Benchmarks", href: "/dashboard/benchmarks", keywords: "speed latency providers compare" },
	{ label: "Skills", href: "/dashboard/skills", keywords: "library skill.md capabilities" },
	{ label: "MCPs", href: "/dashboard/mcps", keywords: "servers tools integrations" },
	{ label: "Cron", href: "/dashboard/cron", keywords: "schedule jobs automation" },
	{ label: "Registry", href: "/dashboard/registry", keywords: "add install browse" },
	{ label: "Settings", href: "/dashboard/settings", keywords: "config keys credentials router model agent loadout secrets" },
	{ label: "Setup", href: "/dashboard/setup", keywords: "wizard provision new machine" },
];

const SURFACE_ITEMS: ReadonlyArray<{ label: string; seg: string; keywords: string }> = [
	{ label: "Console", seg: "console", keywords: "chat agent talk conversation" },
	{ label: "Terminal", seg: "terminal", keywords: "shell cli pty tmux command" },
	{ label: "Agents", seg: "agents", keywords: "agent runtime keys credentials cursor runs readiness" },
	{ label: "Loadout", seg: "loadout", keywords: "skills mcp tools capabilities" },
	{ label: "Logs", seg: "logs", keywords: "tail output" },
	{ label: "Sessions", seg: "sessions", keywords: "history runs" },
	{ label: "Artifacts", seg: "artifacts", keywords: "files output" },
];

/**
 * Substring match (with prefix/word-boundary bonus) falling back to a
 * subsequence match. Returns null when the query can't match at all.
 */
function fuzzyScore(query: string, haystack: string): number | null {
	const q = query.trim().toLowerCase();
	if (!q) return 0;
	const h = haystack.toLowerCase();
	const sub = h.indexOf(q);
	if (sub !== -1) {
		const prevChar = sub === 0 ? "" : h[sub - 1];
		const boundary = sub === 0 || /[\s\-_/.:]/.test(prevChar);
		return 600 + (boundary ? 200 : 0) - sub;
	}
	let hi = 0;
	let matched = 0;
	let contiguous = 0;
	let bestRun = 0;
	for (const ch of q) {
		let found = -1;
		for (let j = hi; j < h.length; j += 1) {
			if (h[j] === ch) {
				found = j;
				break;
			}
		}
		if (found === -1) return null;
		contiguous = found === hi ? contiguous + 1 : 0;
		bestRun = Math.max(bestRun, contiguous);
		matched += 1;
		hi = found + 1;
	}
	return 100 + matched + bestRun * 2;
}

/**
 * Subsequence-match only the human label (so "termnl" still finds
 * "Terminal"); match the aux fields (id, agent, provider, state) by plain
 * substring. Concatenating every field into one subsequence haystack
 * produces false positives — e.g. "codex" borrowing c-o-d-e from
 * "claude code" and the x from "Sandbox" — so the aux match stays strict.
 */
function scoreCommand(query: string, command: Command): number | null {
	const q = query.trim().toLowerCase();
	if (!q) return 0;
	const label = fuzzyScore(q, command.label);
	const aux = `${command.hint ?? ""} ${command.keywords ?? ""}`.toLowerCase();
	const auxIdx = aux.indexOf(q);
	const auxScore = auxIdx === -1 ? null : 300 - auxIdx;
	if (label === null && auxScore === null) return null;
	return Math.max(label ?? 0, (auxScore ?? 0) * 0.6);
}

export function CommandPalette() {
	const router = useRouter();
	const pathname = usePathname();
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState(0);
	const [data, setData] = useState<MachinesPayload | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const selectedRef = useRef<HTMLButtonElement>(null);

	useEffect(() => setMounted(true), []);

	// Global Cmd/Ctrl+K toggles the palette from anywhere on the dashboard.
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((v) => !v);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Lazily load machines whenever the palette opens; reset query+cursor.
	useEffect(() => {
		if (!open) return;
		setQuery("");
		setSelected(0);
		const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 20);
		let stopped = false;
		fetch("/api/dashboard/machines", { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<MachinesPayload>) : null))
			.then((payload) => {
				if (!stopped && payload) setData(payload);
			})
			.catch(() => {});
		return () => {
			stopped = true;
			window.clearTimeout(focusTimer);
		};
	}, [open]);

	const machines = useMemo(
		() => (data?.machines ?? []).filter((m) => !m.archived),
		[data],
	);
	const contextMachineId =
		MACHINE_PATH_RE.exec(pathname)?.[1] ?? data?.activeMachineId ?? null;
	const contextMachine =
		machines.find((m) => m.id === contextMachineId) ?? null;

	const commands = useMemo<Command[]>(() => {
		const list: Command[] = [];

		if (contextMachine) {
			const base = `/dashboard/machines/${contextMachine.id}`;
			for (const surface of SURFACE_ITEMS) {
				list.push({
					id: `surface:${surface.seg}`,
					group: "surfaces",
					label: surface.label,
					hint: contextMachine.name,
					keywords: `${surface.keywords} ${contextMachine.name}`,
					href: `${base}/${surface.seg}`,
				});
			}
		}

		for (const item of NAV_ITEMS) {
			list.push({
				id: `nav:${item.href}`,
				group: "navigate",
				label: item.label,
				keywords: item.keywords,
				href: item.href,
			});
		}

		for (const machine of machines) {
			const state = machine.live.ok ? machine.live.state : "offline";
			list.push({
				id: `machine:${machine.id}`,
				group: "machines",
				label: machine.name,
				hint: `${AGENT_LABEL[machine.agentKind]} · ${state} · ${machine.id.slice(0, 14)}`,
				keywords: `${machine.id} ${AGENT_LABEL[machine.agentKind]} ${machine.providerLabel ?? ""} ${state}`,
				href: `/dashboard/machines/${machine.id}`,
			});
		}

		list.push({
			id: "action:spin-up",
			group: "actions",
			label: "Spin up new machine",
			keywords: "deploy provision create new bootstrap",
			href: "/dashboard/setup",
		});

		return list;
	}, [machines, contextMachine]);

	// Ordered, grouped, filtered list. Empty query shows defaults (machines
	// capped); a query fuzzy-filters everything and sorts by score per group.
	const visible = useMemo<Command[]>(() => {
		const out: Command[] = [];
		const q = query.trim();
		for (const group of GROUP_ORDER) {
			let items = commands.filter((c) => c.group === group);
			if (q) {
				items = items
					.map((c) => ({ c, score: scoreCommand(q, c) }))
					.filter((x) => x.score !== null)
					.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
					.map((x) => x.c);
			} else if (group === "machines" && items.length > MACHINES_DEFAULT_CAP) {
				items = items.slice(0, MACHINES_DEFAULT_CAP);
			}
			out.push(...items);
		}
		return out;
	}, [commands, query]);

	useEffect(() => {
		setSelected((prev) => (prev >= visible.length ? 0 : prev));
	}, [visible.length]);

	useEffect(() => {
		selectedRef.current?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	const close = useCallback(() => setOpen(false), []);

	const activate = useCallback(
		(command: Command | undefined) => {
			if (!command) return;
			setOpen(false);
			router.push(command.href);
		},
		[router],
	);

	const onInputKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLInputElement>) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelected((i) => (visible.length ? (i + 1) % visible.length : 0));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelected((i) =>
					visible.length ? (i - 1 + visible.length) % visible.length : 0,
				);
			} else if (event.key === "Enter") {
				event.preventDefault();
				activate(visible[selected]);
			} else if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		},
		[visible, selected, activate, close],
	);

	const triggerLabel = "Search machines & actions";

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={triggerLabel}
				title={`${triggerLabel} (Cmd/Ctrl+K)`}
				className={cn(
					"flex shrink-0 items-center gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1 text-[12px] leading-none transition-colors",
					"hover:border-[var(--ret-purple)]/45 hover:bg-[var(--ret-surface)]",
					// Fixed, non-squishing width that scales with viewport. The
					// breadcrumb (min-w-0) yields space instead of the search box.
					"md:w-[180px] md:justify-between lg:w-[220px] xl:w-[260px]",
				)}
			>
				<span className="flex items-center gap-2 text-[var(--ret-text-muted)]">
					<Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
					<span className="hidden md:inline">Search…</span>
				</span>
				<kbd className="hidden items-center gap-0.5 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1 font-mono text-[10px] text-[var(--ret-text-muted)] md:inline-flex">
					⌘K
				</kbd>
			</button>

			{mounted && open
				? createPortal(
						<div
							role="dialog"
							aria-modal="true"
							aria-label="Command palette"
							className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 px-4 pt-[12dvh] backdrop-blur-sm"
							onMouseDown={close}
						>
							<div
								className="flex max-h-[70dvh] w-full max-w-[560px] flex-col overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
								onMouseDown={(e) => e.stopPropagation()}
							>
								<div className="flex items-center gap-2 border-b border-[var(--ret-border)] px-3 py-2.5">
									<Search className="h-4 w-4 shrink-0 text-[var(--ret-text-muted)]" strokeWidth={1.75} />
									<input
										ref={inputRef}
										value={query}
										onChange={(e) => {
											setQuery(e.target.value);
											setSelected(0);
										}}
										onKeyDown={onInputKeyDown}
										placeholder="Search machines, pages, actions…"
										className="flex-1 bg-transparent text-[14px] text-[var(--ret-text)] outline-none placeholder:text-[var(--ret-text-muted)]"
										autoComplete="off"
										spellCheck={false}
									/>
									<kbd className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
										esc
									</kbd>
								</div>

								<div className="min-h-0 flex-1 overflow-y-auto py-1">
									{visible.length === 0 ? (
										<p className="px-3 py-6 text-center text-[12px] text-[var(--ret-text-muted)]">
											No matches for “{query}”.
										</p>
									) : (
										visible.map((command, index) => {
											const showHeader =
												index === 0 ||
												visible[index - 1].group !== command.group;
											const isSelected = index === selected;
											return (
												<div key={command.id}>
													{showHeader ? (
														<p className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
															{command.group === "surfaces" && contextMachine
																? `On ${contextMachine.name}`
																: GROUP_LABEL[command.group]}
														</p>
													) : null}
													<button
														ref={isSelected ? selectedRef : undefined}
														type="button"
														onMouseMove={() => setSelected(index)}
														onClick={() => activate(command)}
														className={cn(
															"flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
															isSelected
																? "bg-[var(--ret-purple-glow)]"
																: "hover:bg-[var(--ret-surface)]",
														)}
													>
														<span className="min-w-0 flex-1">
															<span className="block truncate text-[13px] text-[var(--ret-text)]">
																{command.label}
															</span>
															{command.hint ? (
																<span className="block truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
																	{command.hint}
																</span>
															) : null}
														</span>
														<span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
															{command.group === "machines"
																? "open"
																: command.group === "actions"
																	? "run"
																	: "go"}
														</span>
													</button>
												</div>
											);
										})
									)}
								</div>

								<div className="flex items-center justify-between border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
									<span>↑↓ navigate · ↵ open · esc close</span>
									<span>{visible.length} result{visible.length === 1 ? "" : "s"}</span>
								</div>
							</div>
						</div>,
						document.body,
					)
				: null}
		</>
	);
}


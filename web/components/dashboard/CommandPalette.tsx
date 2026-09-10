"use client";

import { SearchOutline } from "@/components/ui/icons";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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

const NAV_ITEMS: ReadonlyArray<{ label: string; href: string; keywords: string; hint?: string }> = [
	{ label: "Overview", href: "/dashboard", keywords: "home dashboard fleet activity" },
	{ label: "Machines", href: "/dashboard/machines", keywords: "fleet containers list deploy" },
	{ label: "Agent templates", href: "/dashboard/agents", keywords: "agents presets workers library specialist catalog" },
	{ label: "Usage", href: "/dashboard/usage", keywords: "cost billing resources spend" },
	{ label: "Benchmarks", href: "/dashboard/benchmarks", keywords: "speed latency providers compare" },
	{ label: "Learning", href: "/dashboard/benchmarks#learning", keywords: "learn self learning adaptive routing recommendations bandit policy runtime substrate model" },
	{ label: "Console", href: "/dashboard/chat", keywords: "chat agent talk conversation", hint: "Active machine or fleet" },
	{ label: "Terminal", href: "/dashboard/terminal", keywords: "shell cli pty tmux command", hint: "Active machine or fleet" },
	{ label: "Logs", href: "/dashboard/logs", keywords: "tail output", hint: "Active machine or fleet" },
	{ label: "Sessions", href: "/dashboard/sessions", keywords: "history runs", hint: "Active machine or fleet" },
	{ label: "Artifacts", href: "/dashboard/artifacts", keywords: "files output", hint: "Active machine or fleet" },
	{ label: "Memory", href: "/dashboard/memory", keywords: "bundles context persistent identity" },
	{ label: "Loadouts", href: "/dashboard/loadout", keywords: "skills mcp tools capabilities" },
	{ label: "Skills", href: "/dashboard/skills", keywords: "library skill.md capabilities" },
	{ label: "MCP servers", href: "/dashboard/mcps", keywords: "mcps servers tools integrations" },
	{ label: "Schedules", href: "/dashboard/cron", keywords: "cron schedule jobs automation" },
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

type Props = {
	className?: string;
	/** Hide the search text while retaining the icon and keyboard shortcut. */
	compact?: boolean;
};

export function CommandPalette({ className, compact = false }: Props = {}) {
	const router = useRouter();
	const pathname = usePathname();
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState(0);
	const [data, setData] = useState<MachinesPayload | null>(null);
	const dialogId = useId();
	const resultsId = `${dialogId}-results`;
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const selectedRef = useRef<HTMLButtonElement>(null);

	useEffect(() => setMounted(true), []);

	// Global Cmd/Ctrl+K toggles the palette from anywhere on the dashboard.
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.isComposing && event.key.toLowerCase() === "k") {
				event.preventDefault();
				if (!event.repeat) setOpen((v) => !v);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Native modal focus containment/inertness; no timer or opening animation.
	useEffect(() => {
		if (!mounted || !open || !dialogRef.current) return;
		const dialog = dialogRef.current;
		const previousFocus = document.activeElement instanceof HTMLElement
			? document.activeElement : triggerRef.current;
		dialog.showModal();
		inputRef.current?.focus();
		return () => {
			if (dialog.open) dialog.close();
			if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
			else triggerRef.current?.focus({ preventScroll: true });
		};
	}, [mounted, open]);

	// Lazily load machines whenever the palette opens; reset query+cursor.
	useEffect(() => {
		if (!open) return;
		setQuery("");
		setSelected(0);
		const controller = new AbortController();
		let stopped = false;
		fetch("/api/dashboard/machines", { cache: "no-store", signal: controller.signal })
			.then((r) => (r.ok ? (r.json() as Promise<MachinesPayload>) : null))
			.then((payload) => {
				if (!stopped && payload) setData(payload);
			})
			.catch(() => {});
		return () => {
			stopped = true;
			controller.abort();
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
				hint: item.hint,
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
			label: "Create a Worker",
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
			if (event.nativeEvent.isComposing) return;
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

	const onDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDialogElement>) => {
		if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
		const input = inputRef.current;
		const closeButton = closeButtonRef.current;
		if (!input || !closeButton) return;
		// Native dialogs may send boundary Tab presses to browser chrome. Keep
		// this two-control cycle explicit, including after pointer-focused results.
		event.preventDefault();
		const active = document.activeElement;
		const next = active === input ? closeButton
			: active === closeButton ? input
				: event.shiftKey ? closeButton : input;
		next.focus({ preventScroll: true });
	}, []);

	const triggerLabel = "Search machines & actions";

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen(true)}
				aria-label={triggerLabel}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={open ? dialogId : undefined}
				aria-keyshortcuts="Meta+K Control+K"
				title={`${triggerLabel} (Cmd/Ctrl+K)`}
				className={cn(
					"inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 text-sm leading-none",
					"cursor-pointer text-[var(--ret-text-muted)] transition-[color,background-color,border-color] duration-150 ease-[var(--ret-ease-out)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
					"focus-visible:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none",
					className,
				)}
			>
				<SearchOutline className={cn("size-4 shrink-0")} aria-hidden="true" />
				<span className={cn("min-w-0 flex-1 truncate text-left", compact ? "hidden" : "hidden sm:inline")}>Search…</span>
				<kbd aria-hidden="true" className={cn("ml-auto inline-flex h-6 shrink-0 items-center rounded-sm border border-[var(--ret-border)]/60 bg-[var(--ret-bg-soft)] px-1 font-sans text-xs text-[var(--ret-text-muted)]")}>
					⌘K
				</kbd>
			</button>

			{mounted && open
				? createPortal(
						<dialog
							ref={dialogRef}
							id={dialogId}
							aria-modal="true"
							aria-label="Command palette"
							className={cn("fixed inset-x-0 bottom-auto top-[8dvh] m-0 mx-auto max-h-[80dvh] w-[calc(100%_-_2rem)] max-w-[560px] flex-col overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] p-0 text-[var(--ret-text)] shadow-xl open:flex backdrop:bg-black/50")}
							onCancel={(event) => { event.preventDefault(); close(); }}
							onKeyDown={onDialogKeyDown}
							onClick={(event) => { if (event.target === event.currentTarget) close(); }}
						>
								<div className={cn("flex shrink-0 items-center gap-3 border-b border-[var(--ret-border)] px-4 py-3")}>
									<SearchOutline className={cn("size-5 shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" />
									<input
										ref={inputRef}
										value={query}
										onChange={(e) => {
											setQuery(e.target.value);
											setSelected(0);
										}}
										onKeyDown={onInputKeyDown}
										role="combobox"
										aria-label="Search machines, pages, and actions"
										aria-expanded="true"
										aria-controls={resultsId}
										aria-autocomplete="list"
										aria-activedescendant={visible[selected] ? `${resultsId}-${selected}` : undefined}
										placeholder="Search machines, pages, actions…"
										className={cn("min-h-9 min-w-0 flex-1 bg-transparent text-base text-[var(--ret-text)] outline-none placeholder:text-[var(--ret-text-muted)]")}
										autoComplete="off"
										spellCheck={false}
									/>
									<button ref={closeButtonRef} type="button" onClick={close} aria-label="Close search (Esc)" className={cn("inline-flex min-h-9 shrink-0 items-center rounded-sm px-2 text-xs text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-text)]")}>
										Esc
									</button>
								</div>

								<div id={resultsId} role="listbox" tabIndex={-1} aria-label="Search results" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-2")}>
									{visible.length === 0 ? (
										<p role="status" className={cn("px-4 py-8 text-center text-sm text-[var(--ret-text-muted)]")}>
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
														<p aria-hidden="true" className={cn("px-4 pb-1 pt-3 text-xs font-medium text-[var(--ret-text-muted)]")}>
															{command.group === "surfaces" && contextMachine
																? `On ${contextMachine.name}`
																: GROUP_LABEL[command.group]}
														</p>
													) : null}
													<button
														id={`${resultsId}-${index}`}
														role="option"
														aria-selected={isSelected}
														tabIndex={-1}
														ref={isSelected ? selectedRef : undefined}
														type="button"
														onMouseMove={() => setSelected(index)}
														onClick={() => activate(command)}
														className={cn(
															"flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ret-text)]",
															isSelected
																? "bg-[var(--ret-purple-glow)]"
																: "hover:bg-[var(--ret-surface)]",
														)}
													>
														<span className="min-w-0 flex-1">
															<span className={cn("block truncate text-sm text-[var(--ret-text)]")}>
																{command.label}
															</span>
															{command.hint ? (
																<span className={cn("mt-1 block truncate text-xs text-[var(--ret-text-muted)]")}>
																	{command.hint}
																</span>
															) : null}
														</span>
														<span aria-hidden="true" className={cn("shrink-0 text-xs text-[var(--ret-text-muted)]")}>
															{command.group === "machines"
																? "Open"
																: command.group === "actions"
																	? "Set up"
																	: "Go"}
														</span>
													</button>
												</div>
											);
										})
									)}
								</div>

								<div className={cn("flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 py-3 text-xs text-[var(--ret-text-muted)]")}>
									<span>↑↓ Navigate · ↵ Open · Esc Close</span>
									<span>{visible.length} result{visible.length === 1 ? "" : "s"}</span>
								</div>
						</dialog>,
						document.body,
					)
				: null}
		</>
	);
}

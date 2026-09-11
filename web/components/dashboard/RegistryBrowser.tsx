"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, BookOpen, Check, ChevronDown, Code2, Globe, Layers, LoaderCircle, Package, Plug, SearchOutline, Server, ShieldCheck, Terminal, Wrench, X, type IconComponent } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";
import type { RegistryItem, RegistrySourceId, SourceStatus } from "@/lib/dashboard/registry";
import type { RegistryInstallOutcome } from "@/lib/dashboard/registry/types";
import { RegistryCard } from "./RegistryCard";

type Props = {
	installedIds: string[];
	machines: Array<{ id: string; name: string; archived?: boolean }>;
	activeMachineId: string | null;
	initialQuery?: string;
	initialKind?: TrustedAddOnKind | "all";
};
type SearchState =
	| { phase: "loading" }
	| { phase: "done"; items: RegistryItem[]; sources: SourceStatus[] }
	| { phase: "error"; message: string };

const SOURCES: Array<{ id: RegistrySourceId | "all"; label: string }> = [
	{ id: "all", label: "All sources" },
	{ id: "bundled", label: "Bundled catalog" },
	{ id: "skills-sh", label: "skills.sh" },
	{ id: "mcp-registry", label: "MCP Registry" },
	{ id: "npm", label: "npm" },
	{ id: "cursor-plugins", label: "Cursor plugins" },
	{ id: "github-repo", label: "GitHub" },
	{ id: "url-manifest", label: "URL manifest" },
];
const KINDS: Array<{ id: TrustedAddOnKind | "all"; label: string; icon: IconComponent }> = [
	{ id: "all", label: "All items", icon: Layers },
	{ id: "skill", label: "Skills", icon: BookOpen },
	{ id: "mcp", label: "MCP servers", icon: Plug },
	{ id: "cli", label: "CLIs", icon: Terminal },
	{ id: "tool", label: "Tools", icon: Wrench },
	{ id: "plugin", label: "Plugins", icon: Package },
	{ id: "provider", label: "Providers", icon: Server },
	{ id: "source", label: "Sources", icon: Code2 },
];
const PAGE_SIZE = 60;
const controlBase = "min-h-11 rounded-md border border-[var(--ret-border)] px-3 py-2 text-sm transition-colors duration-150 hover:border-[var(--ret-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--ret-text)] disabled:cursor-not-allowed disabled:opacity-50";
const control = cn(controlBase, "bg-[var(--ret-bg)] text-[var(--ret-text)]");

export function RegistryBrowser({ installedIds, machines, activeMachineId, initialQuery = "", initialKind = "all" }: Props) {
	const [targetId, setTargetId] = useState(activeMachineId ?? "");
	const availableMachines = machines.filter((machine) => !machine.archived);
	const target = availableMachines.find((machine) => machine.id === targetId);
	const [query, setQuery] = useState(initialQuery);
	const [activeSource, setActiveSource] = useState<RegistrySourceId | "all">("all");
	const [activeKind, setActiveKind] = useState<TrustedAddOnKind | "all">(initialKind);
	const [state, setState] = useState<SearchState>({ phase: "loading" });
	const [urlInput, setUrlInput] = useState("");
	const [urlError, setUrlError] = useState<string | null>(null);
	const [showUrlDrawer, setShowUrlDrawer] = useState(false);
	const [savedOnly, setSavedOnly] = useState(false);
	const [sort, setSort] = useState("relevance");
	const [visible, setVisible] = useState(PAGE_SIZE);
	const [installing, setInstalling] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const searchAbort = useRef<AbortController | null>(null);
	const libraryIds = useRef(new Set(installedIds));
	// Late search responses must not undo a completed library mutation.
	const libraryChanges = useRef(new Map<string, boolean>());
	const installLock = useRef(false);
	// These endpoints replace the library array, so writes from separate cards
	// must not read and overwrite the same starting snapshot concurrently.
	const libraryQueue = useRef<Promise<void>>(Promise.resolve());
	function enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
		const next = libraryQueue.current.then(write);
		libraryQueue.current = next.then(() => undefined, () => undefined);
		return next;
	}
	function whenIdle(action: () => void) { if (!installLock.current) action(); }

	const doSearch = useCallback(async (q: string, source: RegistrySourceId | "all", kind: TrustedAddOnKind | "all") => {
		if (installLock.current) return;
		searchAbort.current?.abort();
		const controller = new AbortController();
		searchAbort.current = controller;
		setState({ phase: "loading" });
		setVisible(PAGE_SIZE);
		try {
			const params = new URLSearchParams();
			if (q.trim()) params.set("q", q.trim());
			if (source !== "all") params.set("source", source);
			if (kind !== "all") params.set("kind", kind);
			const res = await fetch("/api/dashboard/registry/search?" + params.toString(), { signal: controller.signal });
			if (!res.ok) throw new Error(res.status === 401 ? "Sign in again to browse your registry." : "The registry could not be reached. Your library has not changed.");
			const body = (await res.json()) as { items: RegistryItem[]; sources: SourceStatus[] };
			const items = body.items.map((item) => ({
				...item,
				installed: libraryChanges.current.get(item.id) ?? (item.installed || libraryIds.current.has(item.id) || libraryIds.current.has(item.name)),
			}));
			if (!controller.signal.aborted) setState({ phase: "done", items, sources: body.sources });
		} catch (err) {
			if (controller.signal.aborted) return;
			setState({ phase: "error", message: err instanceof Error ? err.message : "Search failed. Please try again." });
		}
	}, []);

	useEffect(() => {
		void doSearch(initialQuery, "all", initialKind);
		return () => { clearTimeout(debounceRef.current); searchAbort.current?.abort(); };
	}, [doSearch, initialQuery, initialKind]);

	function handleQueryChange(value: string) {
		if (installLock.current) return;
		setQuery(value);
		clearTimeout(debounceRef.current);
		searchAbort.current?.abort();
		setState({ phase: "loading" });
		debounceRef.current = setTimeout(() => { void doSearch(value, activeSource, activeKind); }, 350);
	}
	function handleSourceChange(source: RegistrySourceId | "all") {
		if (installLock.current) return;
		clearTimeout(debounceRef.current);
		setActiveSource(source);
		void doSearch(query, source, activeKind);
	}
	function handleKindChange(kind: TrustedAddOnKind | "all") {
		if (installLock.current) return;
		clearTimeout(debounceRef.current);
		setActiveKind(kind);
		void doSearch(query, activeSource, kind);
	}
	function handleUrlSearch() {
		if (installLock.current) return;
		let url: URL;
		try {
			url = new URL(urlInput.trim());
			if (url.protocol !== "https:" || url.username || url.password) throw new Error();
			if (url.hostname === "github.com") {
				const parts = url.pathname.split("/").filter(Boolean);
				if (parts.length !== 2) {
					setUrlError("Use https://github.com/owner/repository. Branch and file URLs are not supported.");
					return;
				}
				url.pathname = "/" + parts[0] + "/" + parts[1].replace(/\.git$/, "");
				url.search = "";
				url.hash = "";
			}
		} catch {
			setUrlError("Enter a public HTTPS repository or JSON manifest URL, without embedded credentials.");
			return;
		}
		clearTimeout(debounceRef.current);
		const source = url.hostname === "github.com" ? "github-repo" : "url-manifest";
		setUrlError(null);
		setQuery(url.href);
		setActiveSource(source);
		setActiveKind("all");
		setSavedOnly(false);
		void doSearch(url.href, source, "all");
		// Preview only; save and install remain explicit card actions.
	}
	function clearFilters() {
		if (installLock.current) return;
		clearTimeout(debounceRef.current);
		setQuery(""); setActiveSource("all"); setActiveKind("all"); setSavedOnly(false); setSort("relevance");
		void doSearch("", "all", "all");
	}
	async function handleAdd(item: RegistryItem, install = false): Promise<RegistryInstallOutcome> {
		if (install && (!target || installLock.current)) throw new Error("Choose an available Worker and wait for its current installation to finish.");
		if (install) { installLock.current = true; setInstalling(true); }
		try {
			return await enqueueWrite(async () => {
				const res = await fetch("/api/dashboard/registry/add", {
					method: "POST", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ item, install, machineId: install ? target!.id : null }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? "Could not save this item. Please try again.");
			}
			const outcome = await res.json() as RegistryInstallOutcome;
			if (!outcome || !["saved", "manual_setup", "machine_offline", "command_succeeded", "failed"].includes(outcome.status) || typeof outcome.installLog !== "string" || typeof outcome.installOk !== "boolean" || (outcome.machineId !== null && typeof outcome.machineId !== "string")) {
				throw new Error("The save status could not be confirmed. Refresh your library before retrying.");
			}
			libraryIds.current.add(item.id);
			libraryChanges.current.set(item.id, true);
			setState((current) => current.phase === "done" ? { ...current, items: current.items.map((candidate) => candidate.id === item.id ? { ...candidate, installed: true } : candidate) } : current);
			return outcome;
			});
		} finally {
			if (install) { installLock.current = false; setInstalling(false); }
		}
	}
	async function handleRemove(itemId: string) {
		return enqueueWrite(async () => {
			const res = await fetch("/api/dashboard/registry/remove", {
				method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }),
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			throw new Error(body.error ?? "Could not remove this item. Please try again.");
		}
		libraryIds.current.delete(itemId);
		libraryChanges.current.set(itemId, false);
		setState((current) => current.phase === "done" ? { ...current, items: current.items.map((candidate) => candidate.id === itemId ? { ...candidate, installed: false } : candidate) } : current);
		});
	}

	const items = state.phase === "done" ? state.items : [];
	const sources = state.phase === "done" ? state.sources : [];
	const failedSources = sources.filter((source) => !source.ok);
	const allSourcesFailed = sources.length > 0 && failedSources.length === sources.length;
	const savedCount = items.filter((item) => item.installed).length;
	const results = useMemo(() => {
		const filtered = savedOnly ? items.filter((item) => item.installed) : [...items];
		if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
		if (sort === "source") filtered.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
		return filtered;
	}, [items, savedOnly, sort]);
	const filtered = Boolean(query || activeSource !== "all" || activeKind !== "all" || savedOnly);
	const loading = state.phase === "loading";

	return (
		<div className={cn("space-y-4 px-[var(--dashboard-gutter,20px)] pb-8 pt-4")}>
			<section aria-label="Browse the registry" className={cn("space-y-5")}>
				<div className={cn("flex flex-wrap items-center gap-3")}>
					<div className={cn("relative min-w-0 flex-1 basis-72")}>
						<SearchOutline className={cn("pointer-events-none absolute left-3.5 top-3.5 size-5 text-[var(--ret-text-muted)]")} aria-hidden="true" />
						<input type="search" aria-label="Search registry" placeholder="Search skills, integrations, and tools…" value={query} disabled={installing} onChange={(event) => handleQueryChange(event.target.value)} className={cn(control, "min-h-12 w-full pl-11 pr-10 text-base [&::-webkit-search-cancel-button]:appearance-none")} />
						{query ? <button type="button" aria-label="Clear registry search" disabled={installing} onClick={() => handleQueryChange("")} className={cn("absolute right-2 top-2 grid size-8 place-items-center rounded text-[var(--ret-text-muted)] hover:text-[var(--ret-text)] focus-visible:outline-2 disabled:opacity-50")}><X className={cn("size-4")} aria-hidden="true" /></button> : null}
					</div>
					<select aria-label="Filter registry source" value={activeSource} disabled={installing} onChange={(event) => handleSourceChange(event.target.value as RegistrySourceId | "all")} className={cn(control, "min-h-12 min-w-0 flex-1 sm:flex-none")}>
						{SOURCES.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
					</select>
					<button type="button" aria-expanded={showUrlDrawer} aria-controls="registry-url-preview" disabled={installing} onClick={() => whenIdle(() => setShowUrlDrawer(!showUrlDrawer))} className={cn(control, "inline-flex min-h-12 items-center gap-2")}><Globe className={cn("size-4")} aria-hidden="true" />From URL</button>
				</div>
				{showUrlDrawer ? <form id="registry-url-preview" onSubmit={(event) => { event.preventDefault(); handleUrlSearch(); }} className={cn("rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5")}>
					<label htmlFor="registry-url" className={cn("text-base font-semibold")}>Preview a repository or manifest</label>
					<p className={cn("mt-1 text-sm leading-6 text-[var(--ret-text-dim)]")}>Use a public GitHub repository or a JSON tool manifest. Previewing does not save or install anything.</p>
					<div className={cn("mt-4 flex flex-wrap gap-3")}>
						<input id="registry-url" type="url" aria-label="Repository or manifest URL" aria-invalid={Boolean(urlError)} aria-describedby={urlError ? "registry-url-error" : undefined} placeholder="https://github.com/owner/repository" value={urlInput} disabled={installing} onChange={(event) => { setUrlInput(event.target.value); setUrlError(null); }} className={cn(control, "min-w-0 flex-1 basis-64")} />
						<button type="submit" disabled={!urlInput.trim() || installing || loading} className={cn(controlBase, "inline-flex items-center gap-2 bg-[var(--ret-text)] font-medium text-[var(--ret-bg)]")}>Preview source<ArrowRight className={cn("size-4")} aria-hidden="true" /></button>
					</div>
					{urlError ? <p id="registry-url-error" role="alert" className={cn("mt-3 text-sm text-[var(--ret-red)]")}>{urlError}</p> : null}
				</form> : null}
				<div aria-label="Filter by item type" className={cn("flex flex-wrap gap-1.5 border-b border-[var(--ret-border)] pb-5")}>
					{KINDS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => handleKindChange(id)} aria-pressed={activeKind === id} disabled={installing} className={cn("inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 disabled:opacity-50", activeKind === id ? "bg-[var(--ret-surface)] font-semibold text-[var(--ret-text)]" : "text-[var(--ret-text-dim)] hover:bg-[var(--ret-bg-soft)] hover:text-[var(--ret-text)]")}><Icon className={cn("size-4", activeKind !== id && "text-[var(--ret-text-muted)]")} aria-hidden="true" />{label}</button>)}
				</div>
			</section>

			<div className={cn("flex flex-col gap-4 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5")}>
				<div className={cn("flex min-w-0 items-start gap-3")}><ShieldCheck className={cn("mt-0.5 size-5 shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" /><div><p className={cn("text-sm font-semibold")}>Save first. Install with intent.</p><p className={cn("mt-1 max-w-xl text-sm leading-6 text-[var(--ret-text-dim)]")}>Saved items live in your library, not on a Worker. Review each command before running it. MCPs and plugins need separate setup.</p></div></div>
				<div className={cn("w-full shrink-0 sm:w-56")}>
					<label htmlFor={availableMachines.length ? "registry-worker" : undefined} className={cn("mb-1.5 block text-xs font-medium text-[var(--ret-text-dim)]")}>Installation target</label>
					{availableMachines.length ? <select id="registry-worker" value={target?.id ?? ""} disabled={installing} onChange={(event) => whenIdle(() => setTargetId(event.target.value))} className={cn(control, "w-full")}><option value="">Choose a Worker</option>{availableMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} · {machine.id.slice(-6)}</option>)}</select> : <Link href="/dashboard/setup" className={cn(control, "flex items-center justify-between gap-2")}>Set up a Worker<ArrowRight className={cn("size-4")} aria-hidden="true" /></Link>}
				</div>
			</div>
			{installing ? <p role="status" className={cn("flex items-center gap-2 text-sm text-[var(--ret-text-dim)]")}><LoaderCircle className={cn("size-4 motion-safe:animate-spin")} aria-hidden="true" />Installation in progress. Keep this page open to see the result.</p> : null}

			<div className={cn("flex flex-wrap items-center justify-between gap-4")}>
				<div>
					<p role="status" className={cn("text-base font-semibold tabular-nums")}>{loading ? "Searching the registry…" : state.phase === "error" || allSourcesFailed ? "Results unavailable" : results.length.toLocaleString() + (results.length === 1 ? " item" : " items") + (savedOnly ? " saved in these results" : " available")}</p>
					<p className={cn("mt-1 text-sm text-[var(--ret-text-muted)]")}>{!query.trim() && activeSource === "all" ? "Browsing the bundled catalog. Search to include external sources." : "Results from the selected sources, not a complete inventory of your library."}</p>
				</div>
				<div className={cn("flex flex-wrap items-center gap-2")}>
					<button type="button" aria-pressed={savedOnly} disabled={loading || installing} onClick={() => whenIdle(() => { setSavedOnly(!savedOnly); setVisible(PAGE_SIZE); })} className={cn(controlBase, "inline-flex items-center gap-2 text-[var(--ret-text)]", savedOnly ? "bg-[var(--ret-surface)] font-semibold" : "bg-[var(--ret-bg)]")}><Layers className={cn("size-4")} aria-hidden="true" />Saved in these results<span className={cn("tabular-nums text-[var(--ret-text-muted)]")}>{savedCount}</span></button>
					<select aria-label="Sort registry items" disabled={installing} value={sort} onChange={(event) => whenIdle(() => { setSort(event.target.value); setVisible(PAGE_SIZE); })} className={cn(control)}><option value="relevance">Source order</option><option value="name">Name: A–Z</option><option value="source">Group by source</option></select>
					{filtered ? <button type="button" disabled={installing} onClick={clearFilters} className={cn("min-h-11 rounded-md px-3 text-sm text-[var(--ret-text-dim)] underline decoration-[var(--ret-border)] underline-offset-4 hover:text-[var(--ret-text)] focus-visible:outline-2 disabled:opacity-50")}>Clear filters</button> : null}
				</div>
			</div>

			{sources.length > 0 ? <details className={cn("group rounded-md border border-[var(--ret-border)] text-sm")}>
				<summary className={cn("flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-[var(--ret-text-dim)] focus-visible:outline-2 [&::-webkit-details-marker]:hidden")}>
					{failedSources.length ? <AlertCircle className={cn("size-4 shrink-0 text-[var(--ret-amber)]")} aria-hidden="true" /> : <Globe className={cn("size-4 shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" />}
					<span>{failedSources.length ? failedSources.length + (failedSources.length === 1 ? " source unavailable" : " sources unavailable") + (allSourcesFailed ? "" : "; showing available results") : sources.length + (sources.length === 1 ? " source searched" : " sources searched")}</span><ChevronDown className={cn("ml-auto size-4 shrink-0 group-open:rotate-180")} aria-hidden="true" />
				</summary>
				<div className={cn("grid gap-3 border-t border-[var(--ret-border)] p-4 sm:grid-cols-2 xl:grid-cols-3")}>
					{sources.map((source) => <div key={source.id} className={cn("flex items-start gap-2")}>
						{source.ok ? <Check className={cn("mt-0.5 size-4 shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" /> : <AlertCircle className={cn("mt-0.5 size-4 shrink-0 text-[var(--ret-amber)]")} aria-hidden="true" />}
						<div className={cn("min-w-0")}><p className={cn("font-medium")}>{source.label}</p><p className={cn("mt-0.5 break-words text-xs leading-5 text-[var(--ret-text-muted)]")}>{source.ok ? source.count.toLocaleString() + " returned before type filters" : source.error ?? "Could not load this source."}</p></div>
					</div>)}
					{failedSources.length ? <button type="button" disabled={installing} onClick={() => void doSearch(query, activeSource, activeKind)} className={cn(control, "w-fit")}>Retry search</button> : null}
				</div>
			</details> : null}

			{loading ? <div aria-hidden="true" className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3")}>
				{Array.from({ length: 6 }, (_, index) => <div key={index} className={cn("h-64 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 motion-safe:animate-pulse")}><div className={cn("mb-5 size-11 rounded-lg bg-[var(--ret-surface)]")} /><div className={cn("h-4 w-2/3 rounded bg-[var(--ret-surface)]")} /><div className={cn("mt-4 h-3 w-full rounded bg-[var(--ret-surface)]")} /><div className={cn("mt-2 h-3 w-4/5 rounded bg-[var(--ret-surface)]")} /><div className={cn("mt-8 h-9 w-32 rounded bg-[var(--ret-surface)]")} /></div>)}
			</div> : state.phase === "error" || allSourcesFailed ? <div role="alert" className={cn("rounded-lg border border-[var(--ret-border)] px-6 py-12 text-center")}>
				<AlertCircle className={cn("mx-auto mb-4 size-8 text-[var(--ret-text-muted)]")} aria-hidden="true" /><h2 className={cn("text-lg font-semibold")}>The registry is unavailable</h2><p className={cn("mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--ret-text-dim)]")}>{state.phase === "error" ? state.message : "The selected sources did not respond. Retry or return to the bundled catalog."}</p><div className={cn("mt-5 flex flex-wrap justify-center gap-3")}><button type="button" onClick={() => void doSearch(query, activeSource, activeKind)} className={cn(control)}>Try again</button><button type="button" onClick={clearFilters} className={cn(control)}>Browse bundled catalog</button></div>
			</div> : results.length === 0 ? <div className={cn("rounded-lg border border-[var(--ret-border)] px-6 py-14 text-center")}>
				<SearchOutline className={cn("mx-auto mb-4 size-8 text-[var(--ret-text-muted)]")} aria-hidden="true" /><h2 className={cn("text-lg font-semibold")}>{savedOnly ? "No saved items in these results" : "No matching items"}</h2><p className={cn("mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--ret-text-dim)]")}>{savedOnly ? "Search for a saved item by name, or turn off the saved filter to discover more." : "Try a broader search, choose another source, or preview a repository URL."}</p><button type="button" onClick={clearFilters} className={cn(control, "mt-5")}>Reset search</button>
			</div> : <>
				<div className={cn("grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3")}>
					{results.slice(0, visible).map((item) => <RegistryCard key={item.id} item={item} targetId={target?.id ?? ""} targetName={target?.name} installBusy={installing} onAdd={handleAdd} onRemove={handleRemove} />)}
				</div>
				<div className={cn("flex flex-wrap items-center justify-between gap-4 border-t border-[var(--ret-border)] pt-5")}><p className={cn("text-sm tabular-nums text-[var(--ret-text-muted)]")}>Showing {Math.min(visible, results.length).toLocaleString()} of {results.length.toLocaleString()} items</p>{visible < results.length ? <button type="button" disabled={installing} onClick={() => setVisible((count) => count + PAGE_SIZE)} className={cn(control, "inline-flex items-center gap-2")}>Show {Math.min(PAGE_SIZE, results.length - visible)} more<ChevronDown className={cn("size-4")} aria-hidden="true" /></button> : null}</div>
			</>}
		</div>
	);
}

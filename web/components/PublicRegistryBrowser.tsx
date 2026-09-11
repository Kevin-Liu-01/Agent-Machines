"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TriangleAlert as AlertTriangle, ArrowRight, BookOpen, Boxes, Code2, ExternalLink, Package, Plug, RefreshCcw as RefreshCw, SearchOutline, Terminal } from "@/components/ui/icons";
import { RegistryLogo } from "@/components/dashboard/RegistryLogo";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";
import type { RegistryItem, RegistrySourceId, SourceStatus } from "@/lib/dashboard/registry";

type SearchResult = { items: RegistryItem[]; sources: SourceStatus[] };
type SearchState = { phase: "loading" } | { phase: "done"; result: SearchResult } | { phase: "error"; message: string };
const SOURCES = [
	{ id: "all", label: "All sources" }, { id: "bundled", label: "Bundled catalog" },
	{ id: "skills-sh", label: "skills.sh" }, { id: "mcp-registry", label: "MCP Registry" },
	{ id: "npm", label: "npm" }, { id: "github-repo", label: "GitHub" },
] as const;
const KINDS = [
	{ id: "all", label: "Everything", Icon: Boxes }, { id: "skill", label: "Skills", Icon: BookOpen },
	{ id: "mcp", label: "MCP servers", Icon: Plug }, { id: "cli", label: "CLIs", Icon: Terminal },
	{ id: "tool", label: "Tools", Icon: Code2 }, { id: "plugin", label: "Plugins", Icon: Package },
	{ id: "provider", label: "Providers", Icon: Boxes }, { id: "source", label: "Source code", Icon: Code2 },
] as const;
const PAGE_SIZE = 24;
const CONTROL = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-[background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)] motion-reduce:transition-none";

export function isPublicRegistryResult(value: unknown): value is SearchResult {
	if (!value || typeof value !== "object") return false;
	const result = value as Partial<SearchResult>;
	return Array.isArray(result.items) && Array.isArray(result.sources)
		&& result.items.every((item) => item && typeof item.id === "string" && typeof item.name === "string"
			&& typeof item.description === "string" && typeof item.provider === "string"
			&& KINDS.some((kind) => kind.id !== "all" && kind.id === item.kind)
			&& (item.installCommand === null || typeof item.installCommand === "string"))
		&& result.sources.every((source) => source && typeof source.id === "string" && typeof source.label === "string"
			&& typeof source.ok === "boolean" && Number.isFinite(source.count) && source.count >= 0);
}

/** External catalog URLs are untrusted data, never executable link targets. */
export function publicRegistryHomepage(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; }
	catch { return undefined; }
}

export function PublicRegistryBrowser() {
	const [query, setQuery] = useState("");
	const [source, setSource] = useState<RegistrySourceId | "all">("all");
	const [kind, setKind] = useState<TrustedAddOnKind | "all">("all");
	const [state, setState] = useState<SearchState>({ phase: "loading" });
	const [visible, setVisible] = useState(PAGE_SIZE);
	const [attempt, setAttempt] = useState(0);
	const requestId = useRef(0);

	useEffect(() => {
		const id = ++requestId.current;
		const controller = new AbortController();
		let timedOut = false;
		setState({ phase: "loading" });
		setVisible(PAGE_SIZE);
		const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
		const timer = setTimeout(async () => {
			try {
				const params = new URLSearchParams();
				const search = query.trim();
				if (search) params.set("q", search);
				const requestedSource = !search && source === "all" ? "bundled" : source;
				if (requestedSource !== "all") params.set("source", requestedSource);
				if (kind !== "all") params.set("kind", kind);
				const response = await fetch(`/api/registry/search?${params}`, { signal: controller.signal });
				if (!response.ok) throw new Error("Search is unavailable. Try again in a moment.");
				const result: unknown = await response.json();
				if (!isPublicRegistryResult(result)) throw new Error("The catalog returned an incomplete response. Try again.");
				if (id === requestId.current && !controller.signal.aborted) setState({ phase: "done", result });
			} catch (error) {
				if (id !== requestId.current || (controller.signal.aborted && !timedOut)) return;
				setState({ phase: "error", message: timedOut ? "Search took too long. Try again or choose the bundled catalog." : error instanceof Error ? error.message : "Search is unavailable. Try again." });
			} finally { clearTimeout(timeout); }
		}, query.trim() ? 300 : 0);
		return () => { requestId.current++; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
	}, [query, source, kind, attempt]);

	function reset() { setQuery(""); setSource("all"); setKind("all"); setAttempt((current) => current + 1); }
	const result = state.phase === "done" ? state.result : undefined;
	const failedSources = result?.sources.filter((entry) => !entry.ok) ?? [];
	const allFailed = Boolean(result?.sources.length && failedSources.length === result.sources.length);
	const items = result?.items ?? [];
	const dashboardParams = new URLSearchParams();
	if (query.trim()) dashboardParams.set("q", query.trim());
	if (kind !== "all") dashboardParams.set("kind", kind);
	const dashboardHref = `/dashboard/registry${dashboardParams.size ? `?${dashboardParams}` : ""}`;

	return <section aria-label="Browse the public catalog" className="space-y-6">
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row">
				<label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg border border-[var(--ret-border)]/60 bg-[var(--ret-bg-soft)]/30 px-4 focus-within:border-[var(--ret-text-muted)]">
					<SearchOutline className="size-5 shrink-0 text-[var(--ret-text-muted)]" aria-hidden="true" />
					<input type="search" aria-label="Search the catalog" placeholder="Search skills, MCP servers, and tools" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base text-[var(--ret-text)] outline-none placeholder:text-[var(--ret-text-muted)]" />
				</label>
				<label className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--ret-border)]/60 px-4 text-sm text-[var(--ret-text-dim)]">
					<span className="sr-only">Catalog source</span>
					<select aria-label="Catalog source" value={source} onChange={(event) => setSource(event.target.value as RegistrySourceId | "all")} className="min-h-11 w-full bg-[var(--ret-bg)] text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)] sm:text-sm">
						{SOURCES.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
					</select>
				</label>
			</div>
			<div className="flex flex-wrap gap-2" role="group" aria-label="Filter by item type">
				{KINDS.map(({ id, label, Icon }) => <button type="button" key={id} aria-pressed={kind === id} onClick={() => setKind(id)} className={cn(CONTROL, kind === id ? "bg-[var(--ret-surface)] text-[var(--ret-text)]" : "text-[var(--ret-text-dim)] hover:bg-[var(--ret-bg-soft)]")}><Icon className="size-4" aria-hidden="true" />{label}</button>)}
			</div>
			<p className="text-sm leading-6 text-[var(--ret-text-muted)]">{!query.trim() && source === "all" ? "Showing the bundled catalog. Search to include external sources." : "Results from the selected sources, not a complete inventory."} Browsing does not save or install anything.</p>
		</div>

		{state.phase === "loading" ? <RegistryLoading /> : state.phase === "error" ? <CatalogNotice title="Catalog unavailable" message={state.message} onRetry={() => setAttempt((current) => current + 1)} onReset={reset} /> : allFailed ? <CatalogNotice title="Sources unavailable" message="None of the selected sources responded. Retry or browse the bundled catalog." onRetry={() => setAttempt((current) => current + 1)} onReset={reset} /> : <>
			{failedSources.length ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--ret-border)]/50 p-4 text-sm text-[var(--ret-text-dim)]"><span className="flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" />Some sources are unavailable. Showing the results that loaded.</span><button type="button" onClick={() => setAttempt((current) => current + 1)} className={cn(CONTROL, "border border-[var(--ret-border)] hover:bg-[var(--ret-surface)]")}><RefreshCw className="size-4" aria-hidden="true" />Retry sources</button></div> : null}
			{items.length === 0 ? <div className="rounded-lg border border-dashed border-[var(--ret-border)]/60 px-6 py-12 text-center" role="status"><SearchOutline className="mx-auto mb-4 size-7 text-[var(--ret-text-muted)]" aria-hidden="true" /><h2 className="text-lg font-semibold">No matching entries</h2><p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-[var(--ret-text-dim)]">Try a broader search or another type. Some external sources need a search term.</p><button type="button" onClick={reset} className={cn(CONTROL, "mt-5 border border-[var(--ret-border)] text-[var(--ret-text)] hover:bg-[var(--ret-surface)]")}>Clear filters</button></div> : <>
				<p role="status" className="text-sm text-[var(--ret-text-muted)]">Showing {Math.min(visible, items.length).toLocaleString()} of {items.length.toLocaleString()} returned entries</p>
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.slice(0, visible).map((item) => <CatalogCard key={item.id} item={item} />)}</div>
				{visible < items.length ? <div className="text-center"><button type="button" onClick={() => setVisible((count) => count + PAGE_SIZE)} className={cn(CONTROL, "border border-[var(--ret-border)] text-[var(--ret-text)] hover:bg-[var(--ret-surface)]")}>Show {Math.min(PAGE_SIZE, items.length - visible)} more <ArrowRight className="size-4" aria-hidden="true" /></button></div> : null}
			</>}
			{result?.sources.length ? <details className="rounded-lg border border-[var(--ret-border)]/40 px-4 text-sm text-[var(--ret-text-muted)]"><summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Source status · {result.sources.length} queried</summary><ul className="space-y-2 pb-4">{result.sources.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-3"><span>{entry.label}</span><span>{entry.ok ? `${entry.count.toLocaleString()} before type filtering` : "Unavailable"}</span></li>)}</ul></details> : null}
		</>}
		<div className="flex flex-col gap-4 border-t border-[var(--ret-border)]/35 pt-6 sm:flex-row sm:items-center sm:justify-between">
			<p className="max-w-[58ch] text-sm leading-6 text-[var(--ret-text-dim)]">Review entries in your dashboard before saving or installing. Credentials, permissions, and runtime wiring still need setup.</p>
			<Link href={dashboardHref} className={cn(CONTROL, "shrink-0 bg-[var(--ret-text)] px-5 text-[var(--ret-bg)] hover:opacity-85")}>Open in dashboard <ArrowRight className="size-4" aria-hidden="true" /></Link>
		</div>
	</section>;
}

function CatalogCard({ item }: { item: RegistryItem }) {
	const homepage = publicRegistryHomepage(item.homepage);
	const params = new URLSearchParams({ q: item.name, kind: item.kind });
	return <article className="flex min-w-0 flex-col rounded-lg border border-[var(--ret-border)]/45 p-5">
		<header className="flex items-start gap-3"><RegistryLogo brand={item.brand} logoUrl={item.logoUrl} kind={item.kind} name={item.name} homepage={homepage} size={32} /><div className="min-w-0"><h3 className="break-words text-lg font-semibold leading-6 tracking-tight text-[var(--ret-text)]">{item.name}</h3><p className="mt-1 break-words text-xs text-[var(--ret-text-muted)]">{item.provider} · {KINDS.find((entry) => entry.id === item.kind)?.label}</p></div></header>
		<p className="mt-4 text-sm leading-6 text-[var(--ret-text-dim)] [overflow-wrap:anywhere]">{item.description || "No description supplied. Review the source before using this entry."}</p>
		{item.installCommand ? <details className="mt-4 text-sm text-[var(--ret-text-muted)]"><summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Installation command</summary><code className="block rounded-md bg-[var(--ret-bg-soft)] p-3 text-xs leading-6 [overflow-wrap:anywhere]">{item.installCommand}</code><p className="mt-2 text-xs leading-5">Source-provided command. Inspect it before execution.</p></details> : null}
		<div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5"><Link href={`/dashboard/registry?${params}`} className={cn(CONTROL, "border border-[var(--ret-border)] text-[var(--ret-text)] hover:bg-[var(--ret-surface)]")}>Review in dashboard <ArrowRight className="size-4" aria-hidden="true" /></Link>{homepage ? <a href={homepage} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.name} source`} className={cn(CONTROL, "text-[var(--ret-text-dim)] hover:bg-[var(--ret-bg-soft)]")}>Source <ExternalLink className="size-4" aria-hidden="true" /></a> : null}</div>
	</article>;
}

function CatalogNotice({ title, message, onRetry, onReset }: { title: string; message: string; onRetry: () => void; onReset: () => void }) {
	return <div role="alert" className="rounded-lg border border-[var(--ret-border)]/50 p-6"><AlertTriangle className="mb-4 size-6 text-[var(--ret-text-muted)]" aria-hidden="true" /><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--ret-text-dim)]">{message}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={onRetry} className={cn(CONTROL, "border border-[var(--ret-border)] hover:bg-[var(--ret-surface)]")}><RefreshCw className="size-4" aria-hidden="true" />Retry search</button><button type="button" onClick={onReset} className={cn(CONTROL, "text-[var(--ret-text-dim)] hover:bg-[var(--ret-bg-soft)]")}>Browse bundled catalog</button></div></div>;
}

function RegistryLoading() {
	return <div role="status" aria-label="Loading catalog" aria-busy="true" className="space-y-4"><p className="text-sm text-[var(--ret-text-muted)]">Loading catalog…</p><div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-4 rounded-lg border border-[var(--ret-border)]/40 p-5"><div className="flex items-center gap-3"><Skeleton width={32} height={32} /><Skeleton width="66%" height={16} /></div><Skeleton width="100%" height={12} /><Skeleton width="80%" height={12} /><Skeleton width={160} height={40} /></div>)}</div></div>;
}

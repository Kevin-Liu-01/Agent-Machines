"use client";

import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RegistryLogo } from "@/components/dashboard/RegistryLogo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { cn } from "@/lib/cn";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";
import type { RegistryItem, RegistrySourceId, SourceStatus } from "@/lib/dashboard/registry";

type SearchState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "done"; items: RegistryItem[]; sources: SourceStatus[] }
	| { phase: "error"; message: string };

const SOURCES: Array<{ id: RegistrySourceId | "all"; label: string }> = [
	{ id: "all", label: "All sources" },
	{ id: "bundled", label: "Bundled" },
	{ id: "skills-sh", label: "skills.sh" },
	{ id: "mcp-registry", label: "MCP Registry" },
	{ id: "npm", label: "npm" },
	{ id: "cursor-plugins", label: "Cursor Plugins" },
	{ id: "github-repo", label: "GitHub" },
];

const PAGE_SIZE = 60;

const KINDS: Array<{ id: TrustedAddOnKind | "all"; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "skill", label: "Skills" },
	{ id: "mcp", label: "MCPs" },
	{ id: "cli", label: "CLIs" },
	{ id: "tool", label: "Tools" },
	{ id: "plugin", label: "Plugins" },
];

export function PublicRegistryBrowser() {
	const [query, setQuery] = useState("");
	const [activeSource, setActiveSource] = useState<RegistrySourceId | "all">("all");
	const [activeKind, setActiveKind] = useState<TrustedAddOnKind | "all">("all");
	const [state, setState] = useState<SearchState>({ phase: "idle" });
	const [visible, setVisible] = useState(PAGE_SIZE);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const doSearch = useCallback(
		async (q: string, source: RegistrySourceId | "all", kind: TrustedAddOnKind | "all") => {
			setState({ phase: "loading" });
			setVisible(PAGE_SIZE);
			try {
				const params = new URLSearchParams();
				if (q) params.set("q", q);
				if (source !== "all") params.set("source", source);
				if (kind !== "all") params.set("kind", kind);
				const res = await fetch(`/api/registry/search?${params.toString()}`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = (await res.json()) as { items: RegistryItem[]; sources: SourceStatus[] };
				setState({ phase: "done", items: body.items, sources: body.sources });
			} catch (err) {
				setState({
					phase: "error",
					message: err instanceof Error ? err.message : "Search failed",
				});
			}
		},
		[],
	);

	useEffect(() => {
		void doSearch("", "all", "all");
	}, [doSearch]);

	function handleQueryChange(value: string) {
		setQuery(value);
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			void doSearch(value, activeSource, activeKind);
		}, 350);
	}

	function handleSourceChange(source: RegistrySourceId | "all") {
		setActiveSource(source);
		void doSearch(query, source, activeKind);
	}

	function handleKindChange(kind: TrustedAddOnKind | "all") {
		setActiveKind(kind);
		void doSearch(query, activeSource, kind);
	}

	const items = state.phase === "done" ? state.items : [];
	const sources = state.phase === "done" ? state.sources : [];
	const totalCount = items.length;
	const sourceCountMap = useMemo(() => {
		const map: Record<string, number> = {};
		for (const item of items) {
			map[item.source] = (map[item.source] ?? 0) + 1;
		}
		return map;
	}, [items]);

	return (
		<div className="space-y-5">
			<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
				<div className="grid border-b border-[var(--ret-border)] md:grid-cols-[minmax(0,1fr)_180px]">
					<label className="flex min-h-14 items-center gap-3 px-4">
						<Search
							className="h-4 w-4 shrink-0 text-[var(--ret-text-muted)]"
							strokeWidth={1.5}
						/>
						<input
							type="search"
							placeholder="search skills, MCPs, CLIs, tools, plugins..."
							value={query}
							onChange={(e) => handleQueryChange(e.target.value)}
							className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:outline-none"
						/>
					</label>
					<div className="flex items-center justify-between border-t border-[var(--ret-border)] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] md:border-l md:border-t-0">
						<span>{state.phase}</span>
						<span>{items.length.toLocaleString()}</span>
					</div>
				</div>

				<div className="grid grid-cols-[44px_minmax(0,1fr)] border-b border-[var(--ret-border)]">
					<div className="flex items-center justify-center border-r border-[var(--ret-border)] text-[var(--ret-text-muted)]">
						<SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
					</div>
					<div className="bg-[var(--ret-bg)]">
						<div className="flex w-fit max-w-full flex-wrap gap-px bg-[var(--ret-border)]">
							{SOURCES.map((s) => {
								const count = s.id === "all" ? totalCount : (sourceCountMap[s.id] ?? 0);
								return (
									<button
										key={s.id}
										type="button"
										onClick={() => handleSourceChange(s.id)}
										className={cn(
											"flex min-h-10 items-center gap-1.5 bg-[var(--ret-bg)] px-3 py-1.5 font-mono text-[11px] transition-colors",
											activeSource === s.id
												? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
												: "bg-[var(--ret-bg)] text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
										)}
									>
										<span>{s.label}</span>
										{state.phase === "done" ? (
											<span className="text-[10px] text-[var(--ret-text-muted)]">{count}</span>
										) : null}
									</button>
								);
							})}
						</div>
					</div>
				</div>
				<div className="bg-[var(--ret-bg)]">
					<div className="flex w-fit max-w-full flex-wrap gap-px bg-[var(--ret-border)]">
						{KINDS.map((k) => (
							<button
								key={k.id}
								type="button"
								onClick={() => handleKindChange(k.id)}
								className={cn(
									"min-h-10 bg-[var(--ret-bg)] px-3 py-1.5 font-mono text-[11px] transition-colors",
									activeKind === k.id
										? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
										: "bg-[var(--ret-bg)] text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
								)}
							>
								{k.label}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Source status strip */}
			{sources.length > 0 ? (
				<div className="grid border border-[var(--ret-border)] bg-[var(--ret-bg)] sm:grid-cols-2 lg:grid-cols-3">
					{sources.map((s) => (
						<div
							key={s.id}
							className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-[var(--ret-border)] px-3 py-2 font-mono text-[10px] text-[var(--ret-text-muted)] last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
						>
							<span className="truncate uppercase tracking-[0.14em]">{s.label}</span>
							<span className={s.ok ? "text-[var(--ret-text-dim)]" : "text-[var(--ret-red)]"}>
								{s.ok ? s.count : s.error ?? "failed"}
							</span>
						</div>
					))}
				</div>
			) : null}

			{/* Results */}
			{state.phase === "loading" ? (
				<div className="py-16 text-center font-mono text-[12px] text-[var(--ret-text-muted)]">
					searching registries...
				</div>
			) : state.phase === "error" ? (
				<ReticleFrame>
					<div className="p-6 text-center font-mono text-[12px] text-[var(--ret-red)]">
						{state.message}
					</div>
				</ReticleFrame>
			) : items.length === 0 && state.phase === "done" ? (
				<ReticleFrame>
					<div className="p-12 text-center font-mono text-[12px] text-[var(--ret-text-muted)]">
						{query ? `no results for "${query}"` : "type a search query or select a source to browse"}
					</div>
				</ReticleFrame>
			) : (
				<>
					<p className="font-mono text-[11px] text-[var(--ret-text-muted)]">
						showing {Math.min(visible, items.length).toLocaleString()} of{" "}
						{items.length.toLocaleString()}
					</p>
					<div className="grid gap-px border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-2 xl:grid-cols-3">
						{items.slice(0, visible).map((item) => (
							<div key={item.id} className="bg-[var(--ret-bg)] transition-colors hover:bg-[var(--ret-surface)]">
								<div className="flex h-full flex-col gap-3 p-4">
									<div className="flex items-start justify-between gap-3">
										<a
											href={item.homepage ?? "#"}
											target={item.homepage ? "_blank" : undefined}
											rel="noreferrer"
											className={cn(
												"flex min-w-0 flex-1 items-center gap-2",
												item.homepage ? "transition-opacity hover:opacity-80" : "pointer-events-none",
											)}
										>
											<RegistryLogo
												brand={item.brand}
												logoUrl={item.logoUrl}
												kind={item.kind}
												name={item.name}
												homepage={item.homepage}
												size={16}
												tone="mono"
												className="grayscale contrast-125 opacity-80"
											/>
											<span className="min-w-0">
												<span className="block truncate font-mono text-[12px] font-medium text-[var(--ret-text)]">
													{item.name}
												</span>
												<span className="block truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
													{item.provider}
												</span>
											</span>
										</a>
										<ReticleBadge variant="default">
											{item.kind}
										</ReticleBadge>
									</div>
									<p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
										{item.description}
									</p>
									<div className="mt-auto flex items-center gap-2 pt-1">
										{item.installCommand ? (
											<code className="truncate border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ret-text-muted)]">
												{item.installCommand}
											</code>
										) : null}
										{item.stars ? (
											<span className="shrink-0 font-mono text-[9px] text-[var(--ret-text-muted)]">
												{item.stars.toLocaleString()}
											</span>
										) : null}
									</div>
								</div>
							</div>
						))}
					</div>
					{visible < items.length ? (
						<div className="flex justify-center pt-1">
							<button
								type="button"
								onClick={() => setVisible((v) => v + PAGE_SIZE)}
								className="min-h-11 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-accent)]/40 hover:text-[var(--ret-text)]"
							>
								load {Math.min(PAGE_SIZE, items.length - visible)} more
							</button>
						</div>
					) : null}
				</>
			)}

			{/* CTA */}
			{items.length > 0 ? (
				<div className="py-6 text-center">
					<a
						href="/sign-in"
						className="inline-flex min-h-11 items-center gap-2 border border-[var(--ret-border-hover)] bg-[var(--ret-bg)] px-5 py-2.5 font-mono text-[12px] text-[var(--ret-text)] transition-colors hover:bg-[var(--ret-surface)]"
					>
						Sign in to add to your machine
						<ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
					</a>
				</div>
			) : null}
		</div>
	);
}

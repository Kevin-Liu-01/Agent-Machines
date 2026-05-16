"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
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
	{ id: "skills-sh", label: "skills.sh" },
	{ id: "mcp-registry", label: "MCP Registry" },
	{ id: "npm", label: "npm" },
	{ id: "cursor-plugins", label: "Cursor Plugins" },
	{ id: "github-repo", label: "GitHub" },
];

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
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const doSearch = useCallback(
		async (q: string, source: RegistrySourceId | "all", kind: TrustedAddOnKind | "all") => {
			setState({ phase: "loading" });
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
			{/* Search */}
			<input
				type="search"
				placeholder="search skills, MCPs, CLIs, tools, plugins..."
				value={query}
				onChange={(e) => handleQueryChange(e.target.value)}
				className="w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-4 py-3 font-mono text-sm text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
			/>

			{/* Source filter chips */}
			<div className="space-y-2">
				<div className="flex flex-wrap gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
					{SOURCES.map((s) => {
						const count = s.id === "all" ? totalCount : (sourceCountMap[s.id] ?? 0);
						return (
							<button
								key={s.id}
								type="button"
								onClick={() => handleSourceChange(s.id)}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] transition-colors",
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
				<div className="flex flex-wrap gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
					{KINDS.map((k) => (
						<button
							key={k.id}
							type="button"
							onClick={() => handleKindChange(k.id)}
							className={cn(
								"px-3 py-1.5 font-mono text-[11px] transition-colors",
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

			{/* Source status strip */}
			{sources.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{sources.map((s) => (
						<ReticleBadge key={s.id} variant={s.ok ? "success" : "default"} className="text-[9px]">
							{s.label}: {s.ok ? s.count : s.error ?? "failed"}
						</ReticleBadge>
					))}
				</div>
			) : null}

			<ReticleHatch className="h-1 border-t border-b border-[var(--ret-border)]" pitch={6} />

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
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{items.map((item) => (
						<ReticleFrame key={item.id}>
							<div className="flex flex-col gap-2 p-4">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0 flex-1">
										<p className="truncate font-mono text-[12px] font-medium text-[var(--ret-text)]">
											{item.name}
										</p>
										<p className="mt-0.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
											{item.provider}
										</p>
									</div>
									<ReticleBadge variant={item.kind === "mcp" ? "success" : item.kind === "skill" ? "accent" : "default"}>
										{item.kind}
									</ReticleBadge>
								</div>
								<p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
									{item.description}
								</p>
								<div className="mt-auto flex items-center gap-2 pt-1">
									{item.installCommand ? (
										<code className="truncate rounded bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ret-text-muted)]">
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
						</ReticleFrame>
					))}
				</div>
			)}

			{/* CTA */}
			{items.length > 0 ? (
				<div className="py-6 text-center">
					<a
						href="/sign-in"
						className="inline-block border border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] px-5 py-2.5 font-mono text-[12px] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20"
					>
						Sign in to add to your machine
					</a>
				</div>
			) : null}
		</div>
	);
}

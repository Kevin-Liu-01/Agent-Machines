"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";
import type { RegistryItem, RegistrySourceId, SourceStatus } from "@/lib/dashboard/registry";

import { RegistryCard } from "./RegistryCard";

type Props = {
	installedIds: string[];
};

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
	{ id: "url-manifest", label: "URL Manifest" },
];

const KINDS: Array<{ id: TrustedAddOnKind | "all"; label: string }> = [
	{ id: "all", label: "All kinds" },
	{ id: "skill", label: "Skill" },
	{ id: "mcp", label: "MCP" },
	{ id: "cli", label: "CLI" },
	{ id: "tool", label: "Tool" },
	{ id: "plugin", label: "Plugin" },
	{ id: "provider", label: "Provider" },
	{ id: "source", label: "Source" },
];

export function RegistryBrowser({ installedIds }: Props) {
	const [query, setQuery] = useState("");
	const [activeSource, setActiveSource] = useState<RegistrySourceId | "all">("all");
	const [activeKind, setActiveKind] = useState<TrustedAddOnKind | "all">("all");
	const [state, setState] = useState<SearchState>({ phase: "idle" });
	const [urlInput, setUrlInput] = useState("");
	const [showUrlDrawer, setShowUrlDrawer] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const installedSet = useMemo(() => new Set(installedIds), [installedIds]);

	const doSearch = useCallback(
		async (q: string, source: RegistrySourceId | "all", kind: TrustedAddOnKind | "all") => {
			setState({ phase: "loading" });
			try {
				const params = new URLSearchParams();
				if (q) params.set("q", q);
				if (source !== "all") params.set("source", source);
				if (kind !== "all") params.set("kind", kind);
				const res = await fetch(`/api/dashboard/registry/search?${params.toString()}`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = (await res.json()) as { items: RegistryItem[]; sources: SourceStatus[] };
				const items = body.items.map((item) => ({
					...item,
					installed: item.installed || installedSet.has(item.id) || installedSet.has(item.name),
				}));
				setState({ phase: "done", items, sources: body.sources });
			} catch (err) {
				setState({
					phase: "error",
					message: err instanceof Error ? err.message : "Search failed",
				});
			}
		},
		[installedSet],
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

	function handleUrlSearch() {
		if (!urlInput.trim()) return;
		const isGitHub = urlInput.includes("github.com/");
		setQuery(urlInput);
		setActiveSource(isGitHub ? "github-repo" : "url-manifest");
		void doSearch(urlInput, isGitHub ? "github-repo" : "url-manifest", activeKind);
		setShowUrlDrawer(false);
	}

	async function handleAdd(item: RegistryItem) {
		const res = await fetch("/api/dashboard/registry/add", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ item }),
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			throw new Error(body.error ?? `HTTP ${res.status}`);
		}
	}

	async function handleRemove(itemId: string) {
		const res = await fetch("/api/dashboard/registry/remove", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ itemId }),
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			throw new Error(body.error ?? `HTTP ${res.status}`);
		}
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
		<div className="space-y-5 px-5 py-5">
			{/* Search + URL import */}
			<div className="flex flex-wrap items-end gap-3">
				<div className="flex-1">
					<input
						type="search"
						placeholder="search skills, MCPs, CLIs, tools..."
						value={query}
						onChange={(e) => handleQueryChange(e.target.value)}
						className="w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
					/>
				</div>
				<button
					type="button"
					onClick={() => setShowUrlDrawer(!showUrlDrawer)}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[11px] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-purple)]/40 hover:text-[var(--ret-text)]"
				>
					+ add URL
				</button>
			</div>

			{showUrlDrawer ? (
				<ReticleFrame>
					<div className="p-3">
						<ReticleLabel>IMPORT FROM URL</ReticleLabel>
						<p className="mt-1 text-[11px] text-[var(--ret-text-dim)]">
							Paste a GitHub repo URL or a JSON manifest URL to discover skills, MCPs, and tools.
						</p>
						<div className="mt-2 flex gap-2">
							<input
								type="url"
								placeholder="https://github.com/owner/repo or https://example.com/manifest.json"
								value={urlInput}
								onChange={(e) => setUrlInput(e.target.value)}
								onKeyDown={(e) => { if (e.key === "Enter") handleUrlSearch(); }}
								className="flex-1 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1.5 font-mono text-[11px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
							/>
							<button
								type="button"
								onClick={handleUrlSearch}
								className="border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-3 py-1.5 font-mono text-[11px] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20"
							>
								import
							</button>
						</div>
					</div>
				</ReticleFrame>
			) : null}

			{/* Source filter chips */}
			<div className="space-y-2">
				<div className="flex flex-wrap gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
					{SOURCES.map((s) => {
						const count =
							s.id === "all" ? totalCount : (sourceCountMap[s.id] ?? 0);
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
									<span className="text-[10px] text-[var(--ret-text-muted)]">
										{count}
									</span>
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
						<ReticleBadge
							key={s.id}
							variant={s.ok ? "success" : "default"}
							className="text-[9px]"
						>
							{s.label}: {s.ok ? s.count : s.error ?? "failed"}
						</ReticleBadge>
					))}
				</div>
			) : null}

			<ReticleHatch className="h-1 border-t border-b border-[var(--ret-border)]" pitch={6} />

			{/* Results */}
			{state.phase === "loading" ? (
				<div className="py-12 text-center font-mono text-[12px] text-[var(--ret-text-muted)]">
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
					<div className="p-8 text-center font-mono text-[12px] text-[var(--ret-text-muted)]">
						{query
							? `no results for "${query}"`
							: "type a search query or select a source to browse"}
					</div>
				</ReticleFrame>
			) : (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{items.map((item) => (
						<RegistryCard
							key={item.id}
							item={item}
							onAdd={handleAdd}
							onRemove={handleRemove}
						/>
					))}
				</div>
			)}
		</div>
	);
}

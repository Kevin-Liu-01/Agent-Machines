"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, Download, Plus, Wrench, Plug2, Sparkles } from "@/components/ui/icons";
import { useCallback, useEffect, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { cn } from "@/lib/cn";
import type { MemoryBundleSource } from "@/lib/user-config/schema";
import { DashboardDialog } from "./DashboardDialog";
import { LibrarySearch } from "./LibrarySearch";

type BundleSummary = {
	id: string;
	name: string;
	description: string;
	source: MemoryBundleSource;
	counts: { skills: number; tools: number; mcps: number };
	updatedAt: string;
};

const SOURCE_BADGE: Record<MemoryBundleSource, "accent" | "success" | "default"> = {
	default: "accent",
	custom: "success",
	imported: "default",
};

export function MemoryLibrary() {
	const router = useRouter();
	const [bundles, setBundles] = useState<BundleSummary[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<"none" | "new" | "import">("none");
	const [busy, setBusy] = useState(false);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setError(null);
		setLoading(true);
		try {
			const r = await fetch("/api/dashboard/memory", { cache: "no-store" });
			const body = (await r.json()) as { ok?: boolean; bundles?: BundleSummary[]; error?: string };
			if (!r.ok || !body.ok || !Array.isArray(body.bundles)) throw new Error(body.error ?? "Could not load memory bundles. Please try again.");
			setBundles(body.bundles);
		} catch (err) {
			setError(err instanceof Error ? err.message : "load_failed");
			setBundles([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const createBundle = useCallback(
		async (name: string) => {
			if (busy) return;
			setBusy(true);
			setError(null);
			try {
				const r = await fetch("/api/dashboard/memory", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name }),
				});
				const body = (await r.json()) as { ok?: boolean; bundle?: { id: string }; error?: string };
				if (!r.ok || !body.ok || typeof body.bundle?.id !== "string" || !body.bundle.id.trim()) throw new Error(body.error ?? "Could not save this memory bundle. Your input is still here.");
				router.push(`/dashboard/memory/${encodeURIComponent(body.bundle.id)}`);
			} catch (failure) {
				setError(failure instanceof Error ? failure.message : "Could not save this memory bundle. Try again.");
			} finally {
				setBusy(false);
			}
		},
		[router, busy],
	);

	const importBundle = useCallback(
		async (name: string, text: string) => {
			if (busy) return;
			setBusy(true);
			setError(null);
			try {
				const r = await fetch("/api/dashboard/memory/import", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, text }),
				});
				const body = (await r.json()) as { ok?: boolean; bundle?: { id: string }; error?: string };
				if (!r.ok || !body.ok || typeof body.bundle?.id !== "string" || !body.bundle.id.trim()) throw new Error(body.error ?? "Could not save this memory bundle. Your input is still here.");
				router.push(`/dashboard/memory/${encodeURIComponent(body.bundle.id)}`);
			} catch (failure) {
				setError(failure instanceof Error ? failure.message : "Could not save this memory bundle. Try again.");
			} finally {
				setBusy(false);
			}
		},
		[router, busy],
	);

	if (!bundles || (loading && bundles.length === 0)) {
		return (
			<DashboardLoadingState label="Loading memory bundles…" />
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<LibrarySearch value={query} onChange={setQuery} label="Search memory" />
				<span className="text-sm text-[var(--ret-text-muted)]">
					{bundles.length} bundle{bundles.length === 1 ? "" : "s"}
				</span>
				<div className="flex items-center gap-2">
					<ReticleButton variant="secondary" size="sm" onClick={() => { setError(null); setMode("import"); }}>
						<Download className="h-3.5 w-3.5" strokeWidth={1.75} /> Import
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={() => { setError(null); setMode("new"); }}>
						<Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> New bundle
					</ReticleButton>
				</div>
			</div>

			{error && mode === "none" ? (
				<div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-[var(--ret-red)]/30 p-4 text-sm text-[var(--ret-red)]">{error}<button type="button" onClick={() => void load()} className="underline underline-offset-4">Try again</button></div>
			) : null}

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{bundles.filter(b => `${b.name} ${b.description}`.toLowerCase().includes(query.trim().toLowerCase())).map((b) => (
					<Link key={b.id} href={`/dashboard/memory/${b.id}`} className="group">
						<ReticleFrame className="h-full p-4 transition-colors group-hover:bg-[var(--ret-surface)]">
							<div className="mb-2 flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<Brain className="h-4 w-4 shrink-0 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
									<span className="truncate text-base font-medium text-[var(--ret-text)]">{b.name}</span>
								</div>
								<ReticleBadge variant={SOURCE_BADGE[b.source]}>{b.source}</ReticleBadge>
							</div>
							<p className="line-clamp-3 min-h-[3em] text-sm leading-6 text-[var(--ret-text-dim)]">
								{b.description || "No description."}
							</p>
							<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ret-text-muted)]">
								<span className="flex items-center gap-1"><Sparkles className="h-3 w-3" strokeWidth={1.75} /> {b.counts.skills} skill{b.counts.skills === 1 ? "" : "s"}</span>
								<span className="flex items-center gap-1"><Wrench className="h-3 w-3" strokeWidth={1.75} /> {b.counts.tools} tool{b.counts.tools === 1 ? "" : "s"}</span>
								<span className="flex items-center gap-1"><Plug2 className="h-3 w-3" strokeWidth={1.75} /> {b.counts.mcps} MCP</span>
							</div>
						</ReticleFrame>
					</Link>
				))}
			</div>

			{!error && !bundles.some(b => `${b.name} ${b.description}`.toLowerCase().includes(query.trim().toLowerCase())) ? <div role="status" className="rounded-lg border border-dashed border-[var(--ret-border)] p-8 text-center"><Brain className="mx-auto mb-3 size-7 text-[var(--ret-text-muted)]" aria-hidden="true" /><h2 className="text-lg font-medium">{query.trim() ? "No matching memory bundles" : "Give your agent reusable context"}</h2><p className="mt-2 text-sm text-[var(--ret-text-dim)]">{query.trim() ? "Try another name or clear your search." : "Save instructions once, then use them across your setups."}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{query.trim() ? <ReticleButton variant="secondary" onClick={() => setQuery("")}>Clear search</ReticleButton> : <><ReticleButton variant="primary" onClick={() => { setError(null); setMode("new"); }}>Create a memory bundle</ReticleButton><ReticleButton variant="ghost" onClick={() => { setError(null); setMode("import"); }}>Import instructions</ReticleButton></>}</div></div> : null}

			{mode === "new" ? (
				<NameModal
					title="New memory bundle"
					error={error}
					placeholder="bundle name (e.g. code-review memory)"
					busy={busy}
					onCancel={() => setMode("none")}
					onSubmit={(name) => void createBundle(name)}
				/>
			) : null}
			{mode === "import" ? (
				<ImportModal error={error} busy={busy} onCancel={() => setMode("none")} onSubmit={importBundle} />
			) : null}
		</div>
	);
}

const inputCls = cn(
	"min-h-11 w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2",
	"text-sm text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
	"focus:border-[var(--ret-accent)] focus:outline-none",
);

function NameModal({
	error,
	title,
	placeholder,
	busy,
	onCancel,
	onSubmit,
}: {
	title: string;
	error: string | null;
	placeholder: string;
	busy: boolean;
	onCancel: () => void;
	onSubmit: (name: string) => void;
}) {
	const [name, setName] = useState("");
	return (
		<DashboardDialog title={title} onClose={onCancel} busy={busy}>
			{error ? <p role="alert" className="text-sm text-[var(--ret-red)]">{error}</p> : null}
			<label htmlFor="memory-name" className="block text-sm font-medium">Name</label>
			<input
				id="memory-name"
				className={inputCls}
				placeholder={placeholder}
				value={name}
				autoFocus
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && name.trim() && !busy) onSubmit(name.trim());
				}}
			/>
			<div className="mt-3 flex items-center gap-2">
				<ReticleButton variant="primary" size="sm" disabled={!name.trim() || busy} onClick={() => onSubmit(name.trim())}>
					{busy ? "creating…" : "Create"}
				</ReticleButton>
				<button type="button" disabled={busy} onClick={onCancel} className="font-mono text-[13px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
					cancel
				</button>
			</div>
		</DashboardDialog>
	);
}

function ImportModal({
	error,
	busy,
	onCancel,
	onSubmit,
}: {
	error: string | null;
	busy: boolean;
	onCancel: () => void;
	onSubmit: (name: string, text: string) => void;
}) {
	const [name, setName] = useState("");
	const [text, setText] = useState("");
	return (
		<DashboardDialog title="Import instructions" onClose={onCancel} busy={busy}>
			{error ? <p role="alert" className="text-sm text-[var(--ret-red)]">{error}</p> : null}
			<p className="mb-3 text-[13px] text-[var(--ret-text-dim)]">
				Paste a CLAUDE.md, AGENTS.md, .cursor rules, or any system prompt. It becomes a new bundle you can refine.
			</p>
			<label htmlFor="import-name" className="block text-sm font-medium">Name (optional)</label>
			<input id="import-name" className={cn(inputCls, "mb-2")} placeholder="bundle name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
			<label htmlFor="import-text" className="block text-sm font-medium">Instructions</label>
			<textarea
				id="import-text"
				className={cn(inputCls, "min-h-[200px] resize-y leading-relaxed")}
				placeholder="paste your existing setup here…"
				value={text}
				autoFocus
				onChange={(e) => setText(e.target.value)}
			/>
			<div className="mt-3 flex items-center gap-2">
				<ReticleButton variant="primary" size="sm" disabled={!text.trim() || busy} onClick={() => onSubmit(name.trim(), text)}>
					{busy ? "importing…" : "Import"}
				</ReticleButton>
				<button type="button" disabled={busy} onClick={onCancel} className="font-mono text-[13px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
					cancel
				</button>
			</div>
		</DashboardDialog>
	);
}

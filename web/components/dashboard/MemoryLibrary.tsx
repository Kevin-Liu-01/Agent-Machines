"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, Download, Plus, Wrench, Plug2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { MemoryBundleSource } from "@/lib/user-config/schema";

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

	const load = useCallback(async () => {
		setError(null);
		try {
			const r = await fetch("/api/dashboard/memory", { cache: "no-store" });
			const body = (await r.json()) as { ok?: boolean; bundles?: BundleSummary[]; error?: string };
			if (!r.ok || !body.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
			setBundles(body.bundles ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "load_failed");
			setBundles([]);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const createBundle = useCallback(
		async (name: string) => {
			setBusy(true);
			try {
				const r = await fetch("/api/dashboard/memory", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name }),
				});
				const body = (await r.json()) as { ok?: boolean; bundle?: { id: string } };
				if (body.ok && body.bundle) router.push(`/dashboard/memory/${body.bundle.id}`);
			} finally {
				setBusy(false);
			}
		},
		[router],
	);

	const importBundle = useCallback(
		async (name: string, text: string) => {
			setBusy(true);
			try {
				const r = await fetch("/api/dashboard/memory/import", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, text }),
				});
				const body = (await r.json()) as { ok?: boolean; bundle?: { id: string } };
				if (body.ok && body.bundle) router.push(`/dashboard/memory/${body.bundle.id}`);
			} finally {
				setBusy(false);
			}
		},
		[router],
	);

	if (!bundles) {
		return (
			<div className="py-12">
				<BrailleSpinner name="orbit" label="loading memory bundles" className="text-[11px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					{bundles.length} bundle{bundles.length === 1 ? "" : "s"}
				</span>
				<div className="flex items-center gap-2">
					<ReticleButton variant="secondary" size="sm" onClick={() => setMode("import")}>
						<Download className="h-3.5 w-3.5" strokeWidth={1.75} /> Import
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={() => setMode("new")}>
						<Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> New bundle
					</ReticleButton>
				</div>
			</div>

			{error ? (
				<p className="font-mono text-[11px] text-[var(--ret-red)]">{error}</p>
			) : null}

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{bundles.map((b) => (
					<Link key={b.id} href={`/dashboard/memory/${b.id}`} className="group">
						<ReticleFrame className="h-full p-4 transition-colors group-hover:bg-[var(--ret-surface)]">
							<div className="mb-2 flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<Brain className="h-4 w-4 shrink-0 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
									<span className="truncate text-[13px] text-[var(--ret-text)]">{b.name}</span>
								</div>
								<ReticleBadge variant={SOURCE_BADGE[b.source]}>{b.source}</ReticleBadge>
							</div>
							<p className="line-clamp-2 min-h-[2.4em] text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
								{b.description || "No description."}
							</p>
							<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
								<span className="flex items-center gap-1"><Sparkles className="h-3 w-3" strokeWidth={1.75} /> {b.counts.skills} skills</span>
								<span className="flex items-center gap-1"><Wrench className="h-3 w-3" strokeWidth={1.75} /> {b.counts.tools} tools</span>
								<span className="flex items-center gap-1"><Plug2 className="h-3 w-3" strokeWidth={1.75} /> {b.counts.mcps} MCP</span>
							</div>
						</ReticleFrame>
					</Link>
				))}
			</div>

			{mode === "new" ? (
				<NameModal
					title="New memory bundle"
					placeholder="bundle name (e.g. code-review memory)"
					busy={busy}
					onCancel={() => setMode("none")}
					onSubmit={(name) => void createBundle(name)}
				/>
			) : null}
			{mode === "import" ? (
				<ImportModal busy={busy} onCancel={() => setMode("none")} onSubmit={importBundle} />
			) : null}
		</div>
	);
}

function Modal({ children }: { children: React.ReactNode }) {
	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12dvh]">
			<div className="w-full max-w-[560px] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
				{children}
			</div>
		</div>
	);
}

const inputCls = cn(
	"w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1.5",
	"font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
	"focus:border-[var(--ret-accent)] focus:outline-none",
);

function NameModal({
	title,
	placeholder,
	busy,
	onCancel,
	onSubmit,
}: {
	title: string;
	placeholder: string;
	busy: boolean;
	onCancel: () => void;
	onSubmit: (name: string) => void;
}) {
	const [name, setName] = useState("");
	return (
		<Modal>
			<p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">{title}</p>
			<input
				className={inputCls}
				placeholder={placeholder}
				value={name}
				autoFocus
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
				}}
			/>
			<div className="mt-3 flex items-center gap-2">
				<ReticleButton variant="primary" size="sm" disabled={!name.trim() || busy} onClick={() => onSubmit(name.trim())}>
					{busy ? "creating…" : "Create"}
				</ReticleButton>
				<button type="button" onClick={onCancel} className="font-mono text-[11px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
					cancel
				</button>
			</div>
		</Modal>
	);
}

function ImportModal({
	busy,
	onCancel,
	onSubmit,
}: {
	busy: boolean;
	onCancel: () => void;
	onSubmit: (name: string, text: string) => void;
}) {
	const [name, setName] = useState("");
	const [text, setText] = useState("");
	return (
		<Modal>
			<p className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">Import existing setup</p>
			<p className="mb-3 text-[11px] text-[var(--ret-text-dim)]">
				Paste a CLAUDE.md, AGENTS.md, .cursor rules, or any system prompt. It becomes a new bundle you can refine.
			</p>
			<input className={cn(inputCls, "mb-2")} placeholder="bundle name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
			<textarea
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
				<button type="button" onClick={onCancel} className="font-mono text-[11px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
					cancel
				</button>
			</div>
		</Modal>
	);
}

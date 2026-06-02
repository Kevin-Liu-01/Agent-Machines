"use client";

import Link from "next/link";
import {
	ChevronLeft,
	Copy,
	Download,
	HardDriveDownload,
	Plug2,
	Sparkles,
	Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { OnMachineMemory } from "@/components/dashboard/OnMachineMemory";
import type { MemoryBundle, MemoryBundleSource } from "@/lib/user-config/schema";

type Ability = { id: string; name: string; description: string };
type Abilities = { skills: Ability[]; tools: Ability[]; mcps: Ability[] };

type MachineOpt = { id: string; name: string };

const SOURCE_BADGE: Record<MemoryBundleSource, "accent" | "success" | "default"> = {
	default: "accent",
	custom: "success",
	imported: "default",
};

const DOC_FIELDS: ReadonlyArray<{ key: keyof MemoryBundle["docs"]; label: string; hint: string }> = [
	{ key: "soul", label: "Persona & voice", hint: "SOUL.md — who the agent is, how it talks" },
	{ key: "agentDocs", label: "Operating rules & agent docs", hint: "AGENTS.md — principles, routing, hard rules" },
	{ key: "memory", label: "Working memory", hint: "MEMORY.md — durable facts, env, context" },
	{ key: "user", label: "Operator profile", hint: "USER.md — who you are, preferences" },
];

export function MemoryBundleEditor({ bundleId }: { bundleId: string }) {
	const [bundle, setBundle] = useState<MemoryBundle | null>(null);
	const [abilities, setAbilities] = useState<Abilities | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [exportText, setExportText] = useState<string | null>(null);
	const [exportName, setExportName] = useState("memory.md");
	const [machines, setMachines] = useState<MachineOpt[]>([]);
	const [installTarget, setInstallTarget] = useState("");
	const [installMsg, setInstallMsg] = useState<string | null>(null);
	const [installing, setInstalling] = useState(false);

	const load = useCallback(async () => {
		setError(null);
		try {
			const r = await fetch(`/api/dashboard/memory/${encodeURIComponent(bundleId)}`, {
				cache: "no-store",
			});
			const body = (await r.json()) as {
				ok?: boolean;
				bundle?: MemoryBundle;
				abilities?: Abilities;
				error?: string;
			};
			if (!r.ok || !body.ok || !body.bundle) throw new Error(body.error ?? `HTTP ${r.status}`);
			setBundle(body.bundle);
			setAbilities(body.abilities ?? { skills: [], tools: [], mcps: [] });
		} catch (err) {
			setError(err instanceof Error ? err.message : "load_failed");
		}
	}, [bundleId]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		fetch("/api/dashboard/machines", { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<{ machines?: MachineOpt[] }>) : null))
			.then((j) => {
				const list = j?.machines ?? [];
				setMachines(list);
				if (list[0]) setInstallTarget(list[0].id);
			})
			.catch(() => {});
	}, []);

	const setDoc = (key: keyof MemoryBundle["docs"], value: string) => {
		setBundle((b) => (b ? { ...b, docs: { ...b.docs, [key]: value } } : b));
	};

	const save = useCallback(async () => {
		if (!bundle) return;
		setSaving(true);
		try {
			const r = await fetch(`/api/dashboard/memory/${encodeURIComponent(bundleId)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: bundle.name,
					description: bundle.description,
					docs: bundle.docs,
					skillIds: bundle.skillIds,
					toolIds: bundle.toolIds,
					mcpServerIds: bundle.mcpServerIds,
				}),
			});
			if (r.ok) {
				setSavedAt(Date.now());
				await load();
			}
		} finally {
			setSaving(false);
		}
	}, [bundle, bundleId, load]);

	const doExport = useCallback(async () => {
		const r = await fetch(`/api/dashboard/memory/${encodeURIComponent(bundleId)}/export`, {
			method: "POST",
		});
		const body = (await r.json()) as { ok?: boolean; prompt?: string; filename?: string };
		if (body.ok && body.prompt) {
			setExportText(body.prompt);
			setExportName(body.filename ?? "memory.md");
		}
	}, [bundleId]);

	const doInstall = useCallback(async () => {
		if (!installTarget) return;
		setInstalling(true);
		setInstallMsg(null);
		try {
			const r = await fetch(`/api/dashboard/memory/${encodeURIComponent(bundleId)}/install`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId: installTarget }),
			});
			const body = (await r.json()) as { ok?: boolean; message?: string; error?: string };
			setInstallMsg(body.ok ? "Installed to machine." : body.message ?? body.error ?? "install_failed");
		} catch (err) {
			setInstallMsg(err instanceof Error ? err.message : "install_failed");
		} finally {
			setInstalling(false);
		}
	}, [bundleId, installTarget]);

	if (error) {
		return (
			<div className="px-5 py-8">
				<p className="font-mono text-[12px] text-[var(--ret-red)]">{error}</p>
				<Link href="/dashboard/memory" className="mt-2 inline-block font-mono text-[11px] text-[var(--ret-accent)] hover:underline">
					← back to Memory
				</Link>
			</div>
		);
	}
	if (!bundle || !abilities) {
		return (
			<div className="px-5 py-12">
				<BrailleSpinner name="orbit" label="loading bundle" className="text-[11px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
				<div className="flex min-w-0 items-center gap-3">
					<Link href="/dashboard/memory" className="text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
						<ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
					</Link>
					<input
						value={bundle.name}
						onChange={(e) => setBundle({ ...bundle, name: e.target.value })}
						className="min-w-0 border-0 bg-transparent text-[18px] tracking-tight text-[var(--ret-text)] focus:outline-none"
						style={{ fontFamily: "var(--font-display-serif)" }}
					/>
					<ReticleBadge variant={SOURCE_BADGE[bundle.source]}>{bundle.source}</ReticleBadge>
				</div>
				<div className="flex items-center gap-2">
					{savedAt ? (
						<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">saved</span>
					) : null}
					<ReticleButton variant="secondary" size="sm" onClick={() => void doExport()}>
						<Download className="h-3.5 w-3.5" strokeWidth={1.75} /> Export
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
						{saving ? "saving…" : "Save"}
					</ReticleButton>
				</div>
			</div>

			<div className="space-y-5 px-5 py-5">
				<input
					value={bundle.description}
					onChange={(e) => setBundle({ ...bundle, description: e.target.value })}
					placeholder="short description…"
					className={cn(
						"w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1.5",
						"text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
						"focus:border-[var(--ret-accent)] focus:outline-none",
					)}
				/>

				{/* Memory docs */}
				<section className="space-y-3">
					<SectionLabel label="Memory" hint="persona · rules · context · operator" />
					{DOC_FIELDS.map((f) => (
						<DocField
							key={f.key}
							label={f.label}
							hint={f.hint}
							value={bundle.docs[f.key]}
							onChange={(v) => setDoc(f.key, v)}
						/>
					))}
				</section>

				{/* Abilities */}
				<section className="space-y-3">
					<SectionLabel label="Abilities" hint="what this memory can do" />
					<div className="grid gap-3 lg:grid-cols-3">
						<AbilityColumn
							icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />}
							title="Skills"
							items={abilities.skills}
							all={bundle.skillIds.includes("*")}
							onToggleAll={(on) => setBundle({ ...bundle, skillIds: on ? ["*"] : [] })}
						/>
						<AbilityColumn
							icon={<Wrench className="h-3.5 w-3.5" strokeWidth={1.75} />}
							title="Tools"
							items={abilities.tools}
							all={bundle.toolIds.includes("*")}
							onToggleAll={(on) => setBundle({ ...bundle, toolIds: on ? ["*"] : [] })}
						/>
						<AbilityColumn
							icon={<Plug2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
							title="MCP servers"
							items={abilities.mcps}
							all={bundle.mcpServerIds.includes("*")}
							onToggleAll={(on) => setBundle({ ...bundle, mcpServerIds: on ? ["*"] : [] })}
						/>
					</div>
				</section>

				{/* Install + on-machine */}
				<section className="space-y-3">
					<SectionLabel label="Install" hint="write this memory into an agent on a machine" />
					<ReticleFrame className="flex flex-wrap items-center gap-2 p-3">
						<HardDriveDownload className="h-4 w-4 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
						<select
							value={installTarget}
							onChange={(e) => setInstallTarget(e.target.value)}
							className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1 font-mono text-[11px] text-[var(--ret-text)] focus:border-[var(--ret-accent)] focus:outline-none"
						>
							{machines.length === 0 ? <option value="">no machines</option> : null}
							{machines.map((m) => (
								<option key={m.id} value={m.id}>
									{m.name}
								</option>
							))}
						</select>
						<ReticleButton variant="secondary" size="sm" disabled={!installTarget || installing} onClick={() => void doInstall()}>
							{installing ? "installing…" : "Install to machine"}
						</ReticleButton>
						{installMsg ? (
							<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">{installMsg}</span>
						) : null}
					</ReticleFrame>
					<OnMachineMemory machineId={installTarget || null} bundle={bundle} />
				</section>
			</div>

			{exportText !== null ? (
				<ExportModal text={exportText} filename={exportName} onClose={() => setExportText(null)} />
			) : null}
		</div>
	);
}

function SectionLabel({ label, hint }: { label: string; hint: string }) {
	return (
		<div className="flex items-baseline justify-between gap-2 border-b border-[var(--ret-border)] pb-1.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">{label}</span>
			<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{hint}</span>
		</div>
	);
}

function DocField({
	label,
	hint,
	value,
	onChange,
}: {
	label: string;
	hint: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div>
			<div className="mb-1 flex items-baseline justify-between gap-2">
				<span className="text-[12px] text-[var(--ret-text)]">{label}</span>
				<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{hint}</span>
			</div>
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={cn(
					"min-h-[110px] w-full resize-y border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-2",
					"font-mono text-[11px] leading-relaxed text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
					"focus:border-[var(--ret-accent)] focus:outline-none",
				)}
				placeholder={`${label}…`}
			/>
		</div>
	);
}

function AbilityColumn({
	icon,
	title,
	items,
	all,
	onToggleAll,
}: {
	icon: React.ReactNode;
	title: string;
	items: Ability[];
	all: boolean;
	onToggleAll: (on: boolean) => void;
}) {
	return (
		<ReticleFrame className="flex flex-col p-3">
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{icon} {title} <span className="text-[var(--ret-text-dim)]">{items.length}</span>
				</span>
				<label className="flex cursor-pointer items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					<input type="checkbox" checked={all} onChange={(e) => onToggleAll(e.target.checked)} className="accent-[var(--ret-accent)]" />
					all
				</label>
			</div>
			<div className="max-h-44 space-y-0.5 overflow-y-auto">
				{items.length === 0 ? (
					<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">none selected</p>
				) : (
					items.map((it) => (
						<p key={it.id} className="truncate font-mono text-[10px] text-[var(--ret-text-dim)]" title={it.description}>
							{it.name}
						</p>
					))
				)}
			</div>
		</ReticleFrame>
	);
}

function ExportModal({ text, filename, onClose }: { text: string; filename: string; onClose: () => void }) {
	const [copied, setCopied] = useState(false);
	const download = () => {
		const blob = new Blob([text], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	};
	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8dvh]">
			<div className="flex max-h-[80dvh] w-full max-w-[720px] flex-col border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
				<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-2.5">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						pastable prompt
					</span>
					<div className="flex items-center gap-2">
						<ReticleButton
							variant="secondary"
							size="sm"
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(text);
									setCopied(true);
									setTimeout(() => setCopied(false), 1500);
								} catch {
									/* clipboard unavailable */
								}
							}}
						>
							<Copy className="h-3.5 w-3.5" strokeWidth={1.75} /> {copied ? "copied" : "copy"}
						</ReticleButton>
						<ReticleButton variant="secondary" size="sm" onClick={download}>
							<Download className="h-3.5 w-3.5" strokeWidth={1.75} /> .md
						</ReticleButton>
						<button type="button" onClick={onClose} className="font-mono text-[11px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
							close
						</button>
					</div>
				</div>
				<textarea
					readOnly
					value={text}
					className="min-h-[50dvh] flex-1 resize-none border-0 bg-[var(--ret-bg)] p-4 font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)] focus:outline-none"
				/>
			</div>
		</div>
	);
}

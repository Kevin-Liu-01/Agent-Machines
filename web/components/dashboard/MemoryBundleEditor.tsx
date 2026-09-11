"use client";

import Link from "next/link";
import {
	ChevronLeft,
	Copy,
	Download,
	HardDriveDownload,
	Plug2,
	Plus,
	Sparkles,
	Wrench,
} from "@/components/ui/icons";
import { useCallback, useEffect, useRef, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleSelect } from "@/components/reticle/ReticleSelect";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { cn } from "@/lib/cn";
import { OnMachineMemory } from "@/components/dashboard/OnMachineMemory";
import type { MemoryBundle, MemoryBundleSource } from "@/lib/user-config/schema";

type Ability = { id: string; name: string; description: string };
type Abilities = { skills: Ability[]; tools: Ability[]; mcps: Ability[] };

type MachineOpt = { id: string; name: string; archived?: boolean };

const WILDCARD = "*";

function abilityChecked(ids: string[], id: string): boolean {
	return ids.includes(WILDCARD) || ids.includes(id);
}

/** Toggle one ability id, collapsing to ["*"] when the whole pool is selected. */
function toggleAbility(ids: string[], id: string, allIds: string[]): string[] {
	const base = ids.includes(WILDCARD) ? allIds : ids;
	const set = new Set(base);
	if (set.has(id)) set.delete(id);
	else set.add(id);
	if (allIds.length > 0 && allIds.every((x) => set.has(x))) return [WILDCARD];
	return [...set];
}

const SOURCE_BADGE: Record<MemoryBundleSource, "accent" | "success" | "default"> = {
	default: "accent",
	custom: "success",
	imported: "default",
};

const DOC_FIELDS: ReadonlyArray<{ key: keyof MemoryBundle["docs"]; label: string; hint: string }> = [
	{ key: "soul", label: "Persona & voice", hint: "SOUL.md — who the agent is, how it talks" },
	{ key: "agentDocs", label: "Operating rules & agent docs", hint: "AGENTS.md — principles, dispatch, hard rules" },
	{ key: "memory", label: "Working memory", hint: "MEMORY.md — durable facts, env, context" },
	{ key: "user", label: "Operator profile", hint: "USER.md — who you are, preferences" },
];

export function MemoryBundleEditor({ bundleId }: { bundleId: string }) {
	const [bundle, setBundle] = useState<MemoryBundle | null>(null);
	const [abilities, setAbilities] = useState<Abilities | null>(null);
	const [available, setAvailable] = useState<Abilities | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false);
	const [exportText, setExportText] = useState<string | null>(null);
	const [exportName, setExportName] = useState("memory.md");
	const [machines, setMachines] = useState<MachineOpt[]>([]);
	const [machineStatus, setMachineStatus] = useState<"loading" | "ready" | "error">("loading");
	const [machineRetry, setMachineRetry] = useState(0);
	const [installTarget, setInstallTarget] = useState("");
	const [installMsg, setInstallMsg] = useState<string | null>(null);
	const [installing, setInstalling] = useState(false);
	const requestBusy = useRef(false);
	const loadRequest = useRef<AbortController | null>(null);
	const dirty = Boolean(bundle && savedSnapshot !== JSON.stringify(bundle));
	const actionBusy = saving || exporting || installing;

	const load = useCallback(async () => {
		loadRequest.current?.abort();
		const controller = new AbortController();
		loadRequest.current = controller;
		setError(null);
		try {
			const r = await fetch(`/api/dashboard/memory/${encodeURIComponent(bundleId)}`, {
				cache: "no-store",
				signal: controller.signal,
			});
			const body = (await r.json()) as {
				ok?: boolean;
				bundle?: MemoryBundle;
				abilities?: Abilities;
				available?: Abilities;
				error?: string;
			};
			if (controller.signal.aborted) return;
			if (!r.ok || !body.ok || !body.bundle) throw new Error(body.error ?? `HTTP ${r.status}`);
			setBundle(body.bundle);
			setSavedSnapshot(JSON.stringify(body.bundle));
			setAbilities(body.abilities ?? { skills: [], tools: [], mcps: [] });
			setAvailable(body.available ?? { skills: [], tools: [], mcps: [] });
		} catch (err) {
			if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load this memory bundle.");
		}
	}, [bundleId]);

	useEffect(() => {
		void load();
		return () => loadRequest.current?.abort();
	}, [load]);

	useEffect(() => {
		const controller = new AbortController();
		setMachineStatus("loading");
		fetch("/api/dashboard/machines", { cache: "no-store", signal: controller.signal })
			.then(async (r) => {
				const body = await r.json() as { machines?: MachineOpt[] };
				if (!r.ok || !Array.isArray(body.machines)) throw new Error("Machine list unavailable.");
				return body;
			})
			.then((j) => {
				if (controller.signal.aborted) return;
				const list = (j.machines ?? []).filter(machine => !machine.archived);
				setMachines(list);
				setInstallTarget(current => list.some(machine => machine.id === current) ? current : list[0]?.id ?? "");
				setMachineStatus("ready");
			})
			.catch(() => { if (!controller.signal.aborted) { setMachines([]); setInstallTarget(""); setMachineStatus("error"); } });
		return () => controller.abort();
	}, [machineRetry]);

	const setDoc = (key: keyof MemoryBundle["docs"], value: string) => {
		setBundle((b) => (b ? { ...b, docs: { ...b.docs, [key]: value } } : b));
	};

	const save = useCallback(async () => {
		if (!bundle || bundle.id !== bundleId || requestBusy.current) return;
		requestBusy.current = true;
		setSaving(true);
		setActionError(null);
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
			const body = await r.json() as { ok?: boolean; bundle?: MemoryBundle; error?: string };
			if (!r.ok || !body.ok || body.bundle?.id !== bundleId || typeof body.bundle.name !== "string" || typeof body.bundle.description !== "string" || !body.bundle.docs || DOC_FIELDS.some(field => typeof body.bundle?.docs[field.key] !== "string") || !Array.isArray(body.bundle.skillIds) || !Array.isArray(body.bundle.toolIds) || !Array.isArray(body.bundle.mcpServerIds)) throw new Error(body.error ?? "Could not save this bundle. Your edits are still here.");
			setSavedSnapshot(JSON.stringify(body.bundle));
			// New edits made while the request was pending remain in the editor.
			setBundle(current => current === bundle ? body.bundle! : current);
		} catch (failure) {
			setActionError(failure instanceof Error ? failure.message : "Could not save this bundle. Your edits are still here.");
		} finally {
			requestBusy.current = false;
			setSaving(false);
		}
	}, [bundle, bundleId]);

	const doExport = useCallback(async () => {
		if (requestBusy.current || dirty) return;
		requestBusy.current = true;
		setExporting(true);
		setActionError(null);
		try {
			const r = await fetch(`/api/dashboard/memory/${encodeURIComponent(bundleId)}/export`, { method: "POST" });
			const body = (await r.json()) as { ok?: boolean; prompt?: string; filename?: string; error?: string };
			if (!r.ok || !body.ok || typeof body.prompt !== "string") throw new Error(body.error ?? "Could not export this bundle. Please try again.");
			setExportText(body.prompt);
			setExportName(body.filename ?? "memory.md");
		} catch (failure) {
			setActionError(failure instanceof Error ? failure.message : "Could not export this bundle. Please try again.");
		} finally { requestBusy.current = false; setExporting(false); }
	}, [bundleId, dirty]);

	const doInstall = useCallback(async () => {
		if (requestBusy.current || dirty || machineStatus !== "ready" || !machines.some(machine => machine.id === installTarget && !machine.archived)) return;
		if (!window.confirm("Install the saved memory on this machine? This replaces its existing memory documents.")) return;
		requestBusy.current = true;
		setInstalling(true);
		setInstallMsg(null);
		try {
			const r = await fetch(`/api/dashboard/memory/${encodeURIComponent(bundleId)}/install`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId: installTarget }),
			});
			const body = (await r.json()) as { ok?: boolean; message?: string; error?: string };
			setInstallMsg(r.ok && body.ok ? "Installed to machine." : body.message ?? body.error ?? "Installation failed. Try again.");
		} catch (err) {
			setInstallMsg(err instanceof Error ? err.message : "install_failed");
		} finally {
			requestBusy.current = false;
			setInstalling(false);
		}
	}, [bundleId, installTarget, dirty, machines, machineStatus]);

	if (error) {
		return (
			<EmptyState title="Could not load this memory bundle" description={error} onRetry={() => void load()} action={{ label: "Back to Memory", href: "/dashboard/memory" }} />
		);
	}
	if (!bundle || bundle.id !== bundleId || !abilities || !available) {
		return (
			<div className="px-5 py-6">
				<DashboardLoadingState label="Loading memory bundle…" variant="editor" />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
				<div className="flex min-w-0 items-center gap-3">
					<Link href="/dashboard/memory" aria-label="Back to Memory" className="grid size-11 shrink-0 place-items-center rounded text-[var(--ret-text-muted)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">
						<ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
					</Link>
					<input
						aria-label="Memory bundle name"
						value={bundle.name}
						onChange={(e) => setBundle({ ...bundle, name: e.target.value })}
						className="min-w-0 border-0 bg-transparent text-[18px] tracking-tight text-[var(--ret-text)] focus:outline-none"
						style={{ fontFamily: "var(--font-display-serif)" }}
					/>
					<ReticleBadge variant={SOURCE_BADGE[bundle.source]}>{bundle.source}</ReticleBadge>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span role="status" className="text-sm text-[var(--ret-text-muted)]">{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
					<ReticleButton variant="secondary" size="sm" onClick={() => void doExport()} disabled={actionBusy || dirty}>
						<Download className="h-3.5 w-3.5" aria-hidden="true" /> {exporting ? "Exporting…" : "Export"}
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={() => void save()} disabled={actionBusy}>
						{saving ? "saving…" : "Save"}
					</ReticleButton>
				</div>
			</div>

			<div className="space-y-6 px-[var(--dashboard-gutter,20px)] py-8">
				{actionError ? <p role="alert" className="rounded-md border border-[var(--ret-red)]/30 p-3 text-sm text-[var(--ret-red)]">{actionError}</p> : null}
				<input
					aria-label="Memory bundle description"
					value={bundle.description}
					onChange={(e) => setBundle({ ...bundle, description: e.target.value })}
					placeholder="short description…"
					className={cn(
						"w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1.5",
						"text-sm text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
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
					<div className="flex items-baseline justify-between gap-2 border-b border-[var(--ret-border)] pb-1.5">
						<span className="text-xs font-medium text-[var(--ret-text-muted)]">
							Abilities
						</span>
						<Link
							href="/dashboard/registry"
							className="flex items-center gap-1 text-xs font-medium text-[var(--ret-accent)] hover:underline"
						>
							<Plus className="h-3 w-3" strokeWidth={1.75} /> add from registry
						</Link>
					</div>
					<div className="grid gap-3 lg:grid-cols-3">
						<AbilityColumn
							icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />}
							title="Skills"
							items={available.skills}
							ids={bundle.skillIds}
							emptyFromRegistry
							onToggle={(id) =>
								setBundle({
									...bundle,
									skillIds: toggleAbility(bundle.skillIds, id, available.skills.map((s) => s.id)),
								})
							}
							onToggleAll={(on) => setBundle({ ...bundle, skillIds: on ? ["*"] : [] })}
						/>
						<AbilityColumn
							icon={<Wrench className="h-3.5 w-3.5" strokeWidth={1.75} />}
							title="Tools"
							items={available.tools}
							ids={bundle.toolIds}
							onToggle={(id) =>
								setBundle({
									...bundle,
									toolIds: toggleAbility(bundle.toolIds, id, available.tools.map((t) => t.id)),
								})
							}
							onToggleAll={(on) => setBundle({ ...bundle, toolIds: on ? ["*"] : [] })}
						/>
						<AbilityColumn
							icon={<Plug2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
							title="MCP servers"
							items={available.mcps}
							ids={bundle.mcpServerIds}
							emptyFromRegistry
							onToggle={(id) =>
								setBundle({
									...bundle,
									mcpServerIds: toggleAbility(
										bundle.mcpServerIds,
										id,
										available.mcps.map((m) => m.id),
									),
								})
							}
							onToggleAll={(on) => setBundle({ ...bundle, mcpServerIds: on ? ["*"] : [] })}
						/>
					</div>
				</section>

				{/* Install + on-machine */}
				<section className="space-y-3">
					<SectionLabel label="Install" hint="Replaces this machine's memory documents" />
					{dirty ? <p className="text-sm text-[var(--ret-amber)]">Save changes before exporting or installing.</p> : null}
					{machineStatus === "loading" ? <p role="status" className="text-sm text-[var(--ret-text-muted)]">Loading installation targets…</p> : machineStatus === "error" ? <div role="alert" className="text-sm text-[var(--ret-red)]">Could not load your machines. <button type="button" onClick={() => setMachineRetry(value => value + 1)} className="min-h-11 underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Retry machine list</button></div> : !machines.length ? <p className="text-sm text-[var(--ret-text-muted)]">You can edit memory without a machine. <Link href="/dashboard/setup" className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Set up a machine</Link> to install it.</p> : null}
					<ReticleFrame className="flex flex-wrap items-center gap-2 p-3">
						<HardDriveDownload className="h-4 w-4 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
						<ReticleSelect
							ariaLabel="Install target machine"
							className="w-52"
							value={installTarget}
							onChange={value => { if (!requestBusy.current) { setInstallTarget(value); setInstallMsg(null); } }}
							placeholder={machines.length === 0 ? "no machines" : "pick a machine"}
							options={machines.map((m) => ({ value: m.id, label: m.name }))}
						/>
						<ReticleButton variant="secondary" size="sm" disabled={!installTarget || actionBusy || dirty || machineStatus !== "ready"} onClick={() => void doInstall()}>
							{installing ? "installing…" : "Install to machine"}
						</ReticleButton>
						{installMsg ? (
							<span role="status" className="text-sm text-[var(--ret-text-muted)]">{installMsg}</span>
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
			<span className="text-xs font-medium text-[var(--ret-text-muted)]">{label}</span>
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
				<span className="text-sm text-[var(--ret-text)]">{label}</span>
				<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{hint}</span>
			</div>
			<textarea
				aria-label={label}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={cn(
					"min-h-[110px] w-full resize-y border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-2",
					"font-mono text-[13px] leading-relaxed text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
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
	ids,
	onToggle,
	onToggleAll,
	emptyFromRegistry = false,
}: {
	icon: React.ReactNode;
	title: string;
	items: Ability[];
	ids: string[];
	onToggle: (id: string) => void;
	onToggleAll: (on: boolean) => void;
	emptyFromRegistry?: boolean;
}) {
	const all = ids.includes(WILDCARD);
	const selectedCount = all ? items.length : items.filter((it) => ids.includes(it.id)).length;
	return (
		<ReticleFrame className="flex flex-col p-3">
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="flex items-center gap-1.5 text-xs font-medium text-[var(--ret-text-muted)]">
					{icon} {title}{" "}
					<span className="text-[var(--ret-text-dim)]">
						{selectedCount}/{items.length}
					</span>
				</span>
				<label className="flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ret-text-muted)]">
					<input
						type="checkbox"
						checked={all}
						onChange={(e) => onToggleAll(e.target.checked)}
						className="accent-[var(--ret-accent)]"
					/>
					all
				</label>
			</div>
			<div className="max-h-44 space-y-0.5 overflow-y-auto">
				{items.length === 0 ? (
					<p className="font-mono text-xs text-[var(--ret-text-muted)]">
						{emptyFromRegistry ? (
							<>
								none imported --{" "}
								<Link href="/dashboard/registry" className="text-[var(--ret-accent)] hover:underline">
									add from Registry
								</Link>
							</>
						) : (
							"none available"
						)}
					</p>
				) : (
					items.map((it) => (
						<label
							key={it.id}
							className="flex cursor-pointer items-center gap-1.5 truncate font-mono text-xs text-[var(--ret-text-dim)]"
							title={it.description}
						>
							<input
								type="checkbox"
								checked={abilityChecked(ids, it.id)}
								onChange={() => onToggle(it.id)}
								className="accent-[var(--ret-accent)]"
							/>
							{it.name}
						</label>
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
					<span className="text-xs font-medium text-[var(--ret-text-muted)]">
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
						<button type="button" onClick={onClose} className="font-mono text-[13px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
							close
						</button>
					</div>
				</div>
				<textarea
					readOnly
					value={text}
					className="min-h-[50dvh] flex-1 resize-none border-0 bg-[var(--ret-bg)] p-4 font-mono text-[13px] leading-relaxed text-[var(--ret-text-dim)] focus:outline-none"
				/>
			</div>
		</div>
	);
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Brain, Plug2, Plus, Rocket, SearchOutline as Search, Sparkles } from "@/components/ui/icons";
import { useCallback, useEffect, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { DashboardDialog } from "@/components/dashboard/DashboardDialog";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleSelect, type ReticleSelectOption } from "@/components/reticle/ReticleSelect";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { requiredNativeUpstream } from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";
import type { Preset } from "@/lib/dashboard/presets";
import { workerPresetSeed } from "@/lib/onboarding/preset-selection";
import {
	AGENT_KINDS,
	AGENT_LABEL,
	type AgentKind,
	type Worker,
} from "@/lib/user-config/schema";

type BundleOpt = { id: string; name: string };

/** Worker create source: a curated preset (`preset:<id>`) or an existing memory (`bundle:<id>`). */
type CreateSource = { kind: "preset"; id: string } | { kind: "bundle"; id: string };

const MARK_SET = new Set<string>(["am", "daytona", "nous", "cursor", "openclaw", "anthropic", "openai"]);
function isMark(value: string): value is Mark {
	return MARK_SET.has(value);
}

function presetBrand(brand: string | undefined, size: number) {
	if (!brand) return null;
	if (isMark(brand)) return <Logo mark={brand} size={size} />;
	if (isServiceSlug(brand)) return <ServiceIcon slug={brand} size={size} tone="mono" />;
	return null;
}

export function WorkersLibrary({ presets, initialPresetId }: { presets: Preset[]; initialPresetId?: string }) {
	const router = useRouter();
	const [workers, setWorkers] = useState<Worker[] | null>(null);
	const [bundleNames, setBundleNames] = useState<Record<string, string>>({});
	const [bundles, setBundles] = useState<BundleOpt[]>([]);
	const [seed, setSeed] = useState<{ name: string; sourceValue: string } | null>(() => workerPresetSeed(presets, initialPresetId));
	const [busy, setBusy] = useState(false);
	const [loadWarning, setLoadWarning] = useState<string | null>(null);
	const [createError, setCreateError] = useState<string | null>(null);
	const [workerLoadFailed, setWorkerLoadFailed] = useState(false);
	const [query, setQuery] = useState("");

	const load = useCallback(async () => {
		setLoadWarning(null);
		const [workerResult, memoryResult] = await Promise.allSettled([
			fetch("/api/dashboard/workers", { cache: "no-store" }).then(async (response) => {
				if (!response.ok) throw new Error(`workers HTTP ${response.status}`);
				const payload = await response.json();
				if (!payload.ok || !Array.isArray(payload.workers)) throw new Error("Saved setups are unavailable.");
				return payload;
			}),
			fetch("/api/dashboard/memory", { cache: "no-store" }).then(async (response) => {
				if (!response.ok) throw new Error(`memory HTTP ${response.status}`);
				const payload = await response.json();
				if (!payload.ok || !Array.isArray(payload.bundles)) throw new Error("Memory bundles are unavailable.");
				return payload;
			}),
		]);
		const workerPayload = workerResult.status === "fulfilled" ? workerResult.value : null;
		const memoryPayload = memoryResult.status === "fulfilled" ? memoryResult.value : null;
		setWorkerLoadFailed(!workerPayload);
		if (workerPayload) setWorkers((workerPayload.workers as Worker[]) ?? []);
		setBundleNames((workerPayload?.bundleNames as Record<string, string>) ?? {});
		setBundles(
			((memoryPayload?.bundles as BundleOpt[]) ?? []).map((bundle) => ({
				id: bundle.id,
				name: bundle.name,
			})),
		);
		if (!workerPayload || !memoryPayload) {
			setLoadWarning("Some library data is temporarily unavailable. Presets and retries remain available.");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const create = useCallback(
		async (name: string, agentKind: AgentKind, source: CreateSource, model?: string) => {
			setBusy(true);
			setCreateError(null);
			try {
				const r = await fetch("/api/dashboard/workers", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name,
						agentKind,
						...(model?.trim() ? { model: model.trim() } : {}),
						...(source.kind === "preset"
							? { presetId: source.id }
							: { memoryBundleId: source.id }),
					}),
				});
				const body = (await r.json().catch(() => ({}))) as {
					ok?: boolean;
					worker?: { id: string };
					message?: string;
					error?: string;
				};
				if (!r.ok || !body.ok || !body.worker) {
					throw new Error(body.message ?? body.error ?? `Create failed (HTTP ${r.status}).`);
				}
				router.push(`/dashboard/workers/${encodeURIComponent(body.worker.id)}`);
			} catch (cause) {
				setCreateError(cause instanceof Error ? cause.message : "Agent creation failed.");
			} finally {
				setBusy(false);
			}
		},
		[router],
	);

	const firstSource = presets[0]
		? `preset:${presets[0].id}`
		: bundles[0]
			? `bundle:${bundles[0].id}`
			: "preset:";

	const search = query.trim().toLocaleLowerCase();
	const matchingPresets = presets.filter((preset) => !search || [preset.name, preset.description, preset.category, AGENT_LABEL[preset.agentKind]].some((value) => value.toLocaleLowerCase().includes(search)));
	return (
		<div className={cn("space-y-5")}>
			{loadWarning ? (
				<div className={cn("border border-[var(--ret-amber)]/30 bg-[var(--ret-amber)]/5 px-3 py-2 text-sm text-[var(--ret-amber)]")}>
					{loadWarning}
					<button type="button" className={cn("ml-2 min-h-8 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-amber)]")} onClick={() => void load()}>
						Retry
					</button>
				</div>
				) : null}
			{createError && !seed ? (
				<div role="alert" className={cn("border border-[var(--ret-red)]/35 bg-[var(--ret-red)]/5 px-3 py-2 text-sm text-[var(--ret-red)]")}>
					{createError}
				</div>
			) : null}
			{/* The user's own workers. */}
			<section className={cn("space-y-4")}>
				<div className={cn("flex items-center gap-3 border-b border-[var(--ret-border)] pb-3")}>
					<h2 className={cn("text-xl font-medium tracking-tight text-[var(--ret-text)]")}>Your saved setups</h2>
					<ReticleBadge>{workers?.length ?? "…"} saved</ReticleBadge>
				</div>
				{workerLoadFailed && workers === null ? <ReticleFrame className="p-5 text-sm text-[var(--ret-text-muted)]"><p>Saved setups are unavailable.</p><ReticleButton variant="secondary" className="mt-3" onClick={() => void load()}>Retry saved setups</ReticleButton></ReticleFrame> : workers === null ? (
					<DashboardLoadingState label="Loading your saved setups…" variant="table" />
				) : workers.length === 0 ? (
					<ReticleFrame className={cn("flex flex-wrap items-center gap-4 p-5 sm:p-6")}>
						<Bot aria-hidden="true" className={cn("size-6 shrink-0 text-[var(--ret-text-muted)]")} strokeWidth={1.75} />
						<div className={cn("min-w-0 flex-1 basis-64")}>
						<p className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>No saved setups yet</p>
						<p className={cn("mt-2 max-w-[56ch] text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
							Start from a template or memory bundle. Saving a setup does not launch compute.
						</p>
						</div>
						<ReticleButton variant="secondary" onClick={() => setSeed({ name: "", sourceValue: firstSource })}>Create a saved setup</ReticleButton>
					</ReticleFrame>
				) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--ret-border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text-muted)]"><tr>{["Setup", "Runtime", "Memory", "Actions"].map((label) => <th key={label} scope="col" className="px-5 py-4 font-medium">{label}</th>)}</tr></thead>
              <tbody>{workers.map((worker) => <tr key={worker.id} className="border-b border-[var(--ret-border)] last:border-b-0 hover:bg-[var(--ret-surface)]">
                <td className="max-w-64 px-4 py-3"><Link href={`/dashboard/workers/${encodeURIComponent(worker.id)}`} className="block truncate text-[15px] font-medium hover:text-[var(--ret-purple)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">{worker.name}</Link><p className="mt-1 truncate text-sm text-[var(--ret-text-muted)]">{worker.model || "Runtime default"}</p></td>
                <td className="px-4 py-3 text-[var(--ret-text-dim)]">{AGENT_LABEL[worker.agentKind]}</td>
                <td className="max-w-48 px-4 py-3"><span className="block truncate text-[var(--ret-text-muted)]">{bundleNames[worker.memoryBundleId] ?? "Memory bundle"}</span></td>
                <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-4"><Link href={`/dashboard/workers/${encodeURIComponent(worker.id)}`} aria-label={`Edit setup ${worker.name}`} className="min-h-10 content-center text-sm text-[var(--ret-purple)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Edit & launch</Link>{worker.lastMachineId ? <Link href={`/dashboard/machines/${encodeURIComponent(worker.lastMachineId)}`} className="min-h-10 content-center text-sm text-[var(--ret-text-muted)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Last workspace</Link> : <span className="text-sm text-[var(--ret-text-muted)]">Not launched</span>}</div></td>
              </tr>)}</tbody>
            </table>
          </div>
				)}
			</section>

			{/* Curated presets -- deployable defaults shipped with Agent Machines. */}
			<section className={cn("space-y-4")}>
				<div className={cn("flex flex-wrap items-end justify-between gap-3 border-b border-[var(--ret-border)] pb-3")}>
					<div>
						<div className={cn("flex items-center gap-3")}>
							<h2 id="agent-templates" className={cn("scroll-mt-20 text-xl font-medium tracking-tight text-[var(--ret-text)]")}>Agent templates</h2>
							<ReticleBadge>{matchingPresets.length} templates</ReticleBadge>
						</div>
						<p className={cn("mt-2 max-w-[66ch] text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
							Templates supply instructions and selected tools, not finished work. Edit a setup, then launch when ready.
						</p>
					</div>
					<ReticleButton
						variant="primary"
						size="sm"
						onClick={() => setSeed({ name: "", sourceValue: firstSource })}
					>
						<Plus className={cn("h-4 w-4")} strokeWidth={1.75} /> Custom setup
					</ReticleButton>
				</div>
				<label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 focus-within:border-[var(--ret-purple)]"><Search size={18} aria-hidden="true" className="text-[var(--ret-text-muted)]" /><span className="sr-only">Search templates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates by name, runtime, or category…" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-[var(--ret-text-muted)]" /></label>
        {matchingPresets.length === 0 ? <p role="status" className="rounded-lg border border-[var(--ret-border)] p-5 text-sm text-[var(--ret-text-muted)]">No matching templates. <button type="button" onClick={() => setQuery("")} className="min-h-9 underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Clear search</button></p> : null}
        <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3")}>
					{matchingPresets.map((preset) => {
						const skillCount = preset.skillIds.filter((id) => id !== "*").length;
						const mcpCount = preset.mcpServerIds.filter((id) => id !== "*").length;
						return (
							<button
								key={preset.id}
								type="button"
								onClick={() => setSeed({ name: preset.name, sourceValue: `preset:${preset.id}` })}
								className={cn("group flex h-full min-h-48 min-w-0 flex-col rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 text-left outline-none hover:bg-[var(--ret-surface)] active:bg-[var(--ret-bg-soft)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] sm:p-4")}
							>
								<div className={cn("mb-3 flex flex-wrap items-center justify-between gap-2")}>
									<div className={cn("flex min-w-0 items-center gap-2")}>
										{presetBrand(preset.brand, 20) ?? (
											<Sparkles className={cn("h-4 w-4 shrink-0 text-[var(--ret-text-dim)]")} strokeWidth={1.75} />
										)}
										<span className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>{preset.name}</span>
									</div>
									<ReticleBadge variant="default">{preset.category}</ReticleBadge>
								</div>
								<p className={cn("line-clamp-3 min-h-[3.9em] text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
									{preset.description}
								</p>
								<div className={cn("mt-4 flex flex-wrap gap-1.5")}>
									{preset.loadout.slice(0, 4).map((item) => (
										<span key={item} className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 text-sm text-[var(--ret-text-dim)]")}>
											{item}
										</span>
									))}
								</div>
								<div className={cn("mb-4 mt-4 flex flex-wrap gap-x-3 gap-y-2 text-[14px] text-[var(--ret-text-muted)]")}>
									<span>{AGENT_LABEL[preset.agentKind]}</span>
									<span className={cn("flex items-center gap-1")}>
										<Sparkles className={cn("h-4 w-4")} strokeWidth={1.75} /> {skillCount} skills
									</span>
									<span className={cn("flex items-center gap-1")}>
										<Plug2 className={cn("h-4 w-4")} strokeWidth={1.75} /> {mcpCount} MCP
									</span>
								</div>
								<div className={cn("mt-auto flex items-center justify-between gap-3 border-t border-[var(--ret-border)] pt-3 text-[14px] font-medium text-[var(--ret-purple)]")}>
									<span>Customize setup</span>
									<ArrowRight aria-hidden="true" className={cn("h-4 w-4 shrink-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] pointer-fine:motion-safe:[@media(hover:hover)]:group-[:hover:not(:disabled):not(:focus-visible)]:translate-x-0.5 group-focus-visible:transition-none")} strokeWidth={1.75} />
								</div>
							</button>
						);
					})}
				</div>
			</section>

			{seed ? (
				<CreateWorkerModal
					bundles={bundles}
					presets={presets}
					initialName={seed.name}
					initialSource={seed.sourceValue}
					busy={busy}
					error={createError}
					onCancel={() => setSeed(null)}
					onSubmit={create}
				/>
			) : null}
		</div>
	);
}

const fieldCls = cn(
	"min-h-10 w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2",
	"font-mono text-[16px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
	"focus:border-[var(--ret-accent)] focus:outline-none",
);

function CreateWorkerModal({
	bundles,
	presets,
	initialName,
	initialSource,
	busy,
	error,
	onCancel,
	onSubmit,
}: {
	bundles: BundleOpt[];
	presets: Preset[];
	initialName: string;
	initialSource: string;
	busy: boolean;
	error: string | null;
	onCancel: () => void;
	onSubmit: (name: string, agentKind: AgentKind, source: CreateSource, model?: string) => void;
}) {
	const [name, setName] = useState(initialName);
	const [agentKind, setAgentKind] = useState<AgentKind>(
		presets.find((p) => `preset:${p.id}` === initialSource)?.agentKind ?? "hermes",
	);
	const [sourceValue, setSourceValue] = useState(initialSource);
	const [model, setModel] = useState("");
	const nativeUpstream = requiredNativeUpstream(agentKind);
	const modelHelp = nativeUpstream
		? `Hosted ${AGENT_LABEL[agentKind]} uses a native ${nativeUpstream === "openai" ? "OpenAI" : "Anthropic"} key and compatible model. Leave blank for its default model; router and custom-endpoint model IDs are not supported.`
		: "Leave blank for an automatic model on supported OpenAI, Anthropic, OpenRouter, or Vercel AI Gateway paths. Google and custom endpoints require the exact model ID they support.";

	const sourceOptions: ReticleSelectOption[] = [
		...presets.map((p) => ({ value: `preset:${p.id}`, label: p.name, group: "Curated presets" })),
		...bundles.map((b) => ({ value: `bundle:${b.id}`, label: b.name, group: "Your memories" })),
	];

	function parseSource(value: string): CreateSource {
		return value.startsWith("preset:")
			? { kind: "preset", id: value.slice("preset:".length) }
			: { kind: "bundle", id: value.slice("bundle:".length) };
	}

	return (
		<DashboardDialog title="Save an agent setup" onClose={onCancel} busy={busy}>
			<div className="space-y-4">
				<p className={cn("mb-5 text-[14px] leading-relaxed text-[var(--ret-text-dim)]")}>Choose the starting configuration here. Connect credentials, edit memory and tools, and launch compute from the setup page.</p>
				<div className={cn("flex flex-col gap-2")}>
					<label htmlFor="create-worker-name" className={cn("text-[14px] text-[var(--ret-text-dim)]")}>Setup name</label>
					<input id="create-worker-name" className={cn(fieldCls)} placeholder="e.g. code-reviewer" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
					<label className={cn("mt-2 text-[14px] text-[var(--ret-text-muted)]")}>Runtime</label>
					<ReticleSelect
						ariaLabel="Runtime"
						value={agentKind}
						onChange={(v) => setAgentKind(v as AgentKind)}
						options={AGENT_KINDS.map((k) => ({ value: k, label: AGENT_LABEL[k] }))}
					/>
					<label htmlFor="create-worker-model" className={cn("mt-2 text-[14px] text-[var(--ret-text-muted)]")}>Model ID (optional)</label>
					<input
						id="create-worker-model"
						className={cn(fieldCls)}
						value={model}
						onChange={(event) => setModel(event.target.value)}
						placeholder={nativeUpstream ? "Runtime default model" : "Automatic for supported providers"}
						aria-describedby="create-worker-model-help"
						autoComplete="off"
						spellCheck={false}
					/>
					<p id="create-worker-model-help" className={cn("text-[14px] leading-relaxed text-[var(--ret-text-dim)]")}>
						{modelHelp}
					</p>
					<label className={cn("mt-2 text-[14px] text-[var(--ret-text-muted)]")}>Start from</label>
					<ReticleSelect
						ariaLabel="Start from"
						value={sourceValue}
						onChange={setSourceValue}
						options={sourceOptions}
						placeholder="Pick a preset or memory"
					/>
				</div>
				{error ? <p role="alert" className={cn("mt-3 text-sm text-[var(--ret-red)]")}>{error}</p> : null}
				<div className={cn("mt-5 flex items-center gap-3 border-t border-[var(--ret-border)] pt-4")}>
					<ReticleButton variant="primary" size="sm" disabled={!name.trim() || !sourceValue.split(":")[1] || busy} onClick={() => onSubmit(name.trim(), agentKind, parseSource(sourceValue), model.trim() || undefined)}>
						<Rocket className={cn("h-4 w-4")} strokeWidth={1.75} /> {busy ? "Saving…" : "Save setup"}
					</ReticleButton>
					<button type="button" disabled={busy} onClick={onCancel} className={cn("min-h-10 px-2 text-[14px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>
						Cancel
					</button>
				</div>
			</div>
		</DashboardDialog>
	);
}

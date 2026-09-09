"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Brain, Plug2, Plus, Rocket, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleSelect, type ReticleSelectOption } from "@/components/reticle/ReticleSelect";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
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

const MARK_SET = new Set<string>(["am", "dedalus", "nous", "cursor", "openclaw", "anthropic", "openai"]);
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

	const load = useCallback(async () => {
		setLoadWarning(null);
		const [workerResult, memoryResult] = await Promise.allSettled([
			fetch("/api/dashboard/workers", { cache: "no-store" }).then(async (response) => {
				if (!response.ok) throw new Error(`workers HTTP ${response.status}`);
				return response.json();
			}),
			fetch("/api/dashboard/memory", { cache: "no-store" }).then(async (response) => {
				if (!response.ok) throw new Error(`memory HTTP ${response.status}`);
				return response.json();
			}),
		]);
		const workerPayload = workerResult.status === "fulfilled" ? workerResult.value : null;
		const memoryPayload = memoryResult.status === "fulfilled" ? memoryResult.value : null;
		setWorkers((workerPayload?.workers as Worker[]) ?? []);
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
				router.push(`/dashboard/workers/${body.worker.id}`);
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

	return (
		<div className="space-y-6">
			{loadWarning ? (
				<div className="border border-[var(--ret-amber)]/30 bg-[var(--ret-amber)]/5 px-3 py-2 font-mono text-[10px] text-[var(--ret-amber)]">
					{loadWarning}
					<button type="button" className="ml-2 underline underline-offset-2" onClick={() => void load()}>
						retry
					</button>
				</div>
				) : null}
			{createError && !seed ? (
				<div role="alert" className="border border-[var(--ret-red)]/35 bg-[var(--ret-red)]/5 px-3 py-2 font-mono text-[10px] text-[var(--ret-red)]">
					{createError}
				</div>
			) : null}
			{/* Curated presets -- deployable defaults shipped with Agent Machines. */}
			<section className="space-y-3">
				<div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--ret-border)] pb-3">
					<div>
						<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-purple)]">
							ready to configure . {presets.length}
						</span>
						<h2 className="ret-display mt-1 text-lg">Pick the responsibility, not the infrastructure</h2>
						<p className="mt-1 max-w-[66ch] text-[11px] text-[var(--ret-text-dim)]">
							Each template creates a durable Worker with memory, abilities, and an inspectable loadout. Deploy it to any configured sandbox without making the sandbox its identity.
						</p>
					</div>
					<ReticleButton
						variant="primary"
						size="sm"
						onClick={() => setSeed({ name: "", sourceValue: firstSource })}
					>
						<Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> Custom agent
					</ReticleButton>
				</div>
				<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-2 xl:grid-cols-3">
					{presets.map((preset) => {
						const skillCount = preset.skillIds.filter((id) => id !== "*").length;
						const mcpCount = preset.mcpServerIds.filter((id) => id !== "*").length;
						return (
							<button
								key={preset.id}
								type="button"
								onClick={() => setSeed({ name: preset.name, sourceValue: `preset:${preset.id}` })}
								className="group flex min-h-60 h-full flex-col bg-[var(--ret-bg)] p-4 text-left transition-colors hover:bg-[var(--ret-surface)]"
							>
								<div className="mb-2 flex items-center justify-between gap-2">
									<div className="flex min-w-0 items-center gap-2">
										{presetBrand(preset.brand, 16) ?? (
											<Sparkles className="h-4 w-4 shrink-0 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
										)}
										<span className="truncate text-[13px] text-[var(--ret-text)]">{preset.name}</span>
									</div>
									<ReticleBadge variant="default">{preset.category}</ReticleBadge>
								</div>
								<p className="line-clamp-3 min-h-[3.9em] text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
									{preset.longDescription}
								</p>
								<div className="mt-3 flex flex-wrap gap-1">
									{preset.loadout.slice(0, 4).map((item) => (
										<span key={item} className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ret-text-muted)]">
											{item}
										</span>
									))}
								</div>
								<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
									<span>{AGENT_LABEL[preset.agentKind]}</span>
									<span className="flex items-center gap-1">
										<Sparkles className="h-3 w-3" strokeWidth={1.75} /> {skillCount} skills
									</span>
									<span className="flex items-center gap-1">
										<Plug2 className="h-3 w-3" strokeWidth={1.75} /> {mcpCount} MCP
									</span>
								</div>
								<div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--ret-border)] pt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-purple)]">
									<span>Create agent</span>
									<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
								</div>
							</button>
						);
					})}
				</div>
			</section>

			{/* The user's own workers. */}
			<section className="space-y-3">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					your agents . {workers?.length ?? "…"}
				</span>
				{workers === null ? (
					<ReticleFrame className="px-4 py-8 text-center">
						<BrailleSpinner name="orbit" label="loading your agents" className="text-[11px] text-[var(--ret-text-muted)]" />
					</ReticleFrame>
				) : workers.length === 0 ? (
					<ReticleFrame className="px-4 py-8 text-center">
						<p className="text-[13px] text-[var(--ret-text-dim)]">No saved agents yet.</p>
						<p className="mt-1 text-[11px] text-[var(--ret-text-muted)]">
							Start from a template above (or an existing Memory) to package a runtime
							+ model + memory you can deploy onto any machine.
						</p>
					</ReticleFrame>
				) : (
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{workers.map((w) => (
							<Link key={w.id} href={`/dashboard/workers/${w.id}`} className="group">
								<ReticleFrame className="h-full p-4 transition-colors group-hover:bg-[var(--ret-surface)]">
									<div className="mb-2 flex items-center justify-between gap-2">
										<div className="flex min-w-0 items-center gap-2">
											<Bot className="h-4 w-4 shrink-0 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
											<span className="truncate text-[13px] text-[var(--ret-text)]">{w.name}</span>
										</div>
										<ReticleBadge variant={w.lastMachineId ? "success" : "default"}>
											{w.lastMachineId ? "deployed" : "draft"}
										</ReticleBadge>
									</div>
									<div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
										<span>{AGENT_LABEL[w.agentKind]}</span>
										<span className="truncate">{w.model}</span>
									</div>
									<p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[10px] text-[var(--ret-text-dim)]">
										<Brain className="h-3 w-3 shrink-0" strokeWidth={1.75} />
										{bundleNames[w.memoryBundleId] ?? "memory"}
									</p>
								</ReticleFrame>
							</Link>
						))}
					</div>
				)}
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
	"w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1.5",
	"font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
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
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12dvh]">
			<div className="w-full max-w-[520px] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
				<p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">Create agent</p>
				<div className="flex flex-col gap-2">
					<input className={fieldCls} placeholder="agent name (e.g. code-reviewer)" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
					<label className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">Runtime</label>
					<ReticleSelect
						ariaLabel="Runtime"
						value={agentKind}
						onChange={(v) => setAgentKind(v as AgentKind)}
						options={AGENT_KINDS.map((k) => ({ value: k, label: AGENT_LABEL[k] }))}
					/>
					<label htmlFor="create-worker-model" className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">Model ID (optional)</label>
					<input
						id="create-worker-model"
						className={fieldCls}
						value={model}
						onChange={(event) => setModel(event.target.value)}
						placeholder="Automatic for supported providers"
						aria-describedby="create-worker-model-help"
						autoComplete="off"
						spellCheck={false}
					/>
					<p id="create-worker-model-help" className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
						Leave blank for an automatic model on OpenAI, Anthropic, OpenRouter, or Vercel AI Gateway. Google and custom endpoints require the exact model ID they support.
					</p>
					<label className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">Start from</label>
					<ReticleSelect
						ariaLabel="Start from"
						value={sourceValue}
						onChange={setSourceValue}
						options={sourceOptions}
						placeholder="Pick a preset or memory"
					/>
				</div>
				{error ? <p role="alert" className="mt-3 text-[12px] text-[var(--ret-red)]">{error}</p> : null}
				<div className="mt-3 flex items-center gap-2">
					<ReticleButton variant="primary" size="sm" disabled={!name.trim() || busy} onClick={() => onSubmit(name.trim(), agentKind, parseSource(sourceValue), model.trim() || undefined)}>
						<Rocket className="h-3.5 w-3.5" strokeWidth={1.75} /> {busy ? "creating…" : "Create agent"}
					</ReticleButton>
					<button type="button" onClick={onCancel} className="font-mono text-[11px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
						cancel
					</button>
				</div>
			</div>
		</div>
	);
}

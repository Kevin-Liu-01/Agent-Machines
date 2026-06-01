"use client";

import Link from "next/link";
import { ChevronLeft, Brain, Rocket, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { ROUTER_PRESETS } from "@/lib/agents/upstreams";
import {
	AGENT_KINDS,
	AGENT_LABEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
	type AgentKind,
	type ProviderKind,
	type Worker,
} from "@/lib/user-config/schema";

type BundleOpt = { id: string; name: string };

const fieldCls = cn(
	"w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1.5",
	"font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
	"focus:border-[var(--ret-accent)] focus:outline-none",
);

export function WorkerDetail({ workerId }: { workerId: string }) {
	const [worker, setWorker] = useState<Worker | null>(null);
	const [bundles, setBundles] = useState<BundleOpt[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [provider, setProvider] = useState<ProviderKind>("dedalus");
	const [deploying, setDeploying] = useState(false);
	const [deployMsg, setDeployMsg] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			const [w, m] = await Promise.all([
				fetch(`/api/dashboard/workers/${encodeURIComponent(workerId)}`, { cache: "no-store" }).then((r) => r.json()),
				fetch("/api/dashboard/memory", { cache: "no-store" }).then((r) => r.json()),
			]);
			if (!w?.ok || !w.worker) throw new Error(w?.error ?? "not_found");
			setWorker(w.worker as Worker);
			setBundles(((m?.bundles as BundleOpt[]) ?? []).map((b) => ({ id: b.id, name: b.name })));
		} catch (err) {
			setError(err instanceof Error ? err.message : "load_failed");
		}
	}, [workerId]);

	useEffect(() => {
		void load();
	}, [load]);

	const save = useCallback(async () => {
		if (!worker) return;
		setSaving(true);
		try {
			await fetch(`/api/dashboard/workers/${encodeURIComponent(workerId)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: worker.name,
					agentKind: worker.agentKind,
					model: worker.model,
					gatewayProfileId: worker.gatewayProfileId,
					memoryBundleId: worker.memoryBundleId,
					rolePrompt: worker.rolePrompt,
				}),
			});
		} finally {
			setSaving(false);
		}
	}, [worker, workerId]);

	const deploy = useCallback(async () => {
		setDeploying(true);
		setDeployMsg(null);
		try {
			const r = await fetch(`/api/dashboard/workers/${encodeURIComponent(workerId)}/deploy`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ providerKind: provider }),
			});
			const body = (await r.json()) as { ok?: boolean; message?: string; error?: string };
			setDeployMsg(body.ok ? body.message ?? "Deployed." : body.message ?? body.error ?? "deploy_failed");
			await load();
		} catch (err) {
			setDeployMsg(err instanceof Error ? err.message : "deploy_failed");
		} finally {
			setDeploying(false);
		}
	}, [workerId, provider, load]);

	if (error) {
		return (
			<div className="px-5 py-8">
				<p className="font-mono text-[12px] text-[var(--ret-red)]">{error}</p>
				<Link href="/dashboard/workers" className="mt-2 inline-block font-mono text-[11px] text-[var(--ret-accent)] hover:underline">
					← back to Workers
				</Link>
			</div>
		);
	}
	if (!worker) {
		return (
			<div className="px-5 py-12">
				<BrailleSpinner name="orbit" label="loading worker" className="text-[11px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
				<div className="flex min-w-0 items-center gap-3">
					<Link href="/dashboard/workers" className="text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
						<ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
					</Link>
					<input
						value={worker.name}
						onChange={(e) => setWorker({ ...worker, name: e.target.value })}
						className="min-w-0 border-0 bg-transparent text-[18px] tracking-tight text-[var(--ret-text)] focus:outline-none"
						style={{ fontFamily: "var(--font-display-serif)" }}
					/>
					<ReticleBadge variant={worker.lastMachineId ? "success" : "default"}>
						{worker.lastMachineId ? "deployed" : "draft"}
					</ReticleBadge>
				</div>
				<ReticleButton variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
					{saving ? "saving…" : "Save"}
				</ReticleButton>
			</div>

			<div className="space-y-5 px-5 py-5">
				{/* Config */}
				<section className="space-y-3">
					<SectionLabel label="Configuration" hint="runtime · model · router · memory" />
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Runtime">
							<select className={fieldCls} value={worker.agentKind} onChange={(e) => setWorker({ ...worker, agentKind: e.target.value as AgentKind })}>
								{AGENT_KINDS.map((k) => (
									<option key={k} value={k}>{AGENT_LABEL[k]}</option>
								))}
							</select>
						</Field>
						<Field label="Model">
							<input className={fieldCls} value={worker.model} onChange={(e) => setWorker({ ...worker, model: e.target.value })} />
						</Field>
						<Field label="Router">
							<select className={fieldCls} value={worker.gatewayProfileId} onChange={(e) => setWorker({ ...worker, gatewayProfileId: e.target.value })}>
								{ROUTER_PRESETS.map((p) => (
									<option key={p.id} value={p.id}>{p.label}</option>
								))}
							</select>
						</Field>
						<Field label="Memory bundle">
							<div className="flex items-center gap-2">
								<select className={fieldCls} value={worker.memoryBundleId} onChange={(e) => setWorker({ ...worker, memoryBundleId: e.target.value })}>
									{bundles.length === 0 ? <option value={worker.memoryBundleId}>default</option> : null}
									{bundles.map((b) => (
										<option key={b.id} value={b.id}>{b.name}</option>
									))}
								</select>
								<Link
									href={`/dashboard/memory/${encodeURIComponent(worker.memoryBundleId)}`}
									className="shrink-0 text-[var(--ret-text-muted)] hover:text-[var(--ret-accent)]"
									title="Edit this bundle"
								>
									<Brain className="h-4 w-4" strokeWidth={1.75} />
								</Link>
							</div>
						</Field>
					</div>
					<Field label="Role prompt (optional)">
						<textarea
							className={cn(fieldCls, "min-h-[90px] resize-y leading-relaxed")}
							placeholder="extra instructions layered on top of the memory bundle for this worker…"
							value={worker.rolePrompt ?? ""}
							onChange={(e) => setWorker({ ...worker, rolePrompt: e.target.value })}
						/>
					</Field>
				</section>

				{/* Deploy */}
				<section className="space-y-3">
					<SectionLabel label="Deploy" hint="provision a machine running this worker" />
					<ReticleFrame className="flex flex-wrap items-center gap-2 p-3">
						<Server className="h-4 w-4 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
						<select className={cn(fieldCls, "w-auto")} value={provider} onChange={(e) => setProvider(e.target.value as ProviderKind)}>
							{PROVIDER_KINDS.map((p) => (
								<option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
							))}
						</select>
						<ReticleButton variant="primary" size="sm" disabled={deploying} onClick={() => void deploy()}>
							<Rocket className="h-3.5 w-3.5" strokeWidth={1.75} /> {deploying ? "deploying…" : "Deploy"}
						</ReticleButton>
						{worker.lastMachineId ? (
							<Link
								href={`/dashboard/machines/${encodeURIComponent(worker.lastMachineId)}`}
								className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-accent)] hover:underline"
							>
								open machine →
							</Link>
						) : null}
					</ReticleFrame>
					{deployMsg ? (
						<p className="font-mono text-[11px] text-[var(--ret-text-dim)]">{deployMsg}</p>
					) : null}
				</section>
			</div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">{label}</label>
			{children}
		</div>
	);
}

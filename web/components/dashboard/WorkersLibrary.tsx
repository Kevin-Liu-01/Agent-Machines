"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Brain, Plus, Rocket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { SchematicPanel } from "@/components/reticle/SchematicPanel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import {
	AGENT_KINDS,
	AGENT_LABEL,
	DEFAULT_MEMORY_BUNDLE_ID,
	type AgentKind,
	type Worker,
} from "@/lib/user-config/schema";

type BundleOpt = { id: string; name: string };

export function WorkersLibrary() {
	const router = useRouter();
	const [workers, setWorkers] = useState<Worker[] | null>(null);
	const [bundleNames, setBundleNames] = useState<Record<string, string>>({});
	const [bundles, setBundles] = useState<BundleOpt[]>([]);
	const [creating, setCreating] = useState(false);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const [w, m] = await Promise.all([
			fetch("/api/dashboard/workers", { cache: "no-store" }).then((r) => r.json()),
			fetch("/api/dashboard/memory", { cache: "no-store" }).then((r) => r.json()),
		]);
		setWorkers((w?.workers as Worker[]) ?? []);
		setBundleNames((w?.bundleNames as Record<string, string>) ?? {});
		setBundles(((m?.bundles as BundleOpt[]) ?? []).map((b) => ({ id: b.id, name: b.name })));
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const create = useCallback(
		async (name: string, agentKind: AgentKind, memoryBundleId: string) => {
			setBusy(true);
			try {
				const r = await fetch("/api/dashboard/workers", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, agentKind, memoryBundleId }),
				});
				const body = (await r.json()) as { ok?: boolean; worker?: { id: string } };
				if (body.ok && body.worker) router.push(`/dashboard/workers/${body.worker.id}`);
			} finally {
				setBusy(false);
			}
		},
		[router],
	);

	if (!workers) {
		return (
			<div className="py-12">
				<BrailleSpinner name="orbit" label="loading workers" className="text-[11px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					{workers.length} worker{workers.length === 1 ? "" : "s"}
				</span>
				<ReticleButton variant="primary" size="sm" onClick={() => setCreating(true)}>
					<Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> New worker
				</ReticleButton>
			</div>

			{workers.length === 0 ? (
				<ReticleFrame className="px-4 py-10 text-center">
					<SchematicPanel
						slug="workers"
						className="mx-auto mb-5 w-full max-w-[240px]"
					/>
					<p className="text-[13px] text-[var(--ret-text-dim)]">No workers yet.</p>
					<p className="mt-1 text-[11px] text-[var(--ret-text-muted)]">
						Create a worker to package a runtime + model + memory you can deploy onto any machine.
					</p>
				</ReticleFrame>
			) : null}

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
								{bundleNames[w.memoryBundleId] ?? "memory bundle"}
							</p>
						</ReticleFrame>
					</Link>
				))}
			</div>

			{creating ? (
				<CreateWorkerModal
					bundles={bundles}
					busy={busy}
					onCancel={() => setCreating(false)}
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
	busy,
	onCancel,
	onSubmit,
}: {
	bundles: BundleOpt[];
	busy: boolean;
	onCancel: () => void;
	onSubmit: (name: string, agentKind: AgentKind, bundleId: string) => void;
}) {
	const [name, setName] = useState("");
	const [agentKind, setAgentKind] = useState<AgentKind>("hermes");
	const [bundleId, setBundleId] = useState(DEFAULT_MEMORY_BUNDLE_ID);

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]">
			<div className="w-full max-w-[520px] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
				<p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">New worker</p>
				<div className="flex flex-col gap-2">
					<input className={fieldCls} placeholder="worker name (e.g. code-reviewer)" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
					<label className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">Runtime</label>
					<select className={fieldCls} value={agentKind} onChange={(e) => setAgentKind(e.target.value as AgentKind)}>
						{AGENT_KINDS.map((k) => (
							<option key={k} value={k}>
								{AGENT_LABEL[k]}
							</option>
						))}
					</select>
					<label className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">Memory bundle</label>
					<select className={fieldCls} value={bundleId} onChange={(e) => setBundleId(e.target.value)}>
						{bundles.length === 0 ? <option value={DEFAULT_MEMORY_BUNDLE_ID}>Agent Machines default</option> : null}
						{bundles.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				</div>
				<div className="mt-3 flex items-center gap-2">
					<ReticleButton variant="primary" size="sm" disabled={!name.trim() || busy} onClick={() => onSubmit(name.trim(), agentKind, bundleId)}>
						<Rocket className="h-3.5 w-3.5" strokeWidth={1.75} /> {busy ? "creating…" : "Create"}
					</ReticleButton>
					<button type="button" onClick={onCancel} className="font-mono text-[11px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
						cancel
					</button>
				</div>
			</div>
		</div>
	);
}

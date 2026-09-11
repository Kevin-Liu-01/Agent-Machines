"use client";

import Link from "next/link";
import { Brain, ChevronLeft, RefreshCcw, Rocket, Server, Trash2 } from "@/components/ui/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleSelect } from "@/components/reticle/ReticleSelect";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useDashboardConfig } from "@/components/dashboard/DashboardConfigProvider";
import { RouterSelect } from "@/components/dashboard/RouterSelect";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { runtimeModel } from "@/lib/agents/runtime-model";
import { cn } from "@/lib/cn";
import { deletionConfirmation } from "@/lib/dashboard/deletion-warning";
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
type ManagedWorkerView = {
	status: {
		placement?: { sandbox: ProviderKind; sandboxId: string } | null;
		phase: string;
		observedGeneration: number;
		lastError: string | null;
	};
	generation: number;
};
type OperationView = {
	id: string;
	payload: { type: "reconcile" | "run" };
	status: "queued" | "running" | "succeeded" | "failed";
	attempts: number;
	error: string | null;
	createdAt: string;
	finishedAt: string | null;
};

const fieldCls = cn(
	"w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-1.5",
	"font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
	"focus:border-[var(--ret-accent)] focus:outline-none",
);

export function WorkerDetail({ workerId }: { workerId: string }) {
	const router = useRouter();
	const config = useDashboardConfig();
	const searchParams = useSearchParams();
	const launchOperationId = searchParams.get("launch");
	const [worker, setWorker] = useState<Worker | null>(null);
	const [bundles, setBundles] = useState<BundleOpt[]>([]);
	const [managedWorker, setManagedWorker] = useState<ManagedWorkerView | null>(null);
	const [operations, setOperations] = useState<OperationView[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveMsg, setSaveMsg] = useState<string | null>(null);
	const [retrying, setRetrying] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [provider, setProvider] = useState<ProviderKind>(() => {
		if (config && config.providers[config.draftProviderKind]?.configured) return config.draftProviderKind;
		return PROVIDER_KINDS.find((kind) => config?.providers[kind]?.configured) ?? "e2b";
	});
	const [deploying, setDeploying] = useState(false);
	const [deployMsg, setDeployMsg] = useState<string | null>(null);
	const aiConfigured = Object.fromEntries(
		Object.entries(config?.aiProviders ?? {}).map(([key, value]) => [key, Boolean(value?.configured)]),
	);
	const credentialVerdict = worker && config ? validateAgentCredentials(worker.agentKind, config) : null;
	const providerReady = Boolean(config?.providers[provider]?.configured);

	const load = useCallback(async () => {
		setError(null);
		try {
			const [w, m] = await Promise.all([
				fetch(`/api/dashboard/workers/${encodeURIComponent(workerId)}`, { cache: "no-store" }).then((r) => r.json()),
				fetch("/api/dashboard/memory", { cache: "no-store" }).then((r) => r.json()),
			]);
			if (!w?.ok || !w.worker) throw new Error(w?.error ?? "not_found");
			setWorker(w.worker as Worker);
			setManagedWorker((w.managedWorker as ManagedWorkerView | null) ?? null);
			setOperations(
				((w.operations as OperationView[] | undefined) ?? []).sort((a, b) =>
					b.createdAt.localeCompare(a.createdAt),
				),
			);
			setBundles(((m?.bundles as BundleOpt[]) ?? []).map((b) => ({ id: b.id, name: b.name })));
		} catch (err) {
			setError(err instanceof Error ? err.message : "load_failed");
		}
	}, [workerId]);

	const waitForOperation = useCallback(async (operationId: string) => {
		for (let attempt = 0; attempt < 600; attempt += 1) {
			const response = await fetch(
				`/api/dashboard/control-plane/operations/${encodeURIComponent(operationId)}`,
				{ cache: "no-store" },
			);
			const body = (await response.json()) as {
				operation?: OperationView;
				worker?: ManagedWorkerView | null;
				message?: string;
				error?: string;
			};
			if (!response.ok || !body.operation) {
				throw new Error(body.message ?? body.error ?? "Operation status unavailable.");
			}
			setManagedWorker(body.worker ?? null);
			setOperations((current) => [
				body.operation as OperationView,
				...current.filter((entry) => entry.id !== operationId),
			]);
			if (body.operation.status === "succeeded") return body.operation;
			if (body.operation.status === "failed") {
				throw new Error(body.operation.error ?? "Operation failed.");
			}
			await new Promise((resolve) => setTimeout(resolve, 800));
		}
		throw new Error("Operation is still running. It remains safe to close this page.");
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (!launchOperationId) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		setDeploying(true);
		setDeployMsg("Intent accepted · provisioning sandbox");

		const poll = async () => {
			try {
				const response = await fetch(
					`/api/dashboard/control-plane/operations/${encodeURIComponent(launchOperationId)}`,
					{ cache: "no-store" },
				);
				const body = (await response.json()) as {
					operation?: { status?: string; error?: string | null };
					worker?: { status?: { phase?: string; lastError?: string | null } };
					machineId?: string | null;
				};
				if (!response.ok || !body.operation) throw new Error("Could not read launch operation.");
				if (cancelled) return;
				if (body.operation.status === "succeeded" && body.machineId) {
					router.replace(
						`/dashboard/machines/${encodeURIComponent(body.machineId)}/view?launch=1`,
					);
					return;
				}
				if (body.operation.status === "failed") {
					setDeploying(false);
					setDeployMsg(
						body.operation.error ?? body.worker?.status?.lastError ?? "Worker launch failed.",
					);
					return;
				}
				const phase = body.worker?.status?.phase ?? body.operation.status ?? "queued";
				setDeployMsg(`Intent accepted · ${phase}`);
				timer = setTimeout(poll, 700);
			} catch (cause) {
				if (cancelled) return;
				setDeploying(false);
				setDeployMsg(cause instanceof Error ? cause.message : "Launch status unavailable.");
			}
		};
		void poll();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [launchOperationId, router]);

	const save = useCallback(async () => {
		if (!worker) return false;
		setSaving(true);
		setSaveMsg(null);
		try {
			const response = await fetch(`/api/dashboard/workers/${encodeURIComponent(workerId)}`, {
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
			const body = (await response.json().catch(() => ({}))) as {
				ok?: boolean;
				worker?: Worker;
				operation?: OperationView;
				message?: string;
				error?: string;
			};
			if (!response.ok || !body.ok) {
				throw new Error(body.message ?? body.error ?? "Worker update failed.");
			}
			if (body.worker) setWorker(body.worker);
			if (body.operation) {
				setSaveMsg("Update accepted · reconciling sandbox");
				await waitForOperation(body.operation.id);
				setSaveMsg("Saved · sandbox reconciled");
			} else {
				setSaveMsg("Draft saved");
			}
			await load();
			return true;
		} catch (cause) {
			setSaveMsg(cause instanceof Error ? cause.message : "Worker update failed.");
			return false;
		} finally {
			setSaving(false);
		}
	}, [load, waitForOperation, worker, workerId]);

	const retry = useCallback(async (operationId: string) => {
		setRetrying(operationId);
		setSaveMsg(null);
		try {
			const response = await fetch(
				`/api/dashboard/control-plane/operations/${encodeURIComponent(operationId)}`,
				{ method: "POST" },
			);
			const body = (await response.json()) as {
				operation?: OperationView;
				message?: string;
				error?: string;
			};
			if (!response.ok || !body.operation) {
				throw new Error(body.message ?? body.error ?? "Retry was rejected.");
			}
			setSaveMsg("Retry accepted · recovery consumer active");
			await waitForOperation(body.operation.id);
			setSaveMsg("Recovery succeeded");
			await load();
		} catch (cause) {
			setSaveMsg(cause instanceof Error ? cause.message : "Retry failed.");
		} finally {
			setRetrying(null);
		}
	}, [load, waitForOperation]);

	const remove = useCallback(async () => {
		const deployedProvider = managedWorker?.status.placement?.sandbox
			?? config?.machines.find((machine) => machine.id === worker?.lastMachineId)?.providerKind;
		if (!window.confirm(deletionConfirmation(`Delete ${worker?.name ?? "this Worker"} and its deployed sandbox?`, deployedProvider))) return;
		setDeleting(true);
		setSaveMsg(null);
		try {
			const response = await fetch(`/api/dashboard/workers/${encodeURIComponent(workerId)}`, {
				method: "DELETE",
			});
			const body = (await response.json()) as {
				ok?: boolean;
				operation?: OperationView;
				message?: string;
				error?: string;
			};
			if (!response.ok || !body.ok) {
				throw new Error(body.message ?? body.error ?? "Worker deletion failed.");
			}
			if (body.operation) await waitForOperation(body.operation.id);
			router.push("/dashboard/workers");
			router.refresh();
		} catch (cause) {
			setSaveMsg(cause instanceof Error ? cause.message : "Worker deletion failed.");
			setDeleting(false);
		}
	}, [router, waitForOperation, worker?.name, worker?.lastMachineId, workerId, managedWorker?.status.placement?.sandbox, config?.machines]);

	const deploy = useCallback(async () => {
		setDeploying(true);
		setDeployMsg(null);
		let accepted = false;
		try {
			// Deploy the configuration visible in this form, including unsaved edits.
			if (!(await save())) return;
			const r = await fetch(`/api/dashboard/workers/${encodeURIComponent(workerId)}/deploy`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ providerKind: provider }),
			});
			const body = (await r.json().catch(() => ({}))) as {
				ok?: boolean;
				message?: string;
				error?: string;
				operation?: { id?: string };
			};
			if (!r.ok || !body.ok || !body.operation?.id) {
				throw new Error(body.message ?? body.error ?? `Deploy failed (HTTP ${r.status}).`);
			}
			accepted = true;
			setDeployMsg(body.message ?? "Launch accepted. Preparing your workspace…");
			router.replace(
				`/dashboard/workers/${encodeURIComponent(workerId)}?launch=${encodeURIComponent(body.operation.id)}`,
			);
		} catch (err) {
			setDeployMsg(err instanceof Error ? err.message : "deploy_failed");
		} finally {
			if (!accepted) setDeploying(false);
		}
	}, [workerId, provider, save, router]);

	if (error) {
		return (
			<EmptyState title="Could not load this setup" description={error} onRetry={() => void load()} action={{ label: "Back to agent setups", href: "/dashboard/workers" }} />
		);
	}
	if (!worker) {
		return (
			<div className="px-5 py-6">
				<DashboardLoadingState label="Loading your agent setup…" variant="editor" />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
				<div className="flex min-w-0 items-center gap-3">
					<Link href="/dashboard/workers" aria-label="Back to agent setups" className="text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]">
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
				<div className="flex items-center gap-2">
					<ReticleButton variant="ghost" size="sm" onClick={() => void remove()} disabled={deleting || saving || deploying}>
						<Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> {deleting ? "deleting…" : "Delete"}
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={() => void save()} disabled={saving || deleting || deploying}>
						{saving ? "reconciling…" : "Save"}
					</ReticleButton>
				</div>
			</div>
			{saveMsg ? (
				<div className="border-b border-[var(--ret-border)] px-5 py-2 font-mono text-[10px] text-[var(--ret-text-dim)]">
					{saveMsg}
				</div>
			) : null}

			<div className="space-y-5 px-5 py-5">
				<div className={cn("flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--ret-border)] pb-3 text-[14px]")}>
					<Link href="/dashboard/components" className={cn("min-h-9 content-center text-[var(--ret-purple)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>Inspect building blocks</Link>
					<Link href="/dashboard/settings" className={cn("min-h-9 content-center text-[var(--ret-text-dim)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>Model &amp; compute credentials</Link>
					<Link href={`/dashboard/memory/${encodeURIComponent(worker.memoryBundleId)}`} className={cn("min-h-9 content-center text-[var(--ret-text-dim)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>Edit memory &amp; selected tools</Link>
				</div>
				{/* Config */}
				<section className="space-y-3">
					<SectionLabel label="Configuration" hint="runtime · model · router · memory" />
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Runtime">
							<ReticleSelect
								ariaLabel="Runtime"
								value={worker.agentKind}
								onChange={(v) => setWorker({ ...worker, agentKind: v as AgentKind, model: runtimeModel(v as AgentKind, worker.model) })}
								options={AGENT_KINDS.map((k) => ({ value: k, label: AGENT_LABEL[k] }))}
							/>
						</Field>
						<Field label="Model">
							<input className={fieldCls} value={worker.model} onChange={(e) => setWorker({ ...worker, model: e.target.value })} />
						</Field>
						<Field label="Model provider">
							<RouterSelect
								agentKind={worker.agentKind}
								value={worker.gatewayProfileId}
								onChange={(v) => setWorker({ ...worker, gatewayProfileId: v })}
								aiConfigured={aiConfigured}
								label="Router"
							/>
						</Field>
						<Field label="Memory bundle">
							<div className="flex items-center gap-2">
								<ReticleSelect
									ariaLabel="Memory bundle"
									className="flex-1"
									value={worker.memoryBundleId}
									onChange={(v) => setWorker({ ...worker, memoryBundleId: v })}
									options={
										bundles.length === 0
											? [{ value: worker.memoryBundleId, label: "default" }]
											: bundles.map((b) => ({ value: b.id, label: b.name }))
									}
								/>
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
							placeholder="Extra instructions layered on top of this setup's memory bundle…"
							value={worker.rolePrompt ?? ""}
							onChange={(e) => setWorker({ ...worker, rolePrompt: e.target.value })}
						/>
					</Field>
				</section>

				{/* Deploy */}
				<section className="space-y-3">
					<SectionLabel label="Launch on compute" hint="provision a workspace with this configuration" />
					<p className={cn("text-[14px] leading-relaxed text-[var(--ret-text-dim)]")}>Save &amp; deploy creates compute on your provider account. Your providers bill you directly.</p>
					<ReticleFrame className="flex flex-wrap items-center gap-2 p-3">
						<Server className="h-4 w-4 text-[var(--ret-text-dim)]" strokeWidth={1.75} />
						<ReticleSelect
							ariaLabel="Provider"
							className="w-44"
							value={provider}
							onChange={(v) => setProvider(v as ProviderKind)}
							options={PROVIDER_KINDS.map((p) => ({ value: p, label: `${PROVIDER_LABEL[p]}${config?.providers[p]?.configured ? "" : " — key required"}` }))}
						/>
						<ReticleButton variant="primary" size="sm" disabled={deploying || saving || deleting || !providerReady || !credentialVerdict?.ok} onClick={() => void deploy()}>
							<Rocket className="h-3.5 w-3.5" strokeWidth={1.75} /> {deploying ? "deploying…" : "Save & deploy"}
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
					{!providerReady || (credentialVerdict && !credentialVerdict.ok) ? (
						<p className="text-[12px] text-[var(--ret-amber)]">
							{!providerReady ? `Add ${PROVIDER_LABEL[provider]} credentials to launch this setup.` : credentialVerdict && !credentialVerdict.ok ? credentialVerdict.message : ""}{" "}
							<Link href="/dashboard/settings" className="underline underline-offset-2">Open settings</Link>
						</p>
					) : null}
					{deployMsg ? (
						<p className="font-mono text-[11px] text-[var(--ret-text-dim)]">{deployMsg}</p>
					) : null}
				</section>

				{/* Durable operation journal */}
				<section className="space-y-3">
					<SectionLabel label="Operations" hint="durable lifecycle journal · safe retry" />
					<ReticleFrame className="overflow-hidden">
						<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2.5">
							<div className="font-mono text-[10px] text-[var(--ret-text-dim)]">
								{managedWorker
									? `${managedWorker.status.phase} · generation ${managedWorker.status.observedGeneration}/${managedWorker.generation}`
									: "No sandbox lifecycle has been submitted yet."}
							</div>
							{managedWorker?.status.lastError ? (
								<span className="max-w-full truncate font-mono text-[10px] text-[var(--ret-red)]">
									{managedWorker.status.lastError}
								</span>
							) : null}
						</div>
						{operations.length === 0 ? (
							<p className="px-3 py-4 font-mono text-[10px] text-[var(--ret-text-muted)]">No operations yet.</p>
						) : (
							<div className="divide-y divide-[var(--ret-border)]">
								{operations.slice(0, 8).map((operation) => (
									<div key={operation.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
										<ReticleBadge variant={operationVariant(operation.status)}>{operation.status}</ReticleBadge>
										<span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ret-text-dim)]">
											{operation.payload.type}
										</span>
										<span className="min-w-0 flex-1 truncate font-mono text-[9px] text-[var(--ret-text-muted)]">
											{operation.error ?? `${operation.id.slice(0, 8)} · attempt ${operation.attempts}`}
										</span>
										{operation.status === "failed" ? (
											<ReticleButton
												variant="ghost"
												size="sm"
												disabled={retrying !== null}
												onClick={() => void retry(operation.id)}
											>
												<RefreshCcw className={cn("h-3 w-3", retrying === operation.id && "animate-spin")} /> retry
											</ReticleButton>
										) : null}
									</div>
								))}
							</div>
						)}
					</ReticleFrame>
				</section>
			</div>
		</div>
	);
}

function operationVariant(status: OperationView["status"]): "default" | "accent" | "success" | "warning" {
	if (status === "succeeded") return "success";
	if (status === "failed") return "warning";
	if (status === "running") return "accent";
	return "default";
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

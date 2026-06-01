"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { MachineFleetCard } from "@/components/dashboard/MachineFleetCard";
import { FleetInteractPane } from "@/components/dashboard/FleetInteractPane";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { SchematicPanel } from "@/components/reticle/SchematicPanel";
import type { LogLine } from "@/lib/dashboard/types";
import { fetchLogTail, headlineFromLogs, isFleetLogsLoaded, shouldFetchFleetLogs } from "@/lib/fleet/fetch-log-tail";
import { useFleetLoadout } from "@/lib/fleet/use-fleet-loadout";
import { toFleetStreamCard } from "@/lib/fleet/view-model";
import { cn } from "@/lib/cn";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
	DEFAULT_MODEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
	type AgentKind,
	type BootstrapState,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

const POLL_MS = 5000;
const VIEW_STORAGE_KEY = "am-fleet-view";

type FleetView = "cards" | "table";

const TABLE_PHASE: Record<string, { label: string; dot: string; text: string }> = {
	ready: { label: "Running", dot: "bg-[var(--ret-green)]", text: "text-[var(--ret-green)]" },
	starting: { label: "Starting", dot: "bg-[var(--ret-purple)]", text: "text-[var(--ret-purple)]" },
	sleeping: { label: "Sleeping", dot: "bg-[var(--ret-amber)]", text: "text-[var(--ret-amber)]" },
	destroying: { label: "Destroying", dot: "bg-[var(--ret-text-muted)]", text: "text-[var(--ret-text-muted)]" },
	destroyed: { label: "Destroyed", dot: "bg-[var(--ret-text-muted)]", text: "text-[var(--ret-text-muted)]" },
	error: { label: "Failed", dot: "bg-[var(--ret-red)]", text: "text-[var(--ret-red)]" },
	unknown: { label: "Unknown", dot: "bg-[var(--ret-text-muted)]", text: "text-[var(--ret-text-muted)]" },
};

type LiveMachine = {
	id: string;
	providerKind: ProviderKind;
	providerLabel: string;
	agentKind: AgentKind;
	name: string;
	spec: MachineSpec;
	model: string;
	createdAt: string;
	apiUrl: string | null;
	hasApiKey: boolean;
	archived?: boolean;
	capabilities: ProviderCapabilities | null;
	bootstrapState: BootstrapState;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

type Payload = {
	ok: boolean;
	machines: LiveMachine[];
	activeMachineId: string | null;
};

export function MachinesPanel() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const focusId = searchParams.get("focus");
	const [data, setData] = useState<Payload | null>(null);
	const [logsById, setLogsById] = useState<Record<string, LogLine[]>>({});
	const [logsFetched, setLogsFetched] = useState<Record<string, boolean>>({});
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<string | null>(null);
	const [showProvision, setShowProvision] = useState(false);
	const [view, setView] = useState<FleetView>("cards");
	const loadout = useFleetLoadout();

	useEffect(() => {
		const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
		if (saved === "cards" || saved === "table") setView(saved);
	}, []);

	const selectView = useCallback((next: FleetView) => {
		setView(next);
		try {
			window.localStorage.setItem(VIEW_STORAGE_KEY, next);
		} catch {
			// storage unavailable; in-memory toggle still works
		}
	}, []);

	const refresh = useCallback(async () => {
		try {
			const response = await fetch("/api/dashboard/machines", {
				cache: "no-store",
			});
			if (!response.ok) {
				setError(`HTTP ${response.status}`);
				return;
			}
			const payload = (await response.json()) as Payload;
			setData(payload);
			setError(null);

			setLogsFetched((prev) => ({
				...prev,
				...Object.fromEntries(
					payload.machines
						.filter((m) => !shouldFetchFleetLogs(m))
						.map((m) => [m.id, true]),
				),
			}));

			const pollable = payload.machines.filter(shouldFetchFleetLogs);
			const pairs = await Promise.all(
				pollable.map(async (m) => [m.id, await fetchLogTail(m.id)] as const),
			);
			setLogsById(Object.fromEntries(pairs));
			setLogsFetched((prev) => ({
				...prev,
				...Object.fromEntries(pollable.map((m) => [m.id, true])),
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : "fetch failed");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") refresh();
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [refresh]);

	const machines = data?.machines ?? [];
	const visible = machines.filter((m) => !m.archived);
	const archived = machines.filter((m) => m.archived);
	const activeMachineId = data?.activeMachineId ?? null;
	const focusMachine = focusId
		? machines.find((m) => m.id === focusId && !m.archived) ?? null
		: null;

	const setFocus = useCallback(
		(id: string | null) => {
			const params = new URLSearchParams(searchParams.toString());
			if (id) params.set("focus", id);
			else params.delete("focus");
			const qs = params.toString();
			router.replace(qs ? `/dashboard/machines?${qs}` : "/dashboard/machines", {
				scroll: false,
			});
		},
		[router, searchParams],
	);

	const cardsById = useMemo(() => {
		const map = new Map<string, ReturnType<typeof toFleetStreamCard>>();
		for (const machine of machines) {
			const logs = logsById[machine.id] ?? [];
			map.set(
				machine.id,
				toFleetStreamCard(machine, logs, {
					active: machine.id === activeMachineId,
					headline: headlineFromLogs(logs),
					logsLoaded: isFleetLogsLoaded(machine, logsFetched),
				}),
			);
		}
		return map;
	}, [machines, logsById, logsFetched, activeMachineId]);

	return (
		<DashboardPageBody>
			{error ? (
				<ReticleFrame className="border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
				<p className="text-[11px] text-[var(--ret-red)]">
					error: {error}
				</p>
				</ReticleFrame>
			) : null}

			{loading && machines.length === 0 ? (
				<section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					{[0, 1].map((i) => (
						<ReticleFrame key={i}>
							<div className="h-[320px] animate-pulse bg-[var(--ret-surface)]/40" />
						</ReticleFrame>
					))}
				</section>
			) : null}

			{/* Quick provision controls */}
			{!loading ? (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-3">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
							Fleet
						</h2>
						<ViewToggle view={view} onChange={selectView} />
					</div>
					<div className="flex items-center gap-2">
						<ReticleButton
							variant="primary"
							size="sm"
							onClick={() => setShowProvision((v) => !v)}
						>
							{showProvision ? "Cancel" : "+ New machine"}
						</ReticleButton>
						<ReticleButton
							as="a"
							href="/dashboard/setup"
							variant="ghost"
							size="sm"
						>
							Setup wizard
						</ReticleButton>
					</div>
				</div>
			) : null}

			{showProvision ? (
				<QuickProvisionForm
					onRefresh={refresh}
					onDone={() => {
						setShowProvision(false);
						void refresh();
					}}
					onCancel={() => setShowProvision(false)}
				/>
			) : null}

			{!loading && machines.length === 0 && !showProvision ? (
				<EmptyShell
					title="No machines yet"
					body="Click '+ New machine' above or use the setup wizard for guided provisioning."
					cta={null}
				/>
			) : null}

			{visible.length > 0 && view === "table" ? (
				<MachineTable machines={visible} activeMachineId={activeMachineId} />
			) : null}

			{visible.length > 0 && view === "cards" ? (
				<div
					className={
						focusMachine
							? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,44%)]"
							: undefined
					}
				>
					<section
						className={
							focusMachine
								? "grid max-h-[calc(100vh-12rem)] grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-1"
								: "grid grid-cols-1 gap-3 lg:grid-cols-2"
						}
					>
						{visible.map((machine, idx) => {
							const card = cardsById.get(machine.id);
							if (!card) return null;
							return (
								<MachineFleetCard
									key={machine.id}
									machine={machine}
									card={card}
									loadout={loadout}
									active={machine.id === activeMachineId}
									focused={machine.id === focusMachine?.id}
									delaySec={idx * 0.65}
									logsLoaded={isFleetLogsLoaded(machine, logsFetched)}
									editing={editing === machine.id}
									onChange={refresh}
									onToggleEdit={() =>
										setEditing((prev) =>
											prev === machine.id ? null : machine.id,
										)
									}
									onSavedEdit={() => {
										setEditing(null);
										void refresh();
									}}
									onInteract={() => setFocus(machine.id)}
									EditPanel={EditPanel}
								/>
							);
						})}
					</section>
					{focusMachine ? (
						<FleetInteractPane
							machineId={focusMachine.id}
							name={focusMachine.name}
							agentKind={focusMachine.agentKind}
							model={focusMachine.model}
							onClose={() => setFocus(null)}
						/>
					) : null}
				</div>
			) : null}

			{archived.length > 0 ? (
				<section className="space-y-3">
					<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						Archived ({archived.length})
					</h2>
					<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
						{archived.map((machine, idx) => {
							const card = cardsById.get(machine.id);
							if (!card) return null;
							return (
								<MachineFleetCard
									key={machine.id}
									machine={machine}
									card={card}
									loadout={loadout}
									active={false}
									delaySec={idx * 0.15}
									logsLoaded={isFleetLogsLoaded(machine, logsFetched)}
									editing={editing === machine.id}
									onChange={refresh}
									onToggleEdit={() => setEditing(machine.id)}
									onSavedEdit={() => void refresh()}
									EditPanel={EditPanel}
								/>
							);
						})}
					</div>
				</section>
			) : null}
		</DashboardPageBody>
	);
}

function ViewToggle({
	view,
	onChange,
}: {
	view: FleetView;
	onChange: (view: FleetView) => void;
}) {
	return (
		<div className="flex items-center border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			{(["cards", "table"] as const).map((option) => (
				<button
					key={option}
					type="button"
					onClick={() => onChange(option)}
					aria-pressed={view === option}
					className={cn(
						"px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
						view === option
							? "bg-[var(--ret-surface)] text-[var(--ret-text)]"
							: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
					)}
				>
					{option}
				</button>
			))}
		</div>
	);
}

function MachineTable({
	machines,
	activeMachineId,
}: {
	machines: LiveMachine[];
	activeMachineId: string | null;
}) {
	return (
		<ReticleFrame>
			<div className="overflow-x-auto">
				<table className="w-full text-left text-[12px]">
					<thead>
						<tr className="border-b border-[var(--ret-border)] text-[var(--ret-text-muted)]">
							<th className="px-4 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.18em]">Machine</th>
							<th className="px-4 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.18em]">Agent</th>
							<th className="px-4 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.18em]">Status</th>
							<th className="hidden px-4 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.18em] md:table-cell">Shape</th>
							<th className="hidden px-4 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.18em] lg:table-cell">Created</th>
							<th className="px-4 py-2">
								<span className="sr-only">Open</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{machines.map((machine) => {
							const state = machine.live.ok ? machine.live.state : "unknown";
							const meta = TABLE_PHASE[state] ?? TABLE_PHASE.unknown;
							const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
							const isActive = machine.id === activeMachineId;
							return (
								<tr
									key={machine.id}
									className="border-b border-[var(--ret-border)] transition-colors hover:bg-[var(--ret-surface)]"
								>
									<td className="px-4 py-2.5">
										<span className="flex items-center gap-1.5">
											<span className="truncate font-mono text-[12px] text-[var(--ret-text)]">
												{machine.name}
											</span>
											{isActive ? (
												<span className="shrink-0 border border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] px-1 text-[8px] uppercase tracking-[0.2em] text-[var(--ret-purple)]">
													active
												</span>
											) : null}
										</span>
										<span className="block truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
											{machine.id.slice(0, 22)}
										</span>
									</td>
									<td className="px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)]">
										{AGENT_LABEL[machine.agentKind]}
									</td>
									<td className="px-4 py-2.5">
										<span className="inline-flex items-center gap-1.5">
											<span className={cn("inline-block h-1.5 w-1.5 rounded-full", meta.dot)} />
											<span className={cn("text-[11px]", meta.text)}>{meta.label}</span>
										</span>
									</td>
									<td className="hidden px-4 py-2.5 font-mono text-[11px] text-[var(--ret-text-dim)] md:table-cell">
										{machine.spec.vcpu}v / {memGib}G / {machine.spec.storageGib}G
									</td>
									<td className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)] lg:table-cell">
										{new Date(machine.createdAt).toLocaleDateString()}
									</td>
									<td className="px-4 py-2.5 text-right">
										<Link
											href={`/dashboard/machines/${machine.id}`}
											className="font-mono text-[11px] text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-text)]"
										>
											open →
										</Link>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</ReticleFrame>
	);
}

function EmptyShell({
	title,
	body,
	cta,
}: {
	title: string;
	body: string;
	cta?: React.ReactNode;
}) {
	return (
		<ReticleFrame>
			<div className="space-y-3 p-8 text-center">
				<SchematicPanel
					slug="machines"
					className="mx-auto w-full max-w-[240px]"
				/>
				<h3 className="ret-display text-base">{title}</h3>
				<p className="mx-auto max-w-[64ch] text-[12px] text-[var(--ret-text-dim)]">
					{body}
				</p>
				{cta ? <div className="flex justify-center">{cta}</div> : null}
			</div>
		</ReticleFrame>
	);
}

function EditPanel({
	machineId,
	name,
	apiUrl,
	hasApiKey,
	model,
	onCancel,
	onSaved,
}: {
	machineId: string;
	name: string;
	apiUrl: string;
	hasApiKey: boolean;
	model: string;
	onCancel: () => void;
	onSaved: () => void;
}) {
	const [n, setN] = useState(name);
	const [u, setU] = useState(apiUrl);
	const [k, setK] = useState("");
	const [m, setM] = useState(model);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function save() {
		setBusy(true);
		setErr(null);
		try {
			const patch: Record<string, unknown> = { name: n, model: m };
			if (u !== apiUrl) patch.apiUrl = u || null;
			if (k.trim().length > 0) patch.apiKey = k.trim();
			const response = await fetch(`/api/dashboard/machines/${machineId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(patch),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					message?: string;
				};
				throw new Error(body.message ?? `HTTP ${response.status}`);
			}
			onSaved();
		} catch (e) {
			setErr(e instanceof Error ? e.message : "save failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-3 border-t border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-3">
			{err ? (
				<p className="text-[11px] text-[var(--ret-red)]">
					{err}
				</p>
			) : null}
			<div className="grid gap-3 md:grid-cols-2">
				<EditField
					label="name"
					value={n}
					onChange={setN}
					placeholder="my-machine"
				/>
				<EditField
					label="model"
					value={m}
					onChange={setM}
					placeholder="anthropic/claude-..."
				/>
				<EditField
					label="gateway URL"
					value={u}
					onChange={setU}
					placeholder="https://example.trycloudflare.com/v1"
					colSpan
				/>
				<EditField
					label={hasApiKey ? "gateway bearer (already on file)" : "gateway bearer"}
					value={k}
					onChange={setK}
					placeholder={hasApiKey ? "leave blank to keep existing" : "hp-..."}
					password
					colSpan
				/>
			</div>
			<div className="flex justify-end gap-2">
				<ReticleButton variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
					Cancel
				</ReticleButton>
				<ReticleButton variant="primary" size="sm" onClick={save} disabled={busy}>
					{busy ? "Saving..." : "Save"}
				</ReticleButton>
			</div>
		</div>
	);
}

function QuickProvisionForm({
	onRefresh,
	onDone,
	onCancel,
}: {
	onRefresh: () => Promise<void>;
	onDone: () => void;
	onCancel: () => void;
}) {
	const [providerKind, setProviderKind] = useState<ProviderKind>("dedalus");
	const [agentKind, setAgentKind] = useState<AgentKind>("hermes");
	const [model, setModel] = useState(DEFAULT_MODEL);
	const [name, setName] = useState("");
	const [vcpu, setVcpu] = useState("1");
	const [memoryMib, setMemoryMib] = useState("2048");
	const [storageGib, setStorageGib] = useState("10");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [result, setResult] = useState<string | null>(null);

	async function provision() {
		setBusy(true);
		setErr(null);
		setResult(null);
		try {
			const body = {
				providerKind,
				agentKind,
				model: model.trim() || undefined,
				name: name.trim() || undefined,
				spec: {
					vcpu: Number.parseInt(vcpu, 10) || 1,
					memoryMib: Number.parseInt(memoryMib, 10) || 2048,
					storageGib: Number.parseInt(storageGib, 10) || 10,
				},
			};
			const response = await fetch("/api/dashboard/admin/provision-machine", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = (await response.json()) as Record<string, unknown>;
			if (!response.ok) {
				throw new Error((data.message as string) ?? (data.error as string) ?? `HTTP ${response.status}`);
			}
			const machineId = data.machineId as string;
			const displayId = machineId;
			setResult(`Provisioned: ${displayId} -- bootstrapping...`);
			void onRefresh();

			// Trigger bootstrap automatically after provision
			try {
				const bootResp = await fetch("/api/dashboard/admin/bootstrap", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ machineId }),
				});
				if (bootResp.ok) {
					setResult(`Provisioned + bootstrapped: ${displayId}`);
				} else {
					const bootData = (await bootResp.json().catch(() => ({}))) as { message?: string };
					setResult(`Provisioned: ${displayId} (bootstrap: ${bootData.message ?? `HTTP ${bootResp.status}`})`);
				}
			} catch {
				setResult(`Provisioned: ${displayId} (bootstrap pending)`);
			}

			window.setTimeout(onDone, 1500);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "provision failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<ReticleFrame>
			<div className="space-y-3 p-4">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Quick provision
				</p>
				{err ? (
					<p className="text-[11px] text-[var(--ret-red)]">{err}</p>
				) : null}
				{result ? (
					<p className="text-[11px] text-[var(--ret-green)]">{result}</p>
				) : null}
				<div className="grid gap-3 md:grid-cols-3">
					<label className="flex flex-col gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Provider
						</span>
					<select
						value={providerKind}
						onChange={(e) => setProviderKind(e.target.value as ProviderKind)}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] focus:border-[var(--ret-purple)] focus:outline-none"
					>
						{PROVIDER_KINDS.map((p) => (
							<option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
						))}
					</select>
					</label>
					<label className="flex flex-col gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Agent
						</span>
						<select
							value={agentKind}
							onChange={(e) => setAgentKind(e.target.value as AgentKind)}
							className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] focus:border-[var(--ret-purple)] focus:outline-none"
						>
							{(["hermes", "openclaw", "claude-code", "codex"] as const).map((a) => (
								<option key={a} value={a}>{AGENT_LABEL[a]}</option>
							))}
						</select>
					</label>
					<EditField label="name" value={name} onChange={setName} placeholder="my-agent" />
				</div>
				<div className="grid gap-3 md:grid-cols-4">
					<EditField label="model" value={model} onChange={setModel} placeholder={DEFAULT_MODEL} colSpan />
					<EditField label="vCPU" value={vcpu} onChange={setVcpu} placeholder="1" />
					<EditField label="RAM (MiB)" value={memoryMib} onChange={setMemoryMib} placeholder="2048" />
					<EditField label="Disk (GiB)" value={storageGib} onChange={setStorageGib} placeholder="10" />
				</div>
				<div className="flex justify-end gap-2">
					<ReticleButton variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
						Cancel
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={() => void provision()} disabled={busy}>
						{busy ? "Provisioning..." : "Provision"}
					</ReticleButton>
				</div>
			</div>
		</ReticleFrame>
	);
}

function EditField({
	label,
	value,
	onChange,
	placeholder,
	password,
	colSpan,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	password?: boolean;
	colSpan?: boolean;
}) {
	return (
		<label className={cn("flex flex-col gap-1.5", colSpan ? "md:col-span-2" : "")}>
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<input
				type={password ? "password" : "text"}
				autoComplete="off"
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
			/>
		</label>
	);
}

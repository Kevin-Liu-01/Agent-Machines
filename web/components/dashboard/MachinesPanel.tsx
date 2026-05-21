"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MachineFleetCard } from "@/components/dashboard/MachineFleetCard";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import type { LogLine } from "@/lib/dashboard/types";
import { fetchLogTail, headlineFromLogs, isFleetLogsLoaded, shouldFetchFleetLogs } from "@/lib/fleet/fetch-log-tail";
import { useFleetLoadout } from "@/lib/fleet/use-fleet-loadout";
import { toFleetStreamCard } from "@/lib/fleet/view-model";
import { cn } from "@/lib/cn";
import { formatDemoSandboxId, isDemoModePublic } from "@/lib/demo/mode";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
	DEFAULT_MODEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

const POLL_MS = 5000;

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
	const [data, setData] = useState<Payload | null>(null);
	const [logsById, setLogsById] = useState<Record<string, LogLine[]>>({});
	const [logsFetched, setLogsFetched] = useState<Record<string, boolean>>({});
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<string | null>(null);
	const [showProvision, setShowProvision] = useState(false);
	const loadout = useFleetLoadout();

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
				<div className="flex items-center justify-between">
					<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						Fleet
					</h2>
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

			{visible.length > 0 ? (
				<section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
								delaySec={idx * 0.65}
								logsLoaded={isFleetLogsLoaded(machine, logsFetched)}
								editing={editing === machine.id}
								onChange={refresh}
								onToggleEdit={() =>
									setEditing((prev) => (prev === machine.id ? null : machine.id))
								}
								onSavedEdit={() => {
									setEditing(null);
									void refresh();
								}}
								EditPanel={EditPanel}
							/>
						);
					})}
				</section>
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
			<ReticleHatch className="h-1.5 border-b border-[var(--ret-border)]" pitch={6} />
			<div className="space-y-3 p-6 text-center">
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
			if (isDemoModePublic()) {
				await new Promise((r) => setTimeout(r, 1200));
			}
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
			const displayId = isDemoModePublic() ? formatDemoSandboxId(machineId) : machineId;
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

			if (isDemoModePublic()) {
				for (const delay of [800, 1600, 2400, 3200, 4000]) {
					window.setTimeout(() => void onRefresh(), delay);
				}
				window.setTimeout(onDone, 4200);
			} else {
				window.setTimeout(onDone, 1500);
			}
		} catch (e) {
			setErr(e instanceof Error ? e.message : "provision failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<ReticleFrame>
			<ReticleHatch className="h-1 border-b border-[var(--ret-border)]" pitch={6} />
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

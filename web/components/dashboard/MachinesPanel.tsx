"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { MachineFleetCard } from "@/components/dashboard/MachineFleetCard";
import { FleetInteractPane } from "@/components/dashboard/FleetInteractPane";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { WorkspacePreview } from "@/components/dashboard/WorkspacePreview";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleSelect } from "@/components/reticle/ReticleSelect";
import { SearchOutline as Search, Server, SquareTerminal } from "@/components/ui/icons";
import { filterFleet, type FleetFilter } from "@/lib/dashboard/fleet-presentation";
import type { LogLine } from "@/lib/dashboard/types";
import { fetchLogTail, headlineFromLogs, isFleetLogsLoaded, shouldFetchFleetLogs } from "@/lib/fleet/fetch-log-tail";
import { useDashboardConfig } from "@/components/dashboard/DashboardConfigProvider";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { compactSpec, reportedMachineSpec, toFleetStreamCard } from "@/lib/fleet/view-model";
import { cn } from "@/lib/cn";
import { waitForControlPlaneOperation } from "@/lib/control-plane/client";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
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
		| { ok: true; state: string; rawPhase: string; lastError: string | null; spec?: Partial<MachineSpec> }
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
	const [view, setView] = useState<FleetView>("table");
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<FleetFilter>("all");
	const refreshGeneration = useRef(0);

	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
			if (saved === "cards" || saved === "table") setView(saved);
		} catch {
			// Private browsing may disable storage; the table still works.
		}
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
		const generation = ++refreshGeneration.current;
		try {
			const response = await fetch("/api/dashboard/machines", {
				cache: "no-store",
			});
			if (!response.ok) {
				if (generation === refreshGeneration.current) setError(`HTTP ${response.status}`);
				return;
			}
			const payload = (await response.json()) as Payload;
			if (generation !== refreshGeneration.current) return;
			if (!payload.ok || !Array.isArray(payload.machines)) throw new Error("Workspace data is unavailable. Try again.");
			setData(payload);
			setError(null);
			// The default table needs metadata only, not a log-tail request per machine.
			if (view !== "cards") return;

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
			if (generation !== refreshGeneration.current) return;
			setLogsById(Object.fromEntries(pairs));
			setLogsFetched((prev) => ({
				...prev,
				...Object.fromEntries(pollable.map((m) => [m.id, true])),
			}));
		} catch (err) {
			if (generation === refreshGeneration.current) setError(err instanceof Error ? err.message : "fetch failed");
		} finally {
			if (generation === refreshGeneration.current) setLoading(false);
		}
	}, [view]);

	useEffect(() => {
		refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") refresh();
		}, POLL_MS);
		return () => { refreshGeneration.current += 1; window.clearInterval(id); };
	}, [refresh]);

	const machines = data?.machines ?? [];
	const current = machines.filter((m) => !m.archived);
	const visible = filterFleet(current, query, statusFilter);
	const archived = machines.filter((m) => m.archived);
	const activeMachineId = data?.activeMachineId ?? null;
	const readyCount = current.filter((machine) => machine.live.ok && machine.live.state === "ready").length;
	const attentionCount = current.filter(
		(machine) => !machine.live.ok || (machine.live.state !== "ready" && machine.live.state !== "sleeping"),
	).length;
	const providerCount = new Set(current.map((machine) => machine.providerKind)).size;
	const activeName = current.find((machine) => machine.id === activeMachineId)?.name ?? "none";
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
				<p role="alert" className="text-sm text-[var(--ret-red)]">
					error: {error} <button type="button" onClick={() => void refresh()} className="ml-2 min-h-9 underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Retry</button>
				</p>
				</ReticleFrame>
			) : null}

			{loading && machines.length === 0 ? (
				<DashboardLoadingState label="Loading your machines…" variant="table" />
			) : null}

			{!loading && machines.length > 0 ? (
				<FleetSummary
					total={current.length}
					ready={readyCount}
					attention={attentionCount}
					providers={providerCount}
					activeName={activeName}
				/>
			) : null}

			{/* New machine controls */}
			{!loading ? (
				<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex min-w-0 items-center gap-3">
						<h2 className="text-lg font-medium text-[var(--ret-text)]">Your fleet</h2>
						<ViewToggle view={view} onChange={selectView} />
					</div>
					<div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:items-center">
						<ReticleButton
							variant="primary"
							size="sm"
							onClick={() => setShowProvision((v) => !v)}
							className="w-full sm:w-auto"
						>
							{showProvision ? "Cancel" : "New machine"}
						</ReticleButton>
						<ReticleButton
							as="a"
							href="/dashboard/setup"
							variant="ghost"
							size="sm"
							className="w-full sm:w-auto"
						>
							Guided setup
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

			{!loading && !error && machines.length === 0 && !showProvision ? (
				<WorkspacePreview onCreate={() => setShowProvision(true)} />
			) : null}

			{!loading && current.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 focus-within:border-[var(--ret-purple)]">
            <Search size={18} aria-hidden="true" className="shrink-0 text-[var(--ret-text-muted)]" />
            <span className="sr-only">Search machines</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, runtime, provider, or model…" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-[var(--ret-text)] outline-none placeholder:text-[var(--ret-text-muted)]" />
          </label>
          <div className="w-full sm:w-44"><ReticleSelect ariaLabel="Filter machine status" value={statusFilter} onChange={(value) => setStatusFilter(value as FleetFilter)} options={[{ value: "all", label: "All statuses" }, { value: "ready", label: "Running" }, { value: "sleeping", label: "Sleeping" }, { value: "attention", label: "Needs attention" }]} /></div>
          <span role="status" className="text-sm text-[var(--ret-text-muted)]">{visible.length} of {current.length}</span>
        </div>
      ) : null}
      {!loading && current.length > 0 && visible.length === 0 ? <EmptyShell title="No matching machines" body="Try another name, provider, runtime, or status." cta={<ReticleButton variant="ghost" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Clear filters</ReticleButton>} /> : null}

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
								? "grid max-h-[calc(100dvh-12rem)] grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-1"
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
				<details className="rounded-xl border border-[var(--ret-border)] p-5">
					<summary className="cursor-pointer text-base font-medium focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Archived machines ({archived.length})</summary>
					<p className="my-4 text-sm text-[var(--ret-text-muted)]">Archiving hides a machine from your active fleet. It does not stop provider billing.</p>
					<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
						{archived.map((machine, idx) => {
							const card = cardsById.get(machine.id);
							if (!card) return null;
							return (
								<MachineFleetCard
									key={machine.id}
									machine={machine}
									card={card}
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
				</details>
			) : null}
		</DashboardPageBody>
	);
}

function FleetSummary({
	total,
	ready,
	attention,
	providers,
	activeName,
}: {
	total: number;
	ready: number;
	attention: number;
	providers: number;
	activeName: string;
}) {
	const cells = [
		{ label: "machines", value: String(total), tone: "text-[var(--ret-text)]" },
		{ label: "ready", value: String(ready), tone: "text-[var(--ret-green)]" },
		{ label: "attention", value: String(attention), tone: attention > 0 ? "text-[var(--ret-amber)]" : "text-[var(--ret-text-muted)]" },
		{ label: "providers", value: String(providers), tone: "text-[var(--ret-purple)]" },
		{ label: "active", value: activeName, tone: "text-[var(--ret-text)]" },
	];
	return (
		<ReticleFrame corners={false} className="grid overflow-hidden sm:grid-cols-2 lg:grid-cols-[0.7fr_0.7fr_0.8fr_0.8fr_2fr]">
			{cells.map((cell) => (
				<div key={cell.label} className="min-w-0 border-b border-[var(--ret-border)] px-5 py-4 last:border-b-0 sm:border-r lg:border-b-0">
					<p className="text-sm capitalize text-[var(--ret-text-muted)]">{cell.label}</p>
					<p className={cn("mt-2 truncate text-xl font-medium tabular-nums", cell.tone)} title={cell.value}>{cell.value}</p>
				</div>
			))}
		</ReticleFrame>
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
						"min-h-10 px-3 py-2 text-sm capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ret-purple)]",
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
    <ReticleFrame corners={false} className="overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Machines in your fleet. Status and allocation are reported by the provider.</caption>
          <thead className="bg-[var(--ret-bg-soft)] text-[var(--ret-text-muted)]">
            <tr className="border-b border-[var(--ret-border)]">
              {["Machine", "Runtime / provider", "Status", "Actual allocation", "Actions"].map((label) => <th key={label} scope="col" className="px-5 py-4 text-sm font-medium">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {machines.map((machine) => {
              const state = machine.live.ok ? machine.live.state : "unknown";
              const meta = TABLE_PHASE[state] ?? TABLE_PHASE.unknown;
              const allocation = compactSpec(reportedMachineSpec(machine.live));
              const base = `/dashboard/machines/${encodeURIComponent(machine.id)}`;
              return (
                <tr key={machine.id} className="border-b border-[var(--ret-border)] last:border-b-0 hover:bg-[var(--ret-surface)]">
                  <td className="max-w-64 px-5 py-5">
                    <Link href={base} className="block truncate text-[15px] font-medium text-[var(--ret-text)] hover:text-[var(--ret-purple)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">{machine.name}</Link>
                    <p className="mt-1 truncate text-sm text-[var(--ret-text-muted)]">{machine.id === activeMachineId ? "Selected workspace" : machine.model || "Runtime default"}</p>
                  </td>
                  <td className="px-5 py-5 text-[var(--ret-text-dim)]">{AGENT_LABEL[machine.agentKind]}<p className="mt-1 text-sm text-[var(--ret-text-muted)]">{machine.providerLabel}</p></td>
                  <td className="px-5 py-5">
                    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", meta.text)}><span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />{meta.label}</span>
                    {!machine.live.ok ? <p className="mt-1 max-w-52 text-sm text-[var(--ret-text-muted)]">{machine.live.reason}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-5 font-mono text-sm text-[var(--ret-text-dim)]">{allocation}</td>
                  <td className="px-5 py-5"><div className="flex items-center gap-3">
                    <Link href={`${base}/terminal`} aria-label={`Open terminal for ${machine.name}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--ret-border)] px-3 text-sm text-[var(--ret-text)] hover:bg-[var(--ret-bg-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]"><SquareTerminal size={16} aria-hidden="true" />Terminal</Link>
                    <Link href={base} aria-label={`Manage ${machine.name}`} className="min-h-10 content-center text-sm text-[var(--ret-text-muted)] hover:text-[var(--ret-purple)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Manage</Link>
                  </div></td>
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
				<Server aria-hidden="true" size={28} className="mx-auto mb-4 text-[var(--ret-text-muted)]" />
				<h3 className="text-xl font-medium">{title}</h3>
				<p className="mx-auto max-w-[60ch] text-base leading-7 text-[var(--ret-text-dim)]">
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
			const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
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
				<p className="text-sm text-[var(--ret-red)]">
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
	const config = useDashboardConfig();
	const [providerKind, setProviderKind] = useState<ProviderKind>(config?.draftProviderKind && PROVIDER_KINDS.includes(config.draftProviderKind) ? config.draftProviderKind : "daytona");
	const [agentKind, setAgentKind] = useState<AgentKind>("hermes");
	const [model, setModel] = useState("");
	const [name, setName] = useState("");
	const [vcpu, setVcpu] = useState("1");
	const [memoryMib, setMemoryMib] = useState("2048");
	const [storageGib, setStorageGib] = useState("10");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [result, setResult] = useState<string | null>(null);

	const credentials = config ? validateAgentCredentials(agentKind, config) : null;
	const canProvision = Boolean(config?.providers[providerKind]?.configured && credentials?.ok);
	async function provision() {
		if (!canProvision || busy) return;
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
			const operationId = (data.operation as { id?: string } | undefined)?.id;
			if (!operationId) throw new Error("provision response did not include an operation");
			setResult("Intent accepted -- provisioning and bootstrapping...");
			const completed = await waitForControlPlaneOperation(operationId);
			const machineId = completed.machineId;
			if (!machineId) throw new Error("provision completed without a machine id");
			const displayId = machineId;
			setResult(`Ready: ${displayId}`);
			await onRefresh();

			onDone();
		} catch (e) {
			setErr(e instanceof Error ? e.message : "provision failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<ReticleFrame>
			<div className="space-y-3 p-4">
				<p className="text-sm font-medium text-[var(--ret-text-muted)]">
					Quick provision
				</p>
				{err ? (
					<p className="break-words text-sm text-[var(--ret-red)]">{err}</p>
				) : null}
				{result ? (
					<p className="break-words text-sm text-[var(--ret-green)]">{result}</p>
				) : null}
				<div className="grid gap-3 md:grid-cols-3">
					<label className="flex flex-col gap-1.5">
						<span className="text-sm font-medium text-[var(--ret-text-muted)]">
							Provider
						</span>
						<ReticleSelect
							ariaLabel="Provider"
							value={providerKind}
							onChange={(v) => setProviderKind(v as ProviderKind)}
							options={PROVIDER_KINDS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
						/>
					</label>
					<label className="flex flex-col gap-1.5">
						<span className="text-sm font-medium text-[var(--ret-text-muted)]">
							Agent
						</span>
						<ReticleSelect
							ariaLabel="Agent"
							value={agentKind}
							onChange={(v) => { setAgentKind(v as AgentKind); setModel(""); }}
							options={(["hermes", "openclaw", "claude-code", "codex"] as const).map((a) => ({
								value: a,
								label: AGENT_LABEL[a],
							}))}
						/>
					</label>
					<EditField label="name" value={name} onChange={setName} placeholder="my-agent" />
				</div>
				<div className="grid gap-3 md:grid-cols-4">
					<EditField label="Model ID (optional)" value={model} onChange={setModel} placeholder="Leave blank for a supported runtime default" colSpan />
					<EditField label="Requested vCPU" value={vcpu} onChange={setVcpu} placeholder="1" />
					<EditField label="Requested RAM (MiB)" value={memoryMib} onChange={setMemoryMib} placeholder="2048" />
					<EditField label="Requested disk (GiB)" value={storageGib} onChange={setStorageGib} placeholder="10" />
				</div>
				{providerKind === "e2b" ? (
					<p className="text-sm text-[var(--ret-amber)]">E2B allocation is defined by its template. These sizing requests do not resize the sandbox; a larger allocation requires a suitable E2B template.</p>
				) : null}
				<p className="text-sm leading-6 text-[var(--ret-text-muted)]">Launching creates paid compute on your provider account. Sizing is requested; actual allocation and runtime support depend on the provider.</p>
        {!canProvision ? <p role="status" className="text-sm leading-6 text-[var(--ret-amber)]">{!config ? "Loading configuration…" : !config.providers[providerKind]?.configured ? `Add ${PROVIDER_LABEL[providerKind]} credentials before launching.` : credentials && !credentials.ok ? credentials.message : "Connect model credentials."} <Link href="/dashboard/settings" className="underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Open Settings</Link></p> : null}
        <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
					<ReticleButton variant="ghost" size="sm" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
						Cancel
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={() => void provision()} disabled={busy || !canProvision} className="w-full sm:w-auto">
						{busy ? "Launching…" : "Launch machine"}
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
		<label className={cn("flex min-w-0 flex-col gap-1.5", colSpan ? "md:col-span-2" : "")}>
			<span className="text-sm font-medium text-[var(--ret-text-muted)]">
				{label}
			</span>
			<input
				type={password ? "password" : "text"}
				autoComplete="off"
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				className="min-h-10 min-w-0 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 text-[15px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
			/>
		</label>
	);
}

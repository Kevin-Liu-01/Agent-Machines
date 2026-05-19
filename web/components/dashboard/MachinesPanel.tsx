"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
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

const STATE_TONE: Record<string, string> = {
	ready: "ok",
	starting: "info",
	sleeping: "muted",
	destroying: "warn",
	destroyed: "muted",
	error: "warn",
	unknown: "muted",
};

const STATE_LABEL: Record<string, string> = {
	ready: "ready",
	starting: "starting",
	sleeping: "sleeping",
	destroying: "destroying",
	destroyed: "destroyed",
	error: "error",
	unknown: "unknown",
};

const PROVIDER_LOGO: Record<ProviderKind, "dedalus" | "nous" | "cursor" | "e2b" | "sprites" | null> =
	{
		dedalus: "dedalus",
		e2b: "e2b",
		sprites: "sprites",
	};

export function MachinesPanel() {
	const [data, setData] = useState<Payload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<string | null>(null);
	const [showProvision, setShowProvision] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const response = await fetch("/api/dashboard/machines", {
				cache: "no-store",
			});
			if (!response.ok) {
				setError(`HTTP ${response.status}`);
				return;
			}
			setData((await response.json()) as Payload);
			setError(null);
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
				<section className="grid gap-3 lg:grid-cols-2">
					{[0, 1].map((i) => (
						<ReticleFrame key={i}>
							<div className="space-y-3 p-4">
								<div className="flex items-center justify-between">
									<Skeleton className="h-3 w-1/3" />
									<Skeleton className="h-3 w-16" />
								</div>
								<div className="grid grid-cols-2 gap-2">
									{[0, 1, 2, 3].map((j) => (
										<div key={j} className="space-y-1">
											<Skeleton className="h-2 w-1/3" />
											<Skeleton className="h-3 w-2/3" />
										</div>
									))}
								</div>
								<BrailleSpinner
									name="orbit"
									label="probing per-provider state"
									className="text-[10px] text-[var(--ret-text-muted)]"
								/>
							</div>
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
				<section className="space-y-3">
					<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						Active fleet ({visible.length})
					</h2>
					<div className="grid gap-3 lg:grid-cols-2">
						{visible.map((machine) => (
							<MachineCard
								key={machine.id}
								machine={machine}
								active={machine.id === data?.activeMachineId}
								onChange={refresh}
								editing={editing === machine.id}
								onToggleEdit={() =>
									setEditing((prev) => (prev === machine.id ? null : machine.id))
								}
								onSavedEdit={() => {
									setEditing(null);
									void refresh();
								}}
							/>
						))}
					</div>
				</section>
			) : null}

			{archived.length > 0 ? (
				<section className="space-y-3">
					<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						Archived ({archived.length})
					</h2>
					<div className="grid gap-3 lg:grid-cols-2">
						{archived.map((machine) => (
							<MachineCard
								key={machine.id}
								machine={machine}
								active={false}
								onChange={refresh}
								editing={false}
								onToggleEdit={() => setEditing(machine.id)}
								onSavedEdit={() => void refresh()}
							/>
						))}
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

function MachineCard({
	machine,
	active,
	onChange,
	editing,
	onToggleEdit,
	onSavedEdit,
}: {
	machine: LiveMachine;
	active: boolean;
	onChange: () => Promise<void>;
	editing: boolean;
	onToggleEdit: () => void;
	onSavedEdit: () => void;
}) {
	const router = useRouter();
	const stateName = machine.live.ok ? machine.live.state : "unknown";
	const stateTone = STATE_TONE[stateName] ?? "muted";
	const stateLabel = STATE_LABEL[stateName] ?? stateName;
	const providerMessage =
		machine.live.ok && machine.live.lastError ? machine.live.lastError : null;
	const isActualError = stateName === "error";
	const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
	const providerLogo = PROVIDER_LOGO[machine.providerKind];

	function handleDrillIn() {
		if (!machine.archived) {
			router.push(`/dashboard/machines/${machine.id}`);
		}
	}

	return (
		<ReticleFrame>
			<div
			role={machine.archived ? undefined : "link"}
			tabIndex={machine.archived ? undefined : 0}
			onClick={handleDrillIn}
			onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDrillIn(); } }}
				className={cn(
					"flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-2 text-[11px]",
					!machine.archived && "cursor-pointer transition-colors hover:bg-[var(--ret-surface)]",
				)}
			>
				<div className="flex items-center gap-2 min-w-0">
					{providerLogo ? <Logo mark={providerLogo} size={14} /> : null}
				<span className="truncate text-[12px] text-[var(--ret-text)]">
					{machine.name}
				</span>
					{active ? (
						<ReticleBadge variant="accent" className="text-[10px]">
							active
						</ReticleBadge>
					) : null}
					{machine.archived ? (
						<ReticleBadge variant="default" className="text-[10px]">
							archived
						</ReticleBadge>
					) : null}
				</div>
				<StateBadge tone={stateTone}>{stateLabel}</StateBadge>
			</div>
			<dl className="grid grid-cols-2 gap-px bg-[var(--ret-border)]">
				<MetaRow label="provider" value={machine.providerLabel} />
				<MetaRow label="agent" value={AGENT_LABEL[machine.agentKind]} />
				<MetaRow
					label="spec"
					value={`${machine.spec.vcpu}v . ${memGib}G . ${machine.spec.storageGib}G`}
				/>
				<MetaRow label="model" value={machine.model} />
				<MetaRow
					label="machine id"
					value={machine.id}
					copyable
				/>
				<MetaRow
					label="created"
					value={new Date(machine.createdAt).toLocaleString()}
				/>
			</dl>
			{providerMessage ? (
				<p
				className={cn(
					"border-t border-[var(--ret-border)] px-4 py-2 text-[10px]",
						isActualError
							? "bg-[var(--ret-red)]/5 text-[var(--ret-red)]"
							: "bg-[var(--ret-amber)]/5 text-[var(--ret-amber)]",
					)}
				>
					{isActualError ? "last error" : "status"}:{" "}
					{providerMessage.slice(0, 240)}
				</p>
			) : null}
			{!machine.live.ok ? (
			<p className="border-t border-[var(--ret-border)] bg-[var(--ret-amber)]/5 px-4 py-2 text-[10px] text-[var(--ret-amber)]">
				probe failed: {machine.live.reason.slice(0, 240)}
				</p>
			) : null}
			{editing ? (
				<EditPanel
					machineId={machine.id}
					name={machine.name}
					apiUrl={machine.apiUrl ?? ""}
					hasApiKey={machine.hasApiKey}
					model={machine.model}
					onCancel={onToggleEdit}
					onSaved={onSavedEdit}
				/>
			) : (
				<div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ret-border)] px-4 py-2 text-[11px]">
					<span className="text-[var(--ret-text-muted)]">
						{machine.apiUrl ? (
							<>
								gw:{" "}
								<span className="text-[var(--ret-text-dim)]">
									{shortenUrl(machine.apiUrl)}
								</span>
							</>
						) : (
							<>gw: not yet wired</>
						)}
					</span>
					<div className="flex items-center gap-1">
						{!machine.archived ? (
							<ReticleButton
								as="a"
								href={`/dashboard/machines/${machine.id}`}
								variant="ghost"
								size="sm"
							>
								Open
							</ReticleButton>
						) : null}
						<ReticleButton variant="ghost" size="sm" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleEdit(); }}>
							Edit
						</ReticleButton>
						<MachineActions
							machineId={machine.id}
							state={stateName as MachineActionState}
							capabilities={machine.capabilities}
							active={active}
							archived={machine.archived ?? false}
							allowDestroy
							onChange={onChange}
						/>
					</div>
				</div>
			)}
		</ReticleFrame>
	);
}

function shortenUrl(url: string): string {
	try {
		const u = new URL(url);
		return `${u.host}${u.pathname.replace(/\/$/, "")}`;
	} catch {
		return url.slice(0, 40);
	}
}

function StateBadge({
	tone,
	children,
}: {
	tone: string;
	children: React.ReactNode;
}) {
	const cls =
		tone === "ok"
			? "border border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
			: tone === "warn"
				? "border border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]"
				: tone === "info"
					? "border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border border-[var(--ret-border)] text-[var(--ret-text-muted)]";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
				cls,
			)}
		>
			<span className="h-1 w-1 bg-current" />
			{children}
		</span>
	);
}

function MetaRow({
	label,
	value,
	copyable,
}: {
	label: string;
	value: string;
	copyable?: boolean;
}) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-2">
			<dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</dt>
			<dd
				className={cn(
					"mt-0.5 truncate font-mono text-[11px] text-[var(--ret-text)]",
					copyable ? "cursor-copy" : "",
				)}
				title={value}
				onClick={() => {
					if (copyable && typeof navigator !== "undefined") {
						void navigator.clipboard.writeText(value).catch(() => undefined);
					}
				}}
			>
				{value}
			</dd>
		</div>
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
	onDone,
	onCancel,
}: {
	onDone: () => void;
	onCancel: () => void;
}) {
	const [providerKind, setProviderKind] = useState<ProviderKind>("dedalus");
	const [agentKind, setAgentKind] = useState<AgentKind>("hermes");
	const [model, setModel] = useState("anthropic/claude-sonnet-4-6");
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
			setResult(`Provisioned: ${data.machineId as string} (${data.state as string})`);
			setTimeout(onDone, 1500);
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
					<EditField label="model" value={model} onChange={setModel} placeholder="anthropic/claude-sonnet-4-6" colSpan />
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

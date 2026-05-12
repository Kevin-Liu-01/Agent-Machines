"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_KINDS,
	AGENT_LABEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

/**
 * Fleet monitoring strip for the Overview page.
 *
 * Shows every machine on the user's account at a glance -- not just
 * the active one -- with their live phase, agent, spec, and a
 * compact action bar (wake / set active / archive). The "spin up"
 * button at the top opens an inline provisioning form so creating
 * a new machine never leaves the dashboard.
 *
 * Polls /api/dashboard/machines every 5s. Cheap because that
 * endpoint already batches per-provider state probes server-side.
 */

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

type SpawnState =
	| { phase: "idle" }
	| { phase: "submitting"; agent: AgentKind; provider: ProviderKind }
	| { phase: "ok"; machineId: string; message: string }
	| { phase: "error"; message: string };

const STATE_TONE: Record<string, "ok" | "warn" | "info" | "muted"> = {
	ready: "ok",
	starting: "info",
	sleeping: "muted",
	destroying: "warn",
	destroyed: "muted",
	error: "warn",
	unknown: "muted",
};

const PROVIDER_MARK: Record<ProviderKind, "dedalus" | null> = {
	dedalus: "dedalus",
	"vercel-sandbox": null,
	fly: null,
};

const AGENT_MARK: Record<AgentKind, "nous" | "openclaw" | "anthropic" | "openai"> = {
	hermes: "nous",
	openclaw: "openclaw",
	"claude-code": "anthropic",
	codex: "openai",
};

export function FleetMonitor() {
	const [data, setData] = useState<Payload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [spawn, setSpawn] = useState<SpawnState>({ phase: "idle" });

	const refresh = useCallback(async () => {
		try {
			const response = await fetch("/api/dashboard/machines", {
				cache: "no-store",
			});
			if (!response.ok) {
				setError(`HTTP ${response.status}`);
				return;
			}
			const body = (await response.json()) as Payload;
			setData(body);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "fetch failed");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [refresh]);

	const provision = useCallback(
		async (input: {
			agent: AgentKind;
			provider: ProviderKind;
			spec: MachineSpec;
			name?: string;
		}): Promise<void> => {
			setSpawn({
				phase: "submitting",
				agent: input.agent,
				provider: input.provider,
			});
			try {
				const response = await fetch(
					"/api/dashboard/admin/provision-machine",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							agentKind: input.agent,
							providerKind: input.provider,
							spec: input.spec,
							name: input.name,
						}),
					},
				);
				const body = (await response.json().catch(() => ({}))) as {
					ok?: boolean;
					machineId?: string;
					message?: string;
					error?: string;
				};
				if (!response.ok || !body.machineId) {
					throw new Error(
						body.message ?? body.error ?? `HTTP ${response.status}`,
					);
				}
				setSpawn({
					phase: "ok",
					machineId: body.machineId,
					message: body.message ?? "Provisioned.",
				});
				await refresh();
				// Stay on the form briefly so the success message is
				// visible, then collapse it.
				window.setTimeout(() => {
					setShowForm(false);
					setSpawn({ phase: "idle" });
				}, 2200);
			} catch (err) {
				setSpawn({
					phase: "error",
					message: err instanceof Error ? err.message : "provision failed",
				});
			}
		},
		[refresh],
	);

	const machines = data?.machines ?? [];
	const visible = useMemo(() => machines.filter((m) => !m.archived), [machines]);
	const active = visible.find((m) => m.id === data?.activeMachineId) ?? null;

	const summary = useMemo(() => summarize(visible), [visible]);

	return (
		<section className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ret-border)] px-4 py-2.5">
				<div className="flex items-center gap-2">
					<ReticleLabel>FLEET</ReticleLabel>
					<ReticleBadge>
						{summary.total} {summary.total === 1 ? "machine" : "machines"}
					</ReticleBadge>
					{summary.running > 0 ? (
						<ReticleBadge variant="success">
							{summary.running} running
						</ReticleBadge>
					) : null}
					{summary.sleeping > 0 ? (
						<ReticleBadge>{summary.sleeping} asleep</ReticleBadge>
					) : null}
					{summary.failed > 0 ? (
						<ReticleBadge variant="warning">
							{summary.failed} failed
						</ReticleBadge>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void refresh()}
						className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
					>
						refresh
					</button>
					<ReticleButton
						as="button"
						type="button"
						variant={showForm ? "ghost" : "primary"}
						size="sm"
						onClick={() => {
							setSpawn({ phase: "idle" });
							setShowForm((v) => !v);
						}}
					>
						{showForm ? "Cancel" : "+ Spin up new machine"}
					</ReticleButton>
				</div>
			</header>

			{showForm ? (
				<SpinUpForm
					busy={spawn.phase === "submitting"}
					result={spawn}
					onSubmit={provision}
				/>
			) : null}

			{error ? (
				<p className="border-b border-[var(--ret-border)] bg-[var(--ret-red)]/5 px-4 py-2 font-mono text-[11px] text-[var(--ret-red)]">
					! {error}
				</p>
			) : null}

			{loading && machines.length === 0 ? (
				<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<div key={i} className="space-y-2 bg-[var(--ret-bg)] p-3">
							<Skeleton className="h-3 w-2/3" />
							<Skeleton className="h-3 w-1/3" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					))}
				</div>
			) : null}

			{!loading && machines.length === 0 ? (
				<div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
					<p className="ret-serif text-[18px] text-[var(--ret-text)]">
						no machines yet
					</p>
					<p className="max-w-[60ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						Spin up your first machine using the button above. Each
						machine gets its own{" "}
						<code className="font-mono text-[12px] text-[var(--ret-text)]">
							/home/machine
						</code>{" "}
						volume, gateway port, and agent runtime.
					</p>
				</div>
			) : null}

			{visible.length > 0 ? (
				<ul className="grid gap-px bg-[var(--ret-border)] md:grid-cols-2 lg:grid-cols-3">
					{visible.map((machine) => (
						<MachineRow
							key={machine.id}
							machine={machine}
							active={machine.id === data?.activeMachineId}
							onChange={refresh}
						/>
					))}
				</ul>
			) : null}

			{active ? (
				<footer className="border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					active . {active.name} . {active.id.slice(0, 14)}...
				</footer>
			) : null}
		</section>
	);
}

function summarize(machines: LiveMachine[]) {
	let running = 0;
	let sleeping = 0;
	let failed = 0;
	for (const m of machines) {
		if (!m.live.ok) {
			failed += 1;
			continue;
		}
		if (m.live.state === "ready" || m.live.state === "starting") {
			running += 1;
		} else if (m.live.state === "sleeping") {
			sleeping += 1;
		} else if (m.live.state === "error" || m.live.state === "destroying") {
			failed += 1;
		}
	}
	return { total: machines.length, running, sleeping, failed };
}

function MachineRow({
	machine,
	active,
	onChange,
}: {
	machine: LiveMachine;
	active: boolean;
	onChange: () => Promise<void>;
}) {
	const stateName = machine.live.ok ? machine.live.state : "unknown";
	const tone = STATE_TONE[stateName] ?? "muted";
	const providerMessage =
		machine.live.ok && machine.live.lastError ? machine.live.lastError : null;
	const isActualError = stateName === "error";
	const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
	const providerMark = PROVIDER_MARK[machine.providerKind];
	const ageHrs = Math.max(
		0,
		Math.round(
			(Date.now() - new Date(machine.createdAt).getTime()) / 3_600_000,
		),
	);
	const ageLabel =
		ageHrs < 24
			? `${ageHrs}h`
			: ageHrs < 24 * 30
				? `${Math.round(ageHrs / 24)}d`
				: `${Math.round(ageHrs / (24 * 30))}mo`;
	return (
		<li
			className={cn(
				"relative flex flex-col gap-2 bg-[var(--ret-bg)] px-3 py-3 transition-colors",
				active
					? "ring-1 ring-inset ring-[var(--ret-purple)]/40"
					: "hover:bg-[var(--ret-surface)]",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{providerMark ? <Logo mark={providerMark} size={12} /> : null}
					<span className="truncate font-mono text-[12px] text-[var(--ret-text)]">
						{machine.name}
					</span>
					{active ? (
						<ReticleBadge variant="accent" className="text-[9px]">
							active
						</ReticleBadge>
					) : null}
				</div>
				<StateChip tone={tone}>{stateName}</StateChip>
			</div>
			<dl className="grid grid-cols-3 gap-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
				<Cell label="agent">
					<span className="flex items-center gap-1 text-[var(--ret-text)]">
						<Logo mark={AGENT_MARK[machine.agentKind]} size={9} />
						{AGENT_LABEL[machine.agentKind]}
					</span>
				</Cell>
				<Cell label="spec">
					<span className="text-[var(--ret-text)]">
						{machine.spec.vcpu}v . {memGib}G
					</span>
				</Cell>
				<Cell label="age">
					<span className="text-[var(--ret-text)]">{ageLabel}</span>
				</Cell>
			</dl>
			<p
				className="truncate font-mono text-[10px] text-[var(--ret-text-muted)]"
				title={machine.id}
			>
				{machine.id}
			</p>
			{!machine.live.ok ? (
				<p className="bg-[var(--ret-amber)]/5 px-2 py-1 font-mono text-[10px] text-[var(--ret-amber)]">
					probe failed: {machine.live.reason.slice(0, 80)}
				</p>
			) : providerMessage ? (
				<p
					className={cn(
						"px-2 py-1 font-mono text-[10px]",
						isActualError
							? "bg-[var(--ret-red)]/5 text-[var(--ret-red)]"
							: "bg-[var(--ret-amber)]/5 text-[var(--ret-amber)]",
					)}
					title={providerMessage}
				>
					{isActualError ? "last error" : "status"}:{" "}
					{providerMessage.slice(0, 80)}
				</p>
			) : null}
			<div className="flex justify-end">
				<MachineActions
					machineId={machine.id}
					state={stateName as MachineActionState}
					capabilities={machine.capabilities}
					active={active}
					archived={machine.archived ?? false}
					onChange={onChange}
				/>
			</div>
		</li>
	);
}

function StateChip({
	tone,
	children,
}: {
	tone: "ok" | "warn" | "info" | "muted";
	children: React.ReactNode;
}) {
	const cls =
		tone === "ok"
			? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
			: tone === "warn"
				? "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]"
				: tone === "info"
					? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-[var(--ret-border)] text-[var(--ret-text-muted)]";
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1 border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.18em]",
				cls,
			)}
		>
			<span className="h-1 w-1 bg-current" />
			{children}
		</span>
	);
}

function Cell({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-0.5 truncate">
			<dt className="text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</dt>
			<dd className="truncate text-[var(--ret-text)]">{children}</dd>
		</div>
	);
}

/* --------------------------------------------------------------------- */
/* Spin-up form                                                          */
/* --------------------------------------------------------------------- */

const PRESETS: ReadonlyArray<{
	id: string;
	label: string;
	hint: string;
	spec: MachineSpec;
}> = [
	{
		id: "small",
		label: "small",
		hint: "1 vCPU . 2 GiB . 10 GiB",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
	},
	{
		id: "medium",
		label: "medium",
		hint: "2 vCPU . 4 GiB . 20 GiB",
		spec: { vcpu: 2, memoryMib: 4096, storageGib: 20 },
	},
	{
		id: "large",
		label: "large",
		hint: "4 vCPU . 8 GiB . 40 GiB",
		spec: { vcpu: 4, memoryMib: 8192, storageGib: 40 },
	},
];

function SpinUpForm({
	busy,
	result,
	onSubmit,
}: {
	busy: boolean;
	result: SpawnState;
	onSubmit: (input: {
		agent: AgentKind;
		provider: ProviderKind;
		spec: MachineSpec;
		name?: string;
	}) => Promise<void>;
}) {
	const [agent, setAgent] = useState<AgentKind>("hermes");
	const [provider, setProvider] = useState<ProviderKind>("dedalus");
	const [presetId, setPresetId] = useState<string>("small");
	const [name, setName] = useState("");

	const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
	const spec = preset.spec;

	function handleSubmit(event: React.FormEvent): void {
		event.preventDefault();
		if (busy) return;
		void onSubmit({
			agent,
			provider,
			spec,
			name: name.trim().length > 0 ? name.trim() : undefined,
		});
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-3 border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 py-3"
		>
			<div className="grid gap-3 md:grid-cols-3">
				<Field label="agent">
					<Choice
						value={agent}
						options={AGENT_KINDS.map((k) => ({
							value: k,
							label: AGENT_LABEL[k],
						}))}
						onChange={(v) => setAgent(v as AgentKind)}
					/>
				</Field>
				<Field label="provider">
					<Choice
						value={provider}
						options={PROVIDER_KINDS.map((k) => ({
							value: k,
							label: PROVIDER_LABEL[k],
							disabled: k !== "dedalus", // others are stubs today
						}))}
						onChange={(v) => setProvider(v as ProviderKind)}
					/>
				</Field>
				<Field label="spec">
					<Choice
						value={presetId}
						options={PRESETS.map((p) => ({
							value: p.id,
							label: `${p.label} . ${p.hint.replace(/ \. /g, "/")}`,
						}))}
						onChange={(v) => setPresetId(v)}
					/>
				</Field>
			</div>
			<Field label="name (optional)">
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder={`${agent}-${provider}-${new Date().toISOString().slice(0, 10)}`}
					className="w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-1.5 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
			</Field>
			<div className="flex flex-wrap items-center justify-between gap-2">
				{/* Endpoint + payload preview stays mono: it's literally
				    a wire-protocol fragment, not body copy. */}
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					POST /api/dashboard/admin/provision-machine . spec {spec.vcpu}v
					. {(spec.memoryMib / 1024).toFixed(1)}G . {spec.storageGib}G
				</p>
				<div className="flex items-center gap-2">
					{result.phase === "ok" ? (
						<ReticleBadge variant="success">
							ok . {result.machineId.slice(0, 14)}...
						</ReticleBadge>
					) : null}
					{result.phase === "error" ? (
						<ReticleBadge variant="warning">
							! {result.message.slice(0, 80)}
						</ReticleBadge>
					) : null}
					<ReticleButton
						as="button"
						type="submit"
						variant="primary"
						size="sm"
						disabled={busy || result.phase === "ok"}
					>
						{busy ? (
							<span className="inline-flex items-center gap-1.5">
								<BrailleSpinner className="text-[var(--ret-text)]" />
								provisioning...
							</span>
						) : (
							<>spin up</>
						)}
					</ReticleButton>
				</div>
			</div>
		</form>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label className="flex flex-col gap-1">
			<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			{children}
		</label>
	);
}

function Choice({
	value,
	options,
	onChange,
}: {
	value: string;
	options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
	onChange: (value: string) => void;
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--ret-text)] focus:border-[var(--ret-purple)] focus:outline-none"
		>
			{options.map((opt) => (
				<option key={opt.value} value={opt.value} disabled={opt.disabled}>
					{opt.label}
					{opt.disabled ? " (coming soon)" : ""}
				</option>
			))}
		</select>
	);
}

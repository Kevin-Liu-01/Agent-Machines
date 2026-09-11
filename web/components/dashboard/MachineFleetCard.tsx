"use client";

import Link from "next/link";
import { ArrowRight, Brain, Clock3, Cpu, FolderOpen, MessagesSquare, Network, Pencil, Route, ScrollText, SquareTerminal } from "@/components/ui/icons";

import { Logo } from "@/components/Logo";
import { BootstrapPhaseBadge } from "@/components/dashboard/BootstrapPhaseBadge";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { MigrationPhaseBadge } from "@/components/dashboard/MigrationPhaseBadge";
import { SubstrateMoveMenu } from "@/components/dashboard/SubstrateMoveMenu";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { cn } from "@/lib/cn";
import {
	agentLogoMark,
	modelLogoMark,
	providerLogoMark,
} from "@/lib/fleet/logos";
import type { FleetLoadoutSnapshot } from "@/lib/fleet/use-fleet-loadout";
import { compactSpec, reportedMachineSpec, type FleetStreamCardModel } from "@/lib/fleet/view-model";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
	type AgentKind,
	type BootstrapState,
	type MachineSpec,
	type MigrationState,
	type ProviderKind,
} from "@/lib/user-config/schema";

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
	migrationState?: MigrationState | null;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null; spec?: Partial<MachineSpec> }
		| { ok: false; reason: string };
};

type Props = {
	machine: LiveMachine;
	card: FleetStreamCardModel;
	loadout?: FleetLoadoutSnapshot | null;
	active: boolean;
	focused?: boolean;
	delaySec?: number;
	logsLoaded: boolean;
	editing: boolean;
	onChange: () => Promise<void>;
	onToggleEdit: () => void;
	onSavedEdit: () => void;
	onInteract?: () => void;
	EditPanel: React.ComponentType<{
		machineId: string;
		name: string;
		apiUrl: string;
		hasApiKey: boolean;
		model: string;
		onCancel: () => void;
		onSaved: () => void;
	}>;
};

const STATE_TONE: Record<string, "ok" | "warn" | "info" | "muted"> = {
	ready: "ok",
	starting: "info",
	sleeping: "muted",
	destroying: "warn",
	destroyed: "muted",
	error: "warn",
	unknown: "muted",
};

function StateBadge({ state }: { state: string }) {
	const tone = STATE_TONE[state] ?? "muted";
	const toneClass =
		tone === "ok"
			? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
			: tone === "warn"
				? "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]"
				: tone === "info"
					? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-[var(--ret-border)] text-[var(--ret-text-muted)]";
	return (
		<span className={cn("inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[12px] uppercase tracking-[0.06em]", toneClass)}>
			<span className={cn("h-1 w-1 rounded-full bg-current")} />
			{state}
		</span>
	);
}

function shortenUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.host;
	} catch {
		return url.slice(0, 36);
	}
}

export function MachineFleetCard({
	machine,
	card,
	active,
	focused = false,
	editing,
	onChange,
	onToggleEdit,
	onSavedEdit,
	onInteract,
	EditPanel,
}: Props) {
	const state = machine.live.ok ? machine.live.state : "unknown";
	const providerMessage = machine.live.ok ? machine.live.lastError : machine.live.reason;

	const base = `/dashboard/machines/${encodeURIComponent(machine.id)}`;
	const activity = card.headline ?? card.lines.at(-1) ?? "Waiting for work";
	const connection = machine.apiUrl ? shortenUrl(machine.apiUrl) : "direct control plane";
	const modelMark = modelLogoMark(machine.model);

	return (
		<article className={cn(
			"group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-[var(--ret-bg)]",
			focused ? "border-[var(--ret-purple)] ring-1 ring-[var(--ret-purple)]/20" : active ? "border-[var(--ret-purple)]/35" : "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
			machine.archived && "opacity-70",
		)}>
			<div className={cn("flex flex-wrap items-center gap-2 border-b border-[var(--ret-border)] px-4 py-3")}>
				<StateBadge state={state} />
				{active ? <ReticleBadge variant="accent">active</ReticleBadge> : null}
				{machine.archived ? <ReticleBadge variant="default">archived</ReticleBadge> : null}
				<BootstrapPhaseBadge state={machine.bootstrapState} />
				<MigrationPhaseBadge state={machine.migrationState} />
				<span className={cn("ml-auto font-mono text-[12px] text-[var(--ret-text-muted)]")}>{card.shortId}</span>
			</div>

			<div className={cn("p-4")}>
				<div className={cn("flex min-w-0 items-start justify-between gap-3")}>
					<div className={cn("flex min-w-0 items-center gap-2.5")}>
						<span className={cn("flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]")}>
							<Logo mark={agentLogoMark(machine.agentKind)} size={22} />
						</span>
						<div className={cn("min-w-0")}>
							<Link href={base} title={machine.name} className={cn("block truncate text-[18px] font-medium leading-snug text-[var(--ret-text)] outline-none hover:text-[var(--ret-purple)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>
								{machine.name}
							</Link>
							<p className={cn("mt-1 text-[14px] leading-relaxed text-[var(--ret-text-muted)]")}>
								{AGENT_LABEL[machine.agentKind]} on {machine.providerLabel}
							</p>
						</div>
					</div>
					<Logo mark={providerLogoMark(machine.providerKind)} size={20} />
				</div>

				<div className={cn("mt-4 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3")}>
					<InfoCell icon={Cpu} label="actual allocation" value={compactSpec(reportedMachineSpec(machine.live))} />
					<InfoCell icon={Network} label="Connection" value={connection} />
					<InfoCell icon={Clock3} label="Activity" value={card.lastActivityLabel ?? card.uptime} />
				</div>

				<div className={cn("mt-4 flex min-w-0 items-start gap-3 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3")}>
					<ActivityMark />
					<div className={cn("min-w-0 flex-1")}>
						<p className={cn("text-[14px] font-medium text-[var(--ret-text-muted)]")}>Latest signal</p>
						<p className={cn("mt-1 line-clamp-2 text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>{activity}</p>
					</div>
				</div>

				<div className={cn("mt-4 flex min-w-0 items-center gap-2 border-t border-[var(--ret-border)] pt-3")}>
					{modelMark ? <Logo mark={modelMark} size={16} /> : <Brain aria-hidden="true" size={16} className={cn("shrink-0 text-[var(--ret-text-muted)]")} strokeWidth={1.75} />}
					<span className={cn("min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--ret-text-muted)]")} title={machine.model}>{machine.model}</span>
					<span className={cn("font-mono text-[12px] text-[var(--ret-text-muted)]")}>{card.region}</span>
				</div>
			</div>

			<div className="border-t border-[var(--ret-border)] px-4 py-3"><Link href={`${base}/loadout`} className="inline-flex min-h-9 items-center gap-2 text-sm text-[var(--ret-text-dim)] hover:text-[var(--ret-purple)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]"><Brain size={16} aria-hidden="true" />Inspect tools &amp; memory <ArrowRight size={16} aria-hidden="true" /></Link></div>

			{providerMessage ? (
				<p className={cn("border-t border-[var(--ret-border)] bg-[var(--ret-amber)]/5 px-4 py-3 text-[14px] leading-relaxed text-[var(--ret-amber)]")}>
					{providerMessage.slice(0, 220)}
				</p>
			) : null}

			{editing ? (
				<div className={cn("border-t border-[var(--ret-border)]")}>
					<EditPanel
						machineId={machine.id}
						name={machine.name}
						apiUrl={machine.apiUrl ?? ""}
						hasApiKey={machine.hasApiKey}
						model={machine.model}
						onCancel={onToggleEdit}
						onSaved={onSavedEdit}
					/>
				</div>
			) : (
				<div className={cn("mt-auto border-t border-[var(--ret-border)] px-4 py-3")}>
					{!machine.archived ? (
						<div className={cn("mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]")}>
							<SurfaceLink href={`${base}/console`} label="Console" icon={MessagesSquare} />
							<SurfaceLink href={`${base}/terminal`} label="Terminal" icon={SquareTerminal} />
							<SurfaceLink href={`${base}/logs`} label="Logs" icon={ScrollText} />
							<SurfaceLink href={`${base}/artifacts`} label="Files" icon={FolderOpen} />
							<span className={cn("inline-flex items-center gap-1 text-[var(--ret-purple)]")}>
								<Route aria-hidden="true" size={16} strokeWidth={1.75} />
								<SubstrateMoveMenu machineId={machine.id} migrationState={machine.migrationState} bootstrapRunning={machine.bootstrapState.phase === "running"} />
							</span>
						</div>
					) : null}
					<div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ret-border)] pt-3")}>
						<div className={cn("flex flex-wrap items-center gap-1.5")}>
							{!machine.archived ? <ReticleButton as="a" href={`${base}/terminal`} variant="primary" size="sm"><SquareTerminal size={16} aria-hidden="true" />Open terminal</ReticleButton> : null}
							{onInteract && !machine.archived ? (
								<ReticleButton variant="ghost" size="sm" onClick={onInteract}>Preview console</ReticleButton>
							) : null}
							<ReticleButton as="a" href={base} variant="ghost" size="sm">
								Manage <ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} />
							</ReticleButton>
							<ReticleButton variant="ghost" size="sm" onClick={onToggleEdit}><Pencil aria-hidden="true" size={16} strokeWidth={1.75} /> Edit</ReticleButton>
						</div>
						<MachineActions
							machineId={machine.id}
							providerKind={machine.providerKind}
							state={state as MachineActionState}
							capabilities={machine.capabilities}
							active={active}
							archived={machine.archived ?? false}
							allowDestroy
							onChange={onChange}
						/>
					</div>
				</div>
			)}
		</article>
	);
}

function InfoCell({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
	return (
		<div className={cn("min-w-0 bg-[var(--ret-bg-soft)] px-3 py-3")}>
			<p className={cn("flex items-center gap-1.5 text-[12px] text-[var(--ret-text-muted)]")}>
				<Icon aria-hidden="true" size={14} className={cn("shrink-0")} strokeWidth={1.75} /> {label.charAt(0).toUpperCase() + label.slice(1)}
			</p>
			<p className={cn("mt-2 break-words font-mono text-[13px] leading-relaxed text-[var(--ret-text)]")} title={value}>{value}</p>
		</div>
	);
}

function ActivityMark() {
	return <span aria-hidden="true" className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ret-purple)]")} />;
}

function SurfaceLink({ href, label, icon: Icon }: { href: string; label: string; icon?: typeof Cpu }) {
	return (
		<Link href={href} className={cn("inline-flex min-h-9 items-center gap-1.5 text-[var(--ret-text-muted)] outline-none hover:text-[var(--ret-purple)] active:text-[var(--ret-text)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>
			{Icon ? <Icon aria-hidden="true" size={16} strokeWidth={1.75} /> : null}
			{label}
		</Link>
	);
}

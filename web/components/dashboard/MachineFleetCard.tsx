"use client";

import Link from "next/link";
import { ArrowRight, Clock3, Cpu, Network, Route, SquareTerminal } from "lucide-react";
import { useMemo } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { BootstrapPhaseBadge } from "@/components/dashboard/BootstrapPhaseBadge";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { MigrationPhaseBadge } from "@/components/dashboard/MigrationPhaseBadge";
import { SubstrateMoveMenu } from "@/components/dashboard/SubstrateMoveMenu";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { cn } from "@/lib/cn";
import {
	agentLogoMark,
	modelLogoMark,
	providerLogoMark,
} from "@/lib/fleet/logos";
import type { LoadoutDisplayBadge } from "@/lib/fleet/loadout-badges";
import { resolveMachineLoadoutBadges } from "@/lib/fleet/loadout-badges";
import type { FleetLoadoutSnapshot } from "@/lib/fleet/use-fleet-loadout";
import { compactSpec, type FleetStreamCardModel } from "@/lib/fleet/view-model";
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
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

type Props = {
	machine: LiveMachine;
	card: FleetStreamCardModel;
	loadout: FleetLoadoutSnapshot | null;
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
		<span className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em]", toneClass)}>
			<span className="h-1 w-1 rounded-full bg-current" />
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

function LoadoutRail({
	tools,
	skillCount,
	mcpCount,
}: {
	tools: LoadoutDisplayBadge[];
	skillCount: number;
	mcpCount: number;
}) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3 border-t border-[var(--ret-border)] px-3 py-2">
			<div className="flex min-w-0 items-center gap-1.5">
				{tools.slice(0, 6).map((tool, index) => (
					<span key={`${tool.kind}-${index}`} className="flex h-6 w-6 shrink-0 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text-dim)]">
						{tool.kind === "service" ? (
							<ServiceIcon slug={tool.slug} size={12} tone="mono" />
						) : tool.kind === "mark" ? (
							<Logo mark={tool.mark as Mark} size={12} />
						) : (
							<ToolIcon name={tool.name} size={12} />
						)}
					</span>
				))}
			</div>
			<p className="shrink-0 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
				{skillCount} skills · {mcpCount} MCP
			</p>
		</div>
	);
}

export function MachineFleetCard({
	machine,
	card,
	loadout,
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
	const loadoutBadges = useMemo(() => {
		if (!loadout) {
			return {
				tools: card.tools.map((tool): LoadoutDisplayBadge =>
					tool.kind === "service" ? tool : { kind: "tool", name: tool.name },
				),
				skillCount: 0,
				mcpCount: 0,
			};
		}
		const resolved = resolveMachineLoadoutBadges(loadout.mcps, machine.agentKind);
		return {
			tools: resolved.tools.length > 0
				? resolved.tools
				: card.tools.map((tool): LoadoutDisplayBadge =>
						tool.kind === "service" ? tool : { kind: "tool", name: tool.name },
					),
			skillCount: loadout.skillCount,
			mcpCount: resolved.mcpCount,
		};
	}, [card.tools, loadout, machine.agentKind]);

	const base = `/dashboard/machines/${machine.id}`;
	const activity = card.headline ?? card.lines.at(-1) ?? "Waiting for work";
	const connection = machine.apiUrl ? shortenUrl(machine.apiUrl) : "direct control plane";
	const modelMark = modelLogoMark(machine.model);

	return (
		<article className={cn(
			"group flex min-w-0 flex-col border bg-[var(--ret-bg)] transition-colors",
			focused ? "border-[var(--ret-purple)] ring-1 ring-[var(--ret-purple)]/20" : active ? "border-[var(--ret-purple)]/35" : "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
			machine.archived && "opacity-70",
		)}>
			<div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--ret-border)] px-3 py-2">
				<StateBadge state={state} />
				{active ? <ReticleBadge variant="accent">active</ReticleBadge> : null}
				{machine.archived ? <ReticleBadge variant="default">archived</ReticleBadge> : null}
				<BootstrapPhaseBadge state={machine.bootstrapState} />
				<MigrationPhaseBadge state={machine.migrationState} />
				<span className="ml-auto font-mono text-[9px] text-[var(--ret-text-muted)]">{card.shortId}</span>
			</div>

			<div className="p-3">
				<div className="flex min-w-0 items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
							<Logo mark={agentLogoMark(machine.agentKind)} size={17} />
						</span>
						<div className="min-w-0">
							<Link href={base} className="block truncate text-[14px] font-medium text-[var(--ret-text)] hover:text-[var(--ret-purple)]">
								{machine.name}
							</Link>
							<p className="mt-0.5 truncate text-[10px] text-[var(--ret-text-muted)]">
								{AGENT_LABEL[machine.agentKind]} on {machine.providerLabel}
							</p>
						</div>
					</div>
					<Logo mark={providerLogoMark(machine.providerKind)} size={16} />
				</div>

				<div className="mt-3 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3">
					<InfoCell icon={Cpu} label="shape" value={compactSpec(machine.spec)} />
					<InfoCell icon={Network} label="connection" value={connection} />
					<InfoCell icon={Clock3} label="activity" value={card.lastActivityLabel ?? card.uptime} />
				</div>

				<div className="mt-3 flex min-w-0 items-start gap-2 border-l border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] px-3 py-2">
					<ActivityMark />
					<div className="min-w-0 flex-1">
						<p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ret-purple)]">latest signal</p>
						<p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-[var(--ret-text-dim)]">{activity}</p>
					</div>
				</div>

				<div className="mt-3 flex min-w-0 items-center gap-2 border-t border-[var(--ret-border)] pt-3">
					{modelMark ? <Logo mark={modelMark} size={13} /> : <BrainMark />}
					<span className="min-w-0 flex-1 truncate font-mono text-[9px] text-[var(--ret-text-muted)]">{machine.model}</span>
					<span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">{card.region}</span>
				</div>
			</div>

			<LoadoutRail {...loadoutBadges} />

			{providerMessage ? (
				<p className="border-t border-[var(--ret-border)] bg-[var(--ret-amber)]/5 px-3 py-2 text-[9px] text-[var(--ret-amber)]">
					{providerMessage.slice(0, 220)}
				</p>
			) : null}

			{editing ? (
				<div className="border-t border-[var(--ret-border)]">
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
				<div className="border-t border-[var(--ret-border)] px-3 py-2.5">
					{!machine.archived ? (
						<div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.14em]">
							<SurfaceLink href={`${base}/console`} label="console" />
							<SurfaceLink href={`${base}/terminal`} label="terminal" icon={SquareTerminal} />
							<SurfaceLink href={`${base}/logs`} label="logs" />
							<SurfaceLink href={`${base}/artifacts`} label="files" />
							<span className="inline-flex items-center gap-1 text-[var(--ret-purple)]">
								<Route size={11} />
								<SubstrateMoveMenu machineId={machine.id} migrationState={machine.migrationState} bootstrapRunning={machine.bootstrapState.phase === "running"} />
							</span>
						</div>
					) : null}
					<div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ret-border)] pt-2">
						<div className="flex flex-wrap items-center gap-1.5">
							{onInteract && !machine.archived ? (
								<ReticleButton variant="primary" size="sm" onClick={onInteract}>Interact</ReticleButton>
							) : null}
							<ReticleButton as="a" href={base} variant={onInteract ? "ghost" : "primary"} size="sm">
								Inspect <ArrowRight size={12} />
							</ReticleButton>
							<ReticleButton variant="ghost" size="sm" onClick={onToggleEdit}>Edit</ReticleButton>
						</div>
						<MachineActions
							machineId={machine.id}
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
		<div className="min-w-0 bg-[var(--ret-bg-soft)] px-2.5 py-2">
			<p className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
				<Icon size={10} /> {label}
			</p>
			<p className="mt-1 truncate font-mono text-[9px] text-[var(--ret-text)]" title={value}>{value}</p>
		</div>
	);
}

function ActivityMark() {
	return <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--ret-purple)]" />;
}

function BrainMark() {
	return <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-[var(--ret-text-muted)]" />;
}

function SurfaceLink({ href, label, icon: Icon }: { href: string; label: string; icon?: typeof Cpu }) {
	return (
		<Link href={href} className="inline-flex items-center gap-1 text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-purple)]">
			{Icon ? <Icon size={11} /> : null}
			{label}
		</Link>
	);
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { FleetLiveTerminal } from "@/components/fleet/FleetLiveTerminal";
import { shouldFetchFleetLogs } from "@/lib/fleet/fetch-log-tail";
import {
	agentLogoMark,
	machineLogoMark,
	modelLogoMark,
	providerLogoMark,
} from "@/lib/fleet/logos";
import { MetaGlyph, type MetaGlyphKind } from "@/lib/fleet/meta-icons";
import { BootstrapPhaseBadge } from "@/components/dashboard/BootstrapPhaseBadge";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { cn } from "@/lib/cn";
import type { LoadoutDisplayBadge } from "@/lib/fleet/loadout-badges";
import { resolveMachineLoadoutBadges } from "@/lib/fleet/loadout-badges";
import type { FleetLoadoutSnapshot } from "@/lib/fleet/use-fleet-loadout";
import type { FleetStreamCardModel } from "@/lib/fleet/view-model";
import type { ProviderCapabilities } from "@/lib/providers";
import {
	AGENT_LABEL,
	type AgentKind,
	type BootstrapState,
	type MachineSpec,
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
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

function shortenUrl(url: string): string {
	try {
		const u = new URL(url);
		return `${u.host}${u.pathname.replace(/\/$/, "")}`;
	} catch {
		return url.slice(0, 48);
	}
}

function formatCreated(iso: string): string {
	try {
		return new Date(iso).toLocaleString(undefined, {
			month: "numeric",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

function StateBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
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
				"inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em]",
				cls,
			)}
		>
			<span className="h-1 w-1 bg-current" />
			{children}
		</span>
	);
}

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

function MetaCell({
	label,
	value,
	copyable,
	mark,
	glyph,
}: {
	label: string;
	value: string;
	copyable?: boolean;
	mark?: Mark | null;
	glyph?: MetaGlyphKind;
}) {
	const showIcon = mark || glyph;

	return (
		<div className="flex min-w-0 items-start gap-2 px-2 py-1.5">
			{showIcon ? (
				<span
					className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg)]"
					title={value}
				>
					{mark ? (
						<Logo mark={mark} size={12} />
					) : glyph ? (
						<MetaGlyph kind={glyph} size={12} />
					) : null}
				</span>
			) : null}
			<div className="min-w-0 flex-1">
				<p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					{label}
				</p>
				<p
					className={cn(
						"mt-0.5 truncate font-mono text-[10px] text-[var(--ret-text)]",
						copyable && "cursor-copy hover:text-[var(--ret-accent)]",
					)}
					title={value}
					onClick={() => {
						if (copyable && typeof navigator !== "undefined") {
							void navigator.clipboard.writeText(value).catch(() => undefined);
						}
					}}
				>
					{value}
				</p>
			</div>
		</div>
	);
}

function LoadedToolsRail({
	tools,
	skillCount,
	mcpCount,
	color,
}: {
	tools: LoadoutDisplayBadge[];
	skillCount: number;
	mcpCount: number;
	color: string;
}) {
	return (
		<div className="border-t border-[var(--ret-border)] px-3 py-2">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Loaded
				</p>
				<p className="font-mono text-[8px] tabular-nums text-[var(--ret-text-dim)]">
					{skillCount} skills · {mcpCount} MCP{mcpCount === 1 ? "" : "s"}
				</p>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{tools.map((t, i) => (
					<span
						key={i}
						className="flex h-6 w-6 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg)]"
						style={{ color }}
						title={
							t.kind === "service" ? t.slug : t.kind === "mark" ? t.mark : t.name
						}
					>
						{t.kind === "service" ? (
							<ServiceIcon slug={t.slug} size={13} tone="mono" />
						) : t.kind === "mark" ? (
							<Logo mark={t.mark as Mark} size={13} />
						) : (
							<ToolIcon name={t.name} size={13} />
						)}
					</span>
				))}
			</div>
		</div>
	);
}

export function MachineFleetCard({
	machine,
	card,
	loadout,
	active,
	focused = false,
	delaySec = 0,
	editing,
	onChange,
	onToggleEdit,
	onSavedEdit,
	onInteract,
	EditPanel,
	logsLoaded,
}: {
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
}) {
	const router = useRouter();
	const color = card.hue;
	const modelMark = modelLogoMark(machine.model);
	const stateName = machine.live.ok ? machine.live.state : "unknown";
	const stateTone = STATE_TONE[stateName] ?? "muted";
	const stateLabel = STATE_LABEL[stateName] ?? stateName;
	const providerMessage =
		machine.live.ok && machine.live.lastError ? machine.live.lastError : null;
	const isActualError = stateName === "error";
	const memGib = (machine.spec.memoryMib / 1024).toFixed(1);

	const preset = useMemo(() => {
		if (!loadout) return null;
		return (
			loadout.config.loadoutPresets.find(
				(p) => p.id === loadout.config.activeLoadoutPresetId,
			) ?? loadout.config.loadoutPresets[0] ?? null
		);
	}, [loadout]);

	const loadoutBadges = useMemo(() => {
		if (!loadout) {
			return {
				tools: card.tools.map(
					(t): LoadoutDisplayBadge =>
						t.kind === "service" ? t : { kind: "tool", name: t.name },
				),
				skillCount: 155,
				mcpCount: 17,
			};
		}
		const resolved = resolveMachineLoadoutBadges(preset, loadout.mcps, machine.agentKind);
		return {
			tools:
				resolved.tools.length > 0
					? resolved.tools
					: card.tools.map(
							(t): LoadoutDisplayBadge =>
								t.kind === "service" ? t : { kind: "tool", name: t.name },
						),
			skillCount: loadout.skillCount,
			mcpCount: resolved.mcpCount,
		};
	}, [loadout, preset, machine.agentKind, card.tools]);

	function handleOpen() {
		if (!machine.archived) router.push(`/dashboard/machines/${machine.id}`);
	}

	return (
		<article
			className={cn(
				"group flex flex-col border bg-[var(--ret-bg)] transition-[border-color] duration-200",
				focused
					? "border-[var(--ret-accent)]/50 ring-1 ring-[var(--ret-accent)]/20"
					: active
						? "border-[var(--ret-purple)]/22"
						: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
				machine.archived && "opacity-75",
			)}
		>
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2">
				<span
					className="flex h-5 w-5 shrink-0 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg)]"
					title="Agent Machines"
				>
					<Logo mark={machineLogoMark()} size={11} />
				</span>
				<span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					machine
				</span>
				{active ? (
					<ReticleBadge variant="accent" className="text-[8px]">
						active
					</ReticleBadge>
				) : null}
				{machine.archived ? (
					<ReticleBadge variant="default" className="text-[8px]">
						archived
					</ReticleBadge>
				) : null}
				<StateBadge tone={stateTone}>{stateLabel}</StateBadge>
				<BootstrapPhaseBadge state={machine.bootstrapState} />
				<span className="ml-auto font-mono text-[9px]" style={{ color }}>
					{card.shortId}
				</span>
			</div>

			<div className="relative h-1 w-full overflow-hidden border-y border-[var(--ret-border)]">
				<div
					className="absolute inset-0 opacity-40"
					style={{
						backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 2px, transparent 2px 5px)`,
					}}
				/>
			</div>

			{/* Body: terminal + meta */}
			<div className="grid min-h-[280px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px]">
				<button
					type="button"
					onClick={handleOpen}
					disabled={!!machine.archived}
					className={cn(
						"flex min-w-0 flex-col border-b border-[var(--ret-border)] text-left md:border-b-0 md:border-r",
						!machine.archived && "cursor-pointer",
						"focus:outline-none focus-visible:outline-none",
					)}
				>
					<div className="flex items-center gap-2.5 border-b border-dashed border-[var(--ret-border)] px-3 py-3">
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<span
								className="flex h-8 w-8 shrink-0 items-center justify-center border"
								style={{ borderColor: `${color}44`, background: `${color}0a` }}
								title={AGENT_LABEL[machine.agentKind]}
							>
								<Logo mark={agentLogoMark(machine.agentKind)} size={15} />
							</span>
							<div className="min-w-0">
								<p className="truncate text-[13px] font-semibold text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
									{machine.name}
								</p>
								<p className="truncate text-[10px] text-[var(--ret-text-muted)]">
									{AGENT_LABEL[machine.agentKind]} · {machine.providerLabel}
								</p>
							</div>
						</div>
						<span
							className={cn(
								"h-2 w-2 shrink-0 rounded-full",
								card.streamActive && "animate-pulse",
							)}
							style={{
								background: card.state === "error" ? "var(--ret-red)" : color,
								boxShadow: card.state === "sleeping" ? "none" : `0 0 8px ${color}`,
								opacity: card.state === "sleeping" ? 0.35 : 1,
							}}
						/>
					</div>

					<div className="grid grid-cols-3 border-b border-dashed border-[var(--ret-border)] text-center">
						{[
							{ label: "CPU", value: card.cpu },
							{ label: "MEM", value: card.mem },
							{ label: "DISK", value: card.disk },
						].map((s) => (
							<div
								key={s.label}
								className="border-r border-dashed border-[var(--ret-border)] px-1 py-1.5 last:border-r-0"
							>
								<p className="text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									{s.label}
								</p>
								<p className="text-[10px] tabular-nums text-[var(--ret-text-dim)]">{s.value}</p>
							</div>
						))}
					</div>

					<div className="flex-1 bg-[var(--ret-bg-soft)] px-3 py-2.5">
						<div className="mb-1.5 flex items-center gap-1.5">
							<span className="h-1 w-1 rounded-full" style={{ background: color }} />
							<span className="h-1 w-1 rounded-full opacity-40" style={{ background: color }} />
							{card.streamActive ? (
								<span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ret-accent)]">
									live
								</span>
							) : null}
							<span className="ml-auto font-mono text-[8px] uppercase tracking-wider text-[var(--ret-text-muted)]">
								{card.region}
							</span>
						</div>
						<FleetLiveTerminal
							lines={card.lines}
							color={color}
							delaySec={delaySec}
							streamActive={card.streamActive}
							loading={shouldFetchFleetLogs(machine) && !logsLoaded}
						/>
					</div>
				</button>

				<div className="flex flex-col bg-[var(--ret-surface)]/20">
					<div className="grid grid-cols-1 divide-y divide-[var(--ret-border)] border-b border-[var(--ret-border)]">
						<MetaCell
							label="provider"
							value={machine.providerLabel}
							mark={providerLogoMark(machine.providerKind)}
						/>
						<MetaCell
							label="agent"
							value={AGENT_LABEL[machine.agentKind]}
							mark={agentLogoMark(machine.agentKind)}
						/>
						<MetaCell
							label="spec"
							value={`${machine.spec.vcpu}v · ${memGib}G · ${machine.spec.storageGib}G`}
							glyph="spec"
						/>
						<MetaCell label="model" value={machine.model} mark={modelMark} />
						<MetaCell label="created" value={formatCreated(machine.createdAt)} glyph="created" />
						<MetaCell label="machine id" value={machine.id} copyable glyph="machine-id" />
						<MetaCell
							label="gateway"
							value={machine.apiUrl ? shortenUrl(machine.apiUrl) : "not wired"}
							glyph="gateway"
						/>
					</div>
					<div className="mt-auto border-t border-[var(--ret-border)] px-3 py-2 text-[9px] text-[var(--ret-text-muted)]">
						<div className="flex items-center justify-between gap-2 font-mono uppercase tracking-wider">
							<span>↑ {card.uptime}</span>
							{card.lastActivityLabel ? (
								<span className="text-[var(--ret-text-dim)]">{card.lastActivityLabel}</span>
							) : null}
						</div>
					</div>
				</div>
			</div>

			<LoadedToolsRail
				tools={loadoutBadges.tools}
				skillCount={loadoutBadges.skillCount}
				mcpCount={loadoutBadges.mcpCount}
				color={color}
			/>

			{providerMessage ? (
				<p
					className={cn(
						"border-t border-[var(--ret-border)] px-3 py-1.5 text-[9px]",
						isActualError
							? "bg-[var(--ret-red)]/5 text-[var(--ret-red)]"
							: "bg-[var(--ret-amber)]/5 text-[var(--ret-amber)]",
					)}
				>
					{isActualError ? "last error" : "status"}: {providerMessage.slice(0, 200)}
				</p>
			) : null}
			{!machine.live.ok ? (
				<p className="border-t border-[var(--ret-border)] bg-[var(--ret-amber)]/5 px-3 py-1.5 text-[9px] text-[var(--ret-amber)]">
					probe failed: {machine.live.reason.slice(0, 200)}
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
				<div className="flex flex-col gap-2 border-t border-[var(--ret-border)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-wrap items-center gap-2">
						{!machine.archived ? (
							<>
								{onInteract ? (
									<ReticleButton
										variant="primary"
										size="sm"
										onClick={onInteract}
									>
										Chat
									</ReticleButton>
								) : null}
								<ReticleButton
									as="a"
									href={`/dashboard/machines/${machine.id}`}
									variant={onInteract ? "ghost" : "primary"}
									size="sm"
								>
									Open
								</ReticleButton>
							</>
						) : null}
						<ReticleButton variant="ghost" size="sm" onClick={onToggleEdit}>
							Edit
						</ReticleButton>
					</div>
					<div className="flex flex-wrap items-center gap-1 border-t border-[var(--ret-border)] pt-2 sm:border-t-0 sm:pt-0">
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
		</article>
	);
}

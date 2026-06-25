"use client";

/**
 * Left sidebar with switchable views:
 *
 *   Sessions     -- conversations grouped by agent/machine, with richer cards
 *   Automations  -- cron jobs / scheduled tasks from the machine
 *   Loadout      -- quick view of installed skills, tools, MCPs
 *
 * The top has a segmented control to switch views; each view has its
 * own search / filter behavior.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { ConversationSummary } from "@/lib/agents/protocol";
import type { AgentProfile, MachineIntrospection } from "@/lib/agents/machine-introspection";

import { CronManager } from "./CronManager";

type LeftView = "sessions" | "agent" | "automations" | "loadout";

type LoadoutItem = {
	name: string;
	kind: "skill" | "tool" | "mcp";
	description: string;
};

type Props = {
	conversations: ConversationSummary[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onNew: () => void;
	onDelete: (id: string) => void;
	machineOk: boolean;
	machineId: string | null;
	loadoutItems?: LoadoutItem[];
	streaming?: boolean;
};

export function ConversationList({
	conversations,
	activeId,
	onSelect,
	onNew,
	onDelete,
	machineOk,
	machineId,
	loadoutItems = [],
	streaming,
}: Props) {
	const [view, setView] = useState<LeftView>("sessions");
	const [search, setSearch] = useState("");

	const VIEW_TABS: Array<{ id: LeftView; label: string }> = [
		{ id: "sessions", label: "Sessions" },
		{ id: "agent", label: "Agent" },
		{ id: "automations", label: "Crons" },
		{ id: "loadout", label: "Loadout" },
	];

	return (
		<div className="flex h-full flex-col">
			{/* View switcher */}
			<div className="shrink-0 border-b border-[var(--ret-border)] p-2">
				<div className="flex gap-px bg-[var(--ret-border)]">
					{VIEW_TABS.map((v) => (
						<button
							key={v.id}
							type="button"
							onClick={() => { setView(v.id); setSearch(""); }}
							className={cn(
								"flex-1 bg-[var(--ret-bg)] px-1.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.15em] transition-colors",
								view === v.id
									? "text-[var(--ret-purple)]"
									: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
							)}
						>
							{v.label}
						</button>
					))}
				</div>
			</div>

			{/* Search + actions (Agent + Crons views have their own headers) */}
			{view !== "agent" && view !== "automations" ? (
				<div className="shrink-0 border-b border-[var(--ret-border)] p-2">
					<div className="flex items-center gap-2 pb-2">
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder={view === "sessions" ? "Search sessions..." : "Filter loadout..."}
							className={cn(
								"min-w-0 flex-1 border border-[var(--ret-border)] bg-[var(--ret-bg)]",
								"px-2 py-1 font-mono text-[11px] text-[var(--ret-text)]",
								"placeholder:text-[var(--ret-text-muted)]",
								"focus:border-[var(--ret-purple)] focus:outline-none",
							)}
						/>
						{view === "sessions" ? (
							<ReticleButton variant="primary" size="sm" onClick={onNew} disabled={!machineOk}>
								+
							</ReticleButton>
						) : null}
					</div>
				</div>
			) : null}

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{view === "sessions" ? (
					<SessionsView
						conversations={conversations}
						activeId={activeId}
						onSelect={onSelect}
						onDelete={onDelete}
						machineOk={machineOk}
						search={search}
						streaming={streaming}
					/>
				) : view === "agent" ? (
					<AgentIntrospectionView machineOk={machineOk} machineId={machineId} />
				) : view === "automations" ? (
					<CronManager machineId={machineId} machineOk={machineOk} />
				) : (
					<LoadoutView items={loadoutItems} search={search} />
				)}
			</div>
		</div>
	);
}

/* ── Sessions view ─────────────────────────────────────────────────── */

function SessionsView({
	conversations,
	activeId,
	onSelect,
	onDelete,
	machineOk,
	search,
	streaming,
}: {
	conversations: ConversationSummary[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
	machineOk: boolean;
	search: string;
	streaming?: boolean;
}) {
	const filtered = useMemo(() => {
		if (!search.trim()) return conversations;
		const q = search.toLowerCase();
		return conversations.filter(
			(c) =>
				c.title.toLowerCase().includes(q) ||
				c.lastTurnPreview.toLowerCase().includes(q) ||
				(c.model ?? "").toLowerCase().includes(q) ||
				(c.machineId ?? "").toLowerCase().includes(q),
		);
	}, [conversations, search]);

	const grouped = useMemo(() => {
		const groups = new Map<string, ConversationSummary[]>();
		for (const c of filtered) {
			const key = c.machineId ?? "unassigned";
			const list = groups.get(key) ?? [];
			list.push(c);
			groups.set(key, list);
		}
		return groups;
	}, [filtered]);

	const pinned = useMemo(() => filtered.filter((c) => c.pinned), [filtered]);

	if (!machineOk) {
		return (
			<div className="p-3">
				<BrailleSpinner name="orbit" label="connecting" className="text-[10px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	if (filtered.length === 0) {
		return (
			<div className="p-3 font-mono text-[11px] text-[var(--ret-text-muted)]">
				{search ? "No matching sessions" : "No past sessions"}
			</div>
		);
	}

	if (pinned.length > 0) {
		return (
			<>
				<SectionHeader label="Pinned" count={pinned.length} />
				{pinned.map((c) => (
					<SessionCard
						key={c.id}
						conversation={c}
						active={c.id === activeId}
						streaming={streaming && c.id === activeId}
						onSelect={onSelect}
						onDelete={onDelete}
					/>
				))}
				{[...grouped.entries()].map(([machineId, convos]) => {
					const unpinned = convos.filter((c) => !c.pinned);
					if (unpinned.length === 0) return null;
					return (
						<MachineGroup
							key={machineId}
							machineId={machineId}
							conversations={unpinned}
							activeId={activeId}
							streaming={streaming}
							onSelect={onSelect}
							onDelete={onDelete}
						/>
					);
				})}
			</>
		);
	}

	if (grouped.size <= 1) {
		return (
			<>
				{filtered.map((c) => (
					<SessionCard
						key={c.id}
						conversation={c}
						active={c.id === activeId}
						streaming={streaming && c.id === activeId}
						onSelect={onSelect}
						onDelete={onDelete}
					/>
				))}
			</>
		);
	}

	return (
		<>
			{[...grouped.entries()].map(([machineId, convos]) => (
				<MachineGroup
					key={machineId}
					machineId={machineId}
					conversations={convos}
					activeId={activeId}
					streaming={streaming}
					onSelect={onSelect}
					onDelete={onDelete}
				/>
			))}
		</>
	);
}

function MachineGroup({
	machineId,
	conversations,
	activeId,
	streaming,
	onSelect,
	onDelete,
}: {
	machineId: string;
	conversations: ConversationSummary[];
	activeId: string | null;
	streaming?: boolean;
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const hasActive = conversations.some((c) => c.id === activeId);
	const agentKind = conversations[0]?.agentKind;
	const runningCount = streaming && hasActive ? 1 : 0;

	return (
		<div className="border-b border-[var(--ret-border)]">
			<button
				type="button"
				onClick={() => setCollapsed((v) => !v)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--ret-surface)]"
			>
				<span className={cn(
					"font-mono text-[9px] transition-transform",
					collapsed ? "rotate-0" : "rotate-90",
				)}>
					{">"}
				</span>
				<span className="flex-1 truncate font-mono text-[11px] text-[var(--ret-text)]">
					{machineId === "unassigned" ? "Local" : machineId.slice(0, 14)}
				</span>
				{agentKind ? (
					<span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{agentKind}
					</span>
				) : null}
				<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
					{conversations.length}
				</span>
				{runningCount > 0 ? (
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ret-green)]" />
				) : null}
			</button>
			{!collapsed ? (
				<div>
					{conversations.map((c) => (
						<SessionCard
							key={c.id}
							conversation={c}
							active={c.id === activeId}
							streaming={streaming && c.id === activeId}
							onSelect={onSelect}
							onDelete={onDelete}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function SessionCard({
	conversation,
	active,
	streaming,
	onSelect,
	onDelete,
}: {
	conversation: ConversationSummary;
	active: boolean;
	streaming?: boolean;
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	return (
		<div
			className={cn(
				"group relative border-b border-[var(--ret-border)]/30 p-2.5 pl-5 transition-colors",
				active ? "bg-[var(--ret-purple-glow)]" : "hover:bg-[var(--ret-surface)]",
			)}
		>
			{/* Active rail */}
			{active ? (
				<span className="absolute inset-y-0 left-0 w-px bg-[var(--ret-purple)]" />
			) : null}

			<button type="button" onClick={() => onSelect(conversation.id)} className="w-full text-left">
				{/* Title row */}
				<div className="flex items-center gap-1.5">
					{streaming ? (
						<span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--ret-green)]" />
					) : conversation.pinned ? (
						<span className="shrink-0 font-mono text-[8px] text-[var(--ret-amber)]">◆</span>
					) : null}
					<p className={cn(
						"flex-1 truncate font-mono text-[12px]",
						active ? "text-[var(--ret-purple)]" : "text-[var(--ret-text)]",
					)}>
						{conversation.title}
					</p>
				</div>

				{/* Preview line */}
				{conversation.lastTurnPreview && conversation.lastTurnPreview !== conversation.title ? (
					<p className="mt-0.5 truncate text-[10px] text-[var(--ret-text-dim)]">
						{conversation.lastTurnPreview}
					</p>
				) : null}

				{/* Meta row */}
				<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
					<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
						{conversation.turnCount} msg
					</span>
					<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
						{timeAgo(conversation.updatedAt)}
					</span>
					{conversation.model ? (
						<span className="truncate font-mono text-[8px] text-[var(--ret-text-muted)]">
							{conversation.model}
						</span>
					) : null}
					{streaming ? (
						<span className="font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ret-green)]">
							streaming
						</span>
					) : null}
				</div>
			</button>

			{/* Hover actions */}
			<div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						if (window.confirm("Delete this session?")) onDelete(conversation.id);
					}}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)] hover:border-[var(--ret-red)]/50 hover:text-[var(--ret-red)]"
				>
					del
				</button>
			</div>
		</div>
	);
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
	return (
		<div className="flex items-center gap-2 border-b border-[var(--ret-border)] px-3 py-1.5">
			<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			{count !== undefined ? (
				<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{count}</span>
			) : null}
		</div>
	);
}

/* ── Loadout view ──────────────────────────────────────────────────── */

function LoadoutView({
	items,
	search,
}: {
	items: LoadoutItem[];
	search: string;
}) {
	const filtered = useMemo(() => {
		if (!search.trim()) return items;
		const q = search.toLowerCase();
		return items.filter(
			(i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
		);
	}, [items, search]);

	const byKind = useMemo(() => {
		const groups: Record<string, LoadoutItem[]> = {};
		for (const item of filtered) {
			const list = groups[item.kind] ?? [];
			list.push(item);
			groups[item.kind] = list;
		}
		return groups;
	}, [filtered]);

	if (filtered.length === 0) {
		return (
			<div className="p-3 font-mono text-[11px] text-[var(--ret-text-muted)]">
				{search ? "No matching items" : "No loadout data"}
			</div>
		);
	}

	const kindIcons: Record<string, string> = { skill: "⊡", tool: "⚡", mcp: "⊕" };
	const kindLabels: Record<string, string> = { skill: "Skills", tool: "Tools", mcp: "MCP Servers" };

	return (
		<div>
			{Object.entries(byKind).map(([kind, items]) => (
				<div key={kind}>
					<SectionHeader label={kindLabels[kind] ?? kind} count={items.length} />
					{items.map((item) => (
						<div
							key={item.name}
							className="flex items-start gap-2 border-b border-[var(--ret-border)]/20 px-3 py-2 hover:bg-[var(--ret-surface)]"
						>
							<span className="shrink-0 pt-0.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
								{kindIcons[item.kind] ?? "·"}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate font-mono text-[11px] text-[var(--ret-text)]">{item.name}</p>
								<p className="mt-0.5 truncate text-[9px] text-[var(--ret-text-dim)]">{item.description}</p>
							</div>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

/* ── Agent introspection view ──────────────────────────────────────── */

function AgentIntrospectionView({
	machineOk,
	machineId,
}: {
	machineOk: boolean;
	machineId: string | null;
}) {
	const [data, setData] = useState<MachineIntrospection | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchIntrospection = useCallback(async () => {
		if (!machineOk) return;
		if (!machineId) {
			setError("Machine not selected");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/dashboard/machines/${encodeURIComponent(machineId)}/introspection`,
				{ cache: "no-store" },
			);
			const body = (await response.json()) as {
				ok?: boolean;
				data?: MachineIntrospection;
				error?: string;
				message?: string;
			};
			if (body.data) {
				setData(body.data);
			} else {
				setError(body.error ?? body.message ?? "command failed");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "fetch failed");
		} finally {
			setLoading(false);
		}
	}, [machineOk, machineId]);

	useEffect(() => { void fetchIntrospection(); }, [fetchIntrospection]);

	if (!machineOk) {
		return (
			<div className="p-3 font-mono text-[11px] text-[var(--ret-text-muted)]">
				Machine offline
			</div>
		);
	}

	if (loading && !data) {
		return (
			<div className="p-3">
				<BrailleSpinner name="orbit" label="reading agent state" className="text-[10px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	if (error && !data) {
		return (
			<div className="p-3">
				<p className="font-mono text-[10px] text-[var(--ret-red)]">{error}</p>
				<button
					type="button"
					onClick={() => void fetchIntrospection()}
					className="mt-2 font-mono text-[10px] text-[var(--ret-purple)] underline"
				>
					retry
				</button>
			</div>
		);
	}

	if (!data) return null;

	const agentLabels: Record<string, string> = {
		hermes: "Hermes",
		openclaw: "OpenClaw",
		"claude-code": "Claude Code",
		codex: "Codex CLI",
		unknown: "Unknown",
	};

	return (
		<div className="flex flex-col gap-0">
			{/* Detected agent header */}
			<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex items-center gap-2">
					<span className="h-2 w-2 rounded-full bg-[var(--ret-green)]" />
					<span className="font-mono text-[11px] text-[var(--ret-text)]">
						{agentLabels[data.detectedAgent] ?? data.detectedAgent}
					</span>
				</div>
				{data.agentVersion ? (
					<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{data.agentVersion}</span>
				) : null}
			</div>
			{data.model ? (
				<div className="border-b border-[var(--ret-border)]/50 px-3 py-1.5">
					<MetaRow label="Model" value={data.model} />
				</div>
			) : null}

			{/* Identity files */}
			{data.identity.length > 0 ? (
				<>
					<SectionHeader label="Identity" count={data.identity.length} />
					<div className="px-3 py-2">
						{data.identity.map((f) => (
							<div key={f.path} className="flex items-center justify-between py-0.5">
								<span className="font-mono text-[10px] text-[var(--ret-text)]">{f.name}</span>
								<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{f.chars} chars</span>
							</div>
						))}
					</div>
				</>
			) : null}

			{/* Memory capacity */}
			{data.memory.length > 0 ? (
				<>
					<SectionHeader label="Memory" count={data.memory.length} />
					<div className="px-3 py-2">
						{data.memory.map((f) => (
							<CapacityBar
								key={f.path}
								label={f.name}
								current={f.chars}
								max={f.limit ?? 0}
								percent={f.percent ?? 0}
							/>
						))}
					</div>
				</>
			) : null}

			{/* Skills */}
			<SectionHeader label="Skills" count={data.skills.total} />
			<div className="px-3 py-2">
				<div className="flex flex-col gap-1.5">
					<MetaRow label="Total" value={String(data.skills.total)} />
					{data.skills.agentAuthored > 0 ? (
						<MetaRow label="Agent-authored" value={String(data.skills.agentAuthored)} />
					) : null}
					<MetaRow label="Bundled" value={String(data.skills.bundled)} />
					{data.skills.stale > 0 ? (
						<MetaRow label="Stale" value={String(data.skills.stale)} warn />
					) : null}
					{data.skills.archived > 0 ? (
						<MetaRow label="Archived" value={String(data.skills.archived)} />
					) : null}
					{data.skills.pinned.length > 0 ? (
						<div className="mt-1">
							<span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">Pinned</span>
							<div className="mt-0.5 flex flex-wrap gap-1">
								{data.skills.pinned.map((s) => (
									<span key={s} className="border border-[var(--ret-amber)]/40 px-1 py-0.5 font-mono text-[8px] text-[var(--ret-amber)]">{s}</span>
								))}
							</div>
						</div>
					) : null}
				</div>
			</div>

			{/* Curator (Hermes) */}
			{data.curator.available ? (
				<>
					<SectionHeader label="Skill Curator" />
					<div className="px-3 py-2">
						<MetaRow label="Last run" value={data.curator.lastRun ?? "never"} />
					</div>
				</>
			) : null}

			{/* GEPA (Hermes) */}
			{data.detectedAgent === "hermes" ? (
				<>
					<SectionHeader label="GEPA" />
					<div className="px-3 py-2">
						{data.gepa.available ? (
							<div className="flex flex-col gap-1.5">
								<MetaRow label="Status" value="installed" good />
								<MetaRow label="Last run" value={data.gepa.lastRun ?? "never"} />
								<MetaRow label="Optimized" value={String(data.gepa.optimizedSkills)} />
							</div>
						) : (
							<p className="text-[9px] text-[var(--ret-text-muted)]">
								Not installed. NousResearch/hermes-agent-self-evolution
							</p>
						)}
					</div>
				</>
			) : null}

			{/* Heartbeat (OpenClaw) */}
			{data.heartbeat.enabled ? (
				<>
					<SectionHeader label="Heartbeat" />
					<div className="px-3 py-2">
						<MetaRow label="Interval" value={data.heartbeat.intervalMinutes ? `${data.heartbeat.intervalMinutes}m` : "default"} />
						<MetaRow label="Checklist" value={data.heartbeat.hasChecklist ? "HEARTBEAT.md present" : "none"} />
					</div>
				</>
			) : null}

			{/* Vector memory (OpenClaw) */}
			{data.vectorMemory.available ? (
				<>
					<SectionHeader label="Vector Memory" />
					<div className="px-3 py-2">
						<MetaRow label="Indexed files" value={String(data.vectorMemory.indexedFiles)} />
						{data.vectorMemory.embeddingProvider ? (
							<MetaRow label="Provider" value={data.vectorMemory.embeddingProvider} />
						) : null}
					</div>
				</>
			) : null}

			{/* Channels (OpenClaw) */}
			{data.channels.length > 0 ? (
				<>
					<SectionHeader label="Channels" count={data.channels.filter((c) => c.connected).length} />
					<div className="px-3 py-2">
						{data.channels.map((ch) => (
							<div key={ch.name} className="flex items-center gap-2 py-0.5">
								<span className={cn(
									"h-1.5 w-1.5 rounded-full",
									ch.connected ? "bg-[var(--ret-green)]" : "bg-[var(--ret-text-muted)]",
								)} />
								<span className="font-mono text-[10px] text-[var(--ret-text)]">{ch.name}</span>
							</div>
						))}
					</div>
				</>
			) : null}

			{/* Sub-agents */}
			{data.subAgents.available ? (
				<>
					<SectionHeader label="Sub-agents" />
					<div className="px-3 py-2">
						<MetaRow label="Max concurrent" value={String(data.subAgents.maxConcurrent)} />
						<MetaRow label="Active" value={String(data.subAgents.activeCount)} />
					</div>
				</>
			) : null}

			{/* Sandbox / Approval (Codex, OpenClaw) */}
			{data.sandboxMode || data.approvalPolicy ? (
				<>
					<SectionHeader label="Security" />
					<div className="px-3 py-2">
						{data.sandboxMode ? <MetaRow label="Sandbox" value={data.sandboxMode} /> : null}
						{data.approvalPolicy ? <MetaRow label="Approval" value={data.approvalPolicy} /> : null}
					</div>
				</>
			) : null}

			{/* Profiles */}
			<SectionHeader label="Profiles" count={data.profiles.length} />
			{data.profiles.length > 0 ? (
				<div>
					{data.profiles.map((p) => (
						<ProfileCard key={`${p.agentKind}-${p.name}`} profile={p} />
					))}
				</div>
			) : (
				<div className="px-3 py-2">
					<p className="text-[9px] text-[var(--ret-text-muted)]">
						{data.detectedAgent === "hermes"
							? "Create with: hermes profile create <name>"
							: data.detectedAgent === "codex"
								? "Define in: [profiles.NAME] in config.toml"
								: "No profiles detected"}
					</p>
				</div>
			)}

			{/* Sessions */}
			{data.sessions.totalSessions > 0 ? (
				<>
					<SectionHeader label="Sessions" />
					<div className="px-3 py-2">
						<MetaRow label="Total" value={String(data.sessions.totalSessions)} />
						{data.sessions.totalTranscripts > 0 ? (
							<MetaRow label="FTS5 index" value="active" good />
						) : null}
					</div>
				</>
			) : null}

			{/* Refresh */}
			<div className="border-t border-[var(--ret-border)] px-3 py-2">
				<button
					type="button"
					onClick={() => void fetchIntrospection()}
					disabled={loading}
					className="font-mono text-[9px] text-[var(--ret-text-muted)] hover:text-[var(--ret-purple)]"
				>
					{loading ? "refreshing..." : "↻ refresh"}
				</button>
			</div>
		</div>
	);
}

function CapacityBar({
	label,
	current,
	max,
	percent,
}: {
	label: string;
	current: number;
	max: number;
	percent: number;
}) {
	const color =
		percent >= 80 ? "bg-[var(--ret-red)]"
			: percent >= 60 ? "bg-[var(--ret-amber)]"
				: "bg-[var(--ret-green)]";

	return (
		<div className="mb-2">
			<div className="flex items-center justify-between">
				<span className="font-mono text-[10px] text-[var(--ret-text)]">{label}</span>
				<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
					{current}/{max} chars ({percent}%)
				</span>
			</div>
			<div className="mt-1 h-1.5 w-full bg-[var(--ret-border)]">
				<div
					className={cn("h-full transition-[width] duration-[var(--ret-duration-page)] [transition-timing-function:var(--ret-ease-out)]", color)}
					style={{ width: `${Math.min(100, percent)}%` }}
				/>
			</div>
		</div>
	);
}

function MetaRow({
	label,
	value,
	warn,
	good,
}: {
	label: string;
	value: string;
	warn?: boolean;
	good?: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{label}</span>
			<span className={cn(
				"font-mono text-[10px]",
				warn ? "text-[var(--ret-amber)]" : good ? "text-[var(--ret-green)]" : "text-[var(--ret-text)]",
			)}>
				{value}
			</span>
		</div>
	);
}

function ProfileCard({ profile }: { profile: AgentProfile }) {
	const kindBadge: Record<string, string> = {
		hermes: "H",
		openclaw: "OC",
		"claude-code": "CC",
		codex: "CX",
	};

	return (
		<div className="border-b border-[var(--ret-border)]/30 px-3 py-2.5 hover:bg-[var(--ret-surface)]">
			<div className="flex items-center gap-2">
				<span className="border border-[var(--ret-border)] px-1 py-0.5 font-mono text-[7px] uppercase text-[var(--ret-text-muted)]">
					{kindBadge[profile.agentKind] ?? "?"}
				</span>
				<span className="font-mono text-[12px] text-[var(--ret-text)]">{profile.name}</span>
				{profile.hasGateway ? (
					<span className="h-1.5 w-1.5 rounded-full bg-[var(--ret-green)]" title="Gateway active" />
				) : null}
				{profile.hasTelegram ? (
					<span className="font-mono text-[8px] text-[var(--ret-text-muted)]">TG</span>
				) : null}
				{profile.hasHeartbeat ? (
					<span className="font-mono text-[8px] text-[var(--ret-amber)]">♥</span>
				) : null}
			</div>
			{profile.model ? (
				<p className="mt-0.5 truncate font-mono text-[9px] text-[var(--ret-text-muted)]">{profile.model}</p>
			) : null}
			{profile.sandboxMode ? (
				<p className="mt-0.5 font-mono text-[8px] text-[var(--ret-text-muted)]">
					sandbox: {profile.sandboxMode}
					{profile.approvalPolicy ? ` · approval: ${profile.approvalPolicy}` : ""}
				</p>
			) : null}
			{profile.soulPreview ? (
				<p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-[var(--ret-text-dim)]">{profile.soulPreview}</p>
			) : null}
			<div className="mt-1 flex gap-2">
				{profile.skillCount > 0 ? (
					<span className="font-mono text-[8px] text-[var(--ret-text-muted)]">{profile.skillCount} skills</span>
				) : null}
			</div>
		</div>
	);
}

/* ── Utils ─────────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "--";
	const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

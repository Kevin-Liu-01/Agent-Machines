"use client";

import { useMemo, useState } from "react";

import {
	BuiltinCard,
	CatalogCard,
	McpCard,
	ServiceCard,
	SkillsByCategory,
	TaskCard,
} from "@/components/dashboard/LoadoutCards";
import { WingBackground } from "@/components/WingBackground";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";
import {
	type BuiltinTool,
	type LoadoutCounts,
	type ServiceEntry,
	type TaskEntry,
	type TrustedAddOn,
} from "@/lib/dashboard/loadout";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { SkillSummary } from "@/lib/dashboard/types";
import type {
	CustomLoadoutEntry,
	LoadoutPreset,
	LoadoutSource,
} from "@/lib/user-config/schema";

type Props = {
	counts: LoadoutCounts;
	skills: SkillSummary[];
	mcps: McpServerWithBrand[];
	builtins: BuiltinTool[];
	services: ServiceEntry[];
	tasks: TaskEntry[];
	catalog: TrustedAddOn[];
	customLoadout: CustomLoadoutEntry[];
	loadoutSources: LoadoutSource[];
	loadoutPresets: LoadoutPreset[];
	activeLoadoutPresetId: string;
};

type Tab =
	| "all"
	| "presets"
	| "catalog"
	| "builtin"
	| "mcp"
	| "skills"
	| "services"
	| "tasks";

const TABS: ReadonlyArray<{ id: Tab; label: string; count: (c: Props) => number }> = [
	{ id: "all", label: "All", count: (p) => p.counts.total + p.services.length + p.tasks.length + p.catalog.length },
	{
		id: "presets",
		label: "Sources + presets",
		count: (p) =>
			p.loadoutSources.length + p.loadoutPresets.length + p.customLoadout.length,
	},
	{ id: "catalog", label: "Available to add", count: (p) => p.catalog.length },
	{ id: "builtin", label: "Built-in tools", count: (p) => p.builtins.length },
	{ id: "mcp", label: "MCP servers", count: (p) => p.counts.mcpTools },
	{ id: "skills", label: "Skills", count: (p) => p.skills.length },
	{ id: "services", label: "Services", count: (p) => p.services.length },
	{ id: "tasks", label: "Tasks", count: (p) => p.tasks.length },
];

export function LoadoutPanel(props: Props) {
	const [tab, setTab] = useState<Tab>("all");
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const activePreset =
		props.loadoutPresets.find((preset) => preset.id === props.activeLoadoutPresetId) ??
		props.loadoutPresets[0] ??
		null;
	const enabledSources = props.loadoutSources.filter((source) => source.enabled);
	const enabledCustom = props.customLoadout.filter((entry) => entry.enabled);
	const filtered = useFilteredLoadout(props, q);

	return (
		<div className="space-y-6 px-5 py-5">
			<PresetStrip
				activePreset={activePreset}
				sources={enabledSources}
				custom={enabledCustom}
			/>
			<CountStrip counts={props.counts} />

			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] pb-3">
				<div className="flex flex-wrap gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => setTab(t.id)}
							className={cn(
								"flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] transition-colors",
								tab === t.id
									? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
									: "bg-[var(--ret-bg)] text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
							)}
						>
							<span>{t.label}</span>
							<span className="text-[10px] text-[var(--ret-text-muted)]">
								{t.count(props)}
							</span>
						</button>
					))}
				</div>
				<input
					type="search"
					placeholder="filter..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-1.5 font-mono text-[11px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
			</div>

			<LoadoutSections tab={tab} query={q} source={props} filtered={filtered} />
			<EmptyState query={query} filtered={filtered} />
		</div>
	);
}

type FilteredLoadout = {
	skills: SkillSummary[];
	builtins: BuiltinTool[];
	services: ServiceEntry[];
	tasks: TaskEntry[];
	catalog: TrustedAddOn[];
	sources: LoadoutSource[];
	presets: LoadoutPreset[];
	custom: CustomLoadoutEntry[];
};

function useFilteredLoadout(source: Props, query: string): FilteredLoadout {
	const skills = useMemo(
		() => source.skills.filter((item) => isSkillMatch(item, query)),
		[source.skills, query],
	);
	const builtins = useMemo(
		() => source.builtins.filter((item) => isBuiltinMatch(item, query)),
		[source.builtins, query],
	);
	const services = useMemo(
		() => source.services.filter((item) => isServiceMatch(item, query)),
		[source.services, query],
	);
	const tasks = useMemo(
		() => source.tasks.filter((item) => isTaskMatch(item, query)),
		[source.tasks, query],
	);
	const catalog = useMemo(
		() => source.catalog.filter((item) => isCatalogMatch(item, query)),
		[source.catalog, query],
	);
	const sources = useMemo(
		() => source.loadoutSources.filter((item) => isSourceMatch(item, query)),
		[source.loadoutSources, query],
	);
	const presets = useMemo(
		() => source.loadoutPresets.filter((item) => isPresetMatch(item, query)),
		[source.loadoutPresets, query],
	);
	const custom = useMemo(
		() => source.customLoadout.filter((item) => isCustomMatch(item, query)),
		[source.customLoadout, query],
	);
	return { skills, builtins, services, tasks, catalog, sources, presets, custom };
}

function LoadoutSections({
	tab,
	query,
	source,
	filtered,
}: {
	tab: Tab;
	query: string;
	source: Props;
	filtered: FilteredLoadout;
}) {
	return (
		<>
			<SourcePresetSection tab={tab} source={source} query={query} />
			<BuiltinSection tab={tab} items={filtered.builtins} />
			<CatalogSection tab={tab} items={filtered.catalog} />
			<McpSection tab={tab} source={source} query={query} />
			<ServiceSection tab={tab} items={filtered.services} />
			<TaskSection tab={tab} items={filtered.tasks} />
			<SkillSection tab={tab} items={filtered.skills} />
		</>
	);
}

function SourcePresetSection({
	tab,
	source,
	query,
}: {
	tab: Tab;
	source: Props;
	query: string;
}) {
	if (tab !== "all" && tab !== "presets") return null;
	const q = query.trim().toLowerCase();
	const sources = source.loadoutSources.filter((item) => isSourceMatch(item, q));
	const presets = source.loadoutPresets.filter((item) => isPresetMatch(item, q));
	const custom = source.customLoadout.filter((item) => isCustomMatch(item, q));
	if (sources.length === 0 && presets.length === 0 && custom.length === 0) return null;
	return (
		<Section
			kicker={`PRESET CONFIG · ${presets.length} PRESETS . ${sources.length} SOURCES`}
			title="The bundled stack is one preset, not the ceiling"
			body="Sources are reputable places an agent can draw from; presets decide which sources, skills, tools, and MCP servers are active for a specific agent profile. The Settings page can add entries or create new presets without changing the codebase."
		>
			<div className="grid gap-3 xl:grid-cols-[0.95fr_1.1fr_0.95fr]">
				<MiniRegistry title="Preset recipes" count={presets.length}>
					{presets.map((preset) => (
						<div
							key={preset.id}
							className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="font-mono text-[11px] text-[var(--ret-text)]">
									{preset.name}
								</p>
								{preset.id === source.activeLoadoutPresetId ? (
									<ReticleBadge variant="accent" className="text-[9px]">
										active
									</ReticleBadge>
								) : null}
							</div>
							<p className="mt-1 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
								{preset.description}
							</p>
							<div className="mt-2 flex flex-wrap gap-1">
								{preset.sourceIds.slice(0, 5).map((id) => (
									<span
										key={id}
										className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ret-text-muted)]"
									>
										{id}
									</span>
								))}
							</div>
						</div>
					))}
				</MiniRegistry>
				<MiniRegistry title="Source pool" count={sources.length}>
					{sources.map((item) => (
						<div
							key={item.id}
							className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="font-mono text-[11px] text-[var(--ret-text)]">
									{item.name}
								</p>
								<ReticleBadge
									variant={item.enabled ? "success" : "default"}
									className="text-[9px]"
								>
									{item.enabled ? "enabled" : item.kind}
								</ReticleBadge>
							</div>
							<p className="mt-1 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
								{item.description}
							</p>
							<p className="mt-2 truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
								{item.uri ?? "manual entry"}
							</p>
						</div>
					))}
				</MiniRegistry>
				<MiniRegistry title="Custom entries" count={custom.length}>
					{custom.length > 0 ? (
						custom.map((item) => (
							<div
								key={item.id}
								className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3"
							>
								<div className="flex items-center justify-between gap-2">
									<p className="font-mono text-[11px] text-[var(--ret-text)]">
										{item.name}
									</p>
									<ReticleBadge
										variant={item.enabled ? "accent" : "default"}
										className="text-[9px]"
									>
										{item.kind}
									</ReticleBadge>
								</div>
								<p className="mt-1 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
									{item.description}
								</p>
								{item.command ? (
									<p className="mt-2 truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
										{item.command}
									</p>
								) : null}
							</div>
						))
					) : (
						<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
							No custom entries yet. Add one in Settings, save it, then include
							its ID in any preset.
						</div>
					)}
				</MiniRegistry>
			</div>
		</Section>
	);
}

function MiniRegistry({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{title}
				</p>
				<span className="font-mono text-[10px] tabular-nums text-[var(--ret-text-muted)]">
					{count}
				</span>
			</div>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}

function BuiltinSection({ tab, items }: { tab: Tab; items: BuiltinTool[] }) {
	if (tab !== "all" && tab !== "builtin") return null;
	if (items.length === 0) return null;
	return (
		<Section
			kicker={`BUILT-IN TOOLS · ${items.length}`}
			title="Native tools the agent calls without going through MCP"
			body="Ship with the Hermes / OpenClaw install itself. The agent invokes these in a single turn -- no MCP roundtrip, no auth handshake, just a function call into the runtime."
		>
			<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				{items.map((item) => (
					<BuiltinCard key={item.name} tool={item} />
				))}
			</div>
		</Section>
	);
}

function CatalogSection({ tab, items }: { tab: Tab; items: TrustedAddOn[] }) {
	if (tab !== "all" && tab !== "catalog") return null;
	if (items.length === 0) return null;
	return (
		<Section
			kicker={`AVAILABLE TO ADD · ${items.length}`}
			title="Trusted add-ons you can compose into custom presets"
			body="These are not necessarily installed on the active machine yet. They are curated sources, MCPs, CLIs, provider adapters, plugins, and skills that settings can reference when building a custom loadout preset."
		>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{items.map((item) => (
					<CatalogCard key={item.id} item={item} />
				))}
			</div>
		</Section>
	);
}

function McpSection({
	tab,
	source,
	query,
}: {
	tab: Tab;
	source: Props;
	query: string;
}) {
	if (tab !== "all" && tab !== "mcp") return null;
	if (source.mcps.length === 0) return null;
	return (
		<Section
			kicker={`MCP SERVERS · ${source.mcps.length} . TOOLS · ${source.counts.mcpTools}`}
			title="External tool servers the agent talks to over stdio"
			body="cursor-bridge spawns Cursor coding agents for actual file edits. hermes-builtins exposes Hermes's full tool surface. Both registered in ~/.hermes/config.toml on bootstrap."
		>
			<div className="grid gap-3 md:grid-cols-2">
				{source.mcps.map((server) => (
					<McpCard key={server.name} server={server} query={query} />
				))}
			</div>
		</Section>
	);
}

function ServiceSection({ tab, items }: { tab: Tab; items: ServiceEntry[] }) {
	if (tab !== "all" && tab !== "services") return null;
	if (items.length === 0) return null;
	return (
		<Section
			kicker={`SERVICES · ${items.length}`}
			title="Per-service interface ranking"
			body="Mirrors the wiki's tool-hierarchy.mdc. For each service, the agent picks the highest-ranked interface that can do the job. MCP > CLI > skills, with deliberate exceptions per service."
		>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{items.map((item) => (
					<ServiceCard key={item.id} service={item} />
				))}
			</div>
		</Section>
	);
}

function TaskSection({ tab, items }: { tab: Tab; items: TaskEntry[] }) {
	if (tab !== "all" && tab !== "tasks") return null;
	if (items.length === 0) return null;
	return (
		<Section
			kicker={`TASKS · ${items.length}`}
			title="Per-task tool ranking"
			body="When the agent has to do code review, design review, QA, research, etc., it picks from a ranked list of skills + tools. Lower ranks only fire when the higher ranks can't handle the case."
		>
			<div className="grid gap-3 md:grid-cols-2">
				{items.map((item) => (
					<TaskCard key={item.id} task={item} />
				))}
			</div>
		</Section>
	);
}

function SkillSection({ tab, items }: { tab: Tab; items: SkillSummary[] }) {
	if (tab !== "all" && tab !== "skills") return null;
	if (items.length === 0) return null;
	return (
		<Section
			kicker={`SKILLS · ${items.length}`}
			title="SKILL.md files loaded on demand"
			body="Each skill is a markdown file the agent loads when its description matches the user's intent. Edit on GitHub, click Reload, the agent picks it up. No redeploy."
		>
			<SkillsByCategory skills={items} />
		</Section>
	);
}

function EmptyState({
	query,
	filtered,
}: {
	query: string;
	filtered: FilteredLoadout;
}) {
	const hasMatches =
		filtered.skills.length > 0 ||
		filtered.builtins.length > 0 ||
		filtered.services.length > 0 ||
		filtered.tasks.length > 0 ||
		filtered.catalog.length > 0 ||
		filtered.sources.length > 0 ||
		filtered.presets.length > 0 ||
		filtered.custom.length > 0;
	if (hasMatches) return null;
	return (
		<ReticleFrame>
			<div className="p-8 text-center font-mono text-[12px] text-[var(--ret-text-muted)]">
				no matches for &quot;{query}&quot;
			</div>
		</ReticleFrame>
	);
}

function isSkillMatch(item: SkillSummary, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.description.toLowerCase().includes(query) ||
		item.category.toLowerCase().includes(query)
	);
}

function isBuiltinMatch(item: BuiltinTool, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.title.toLowerCase().includes(query) ||
		item.description.toLowerCase().includes(query) ||
		item.category.toLowerCase().includes(query)
	);
}

function isServiceMatch(item: ServiceEntry, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.tagline.toLowerCase().includes(query) ||
		item.interfaces.some(
			(row) =>
				row.label.toLowerCase().includes(query) ||
				row.use.toLowerCase().includes(query),
		)
	);
}

function isTaskMatch(item: TaskEntry, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.tagline.toLowerCase().includes(query) ||
		item.tools.some(
			(tool) =>
				tool.label.toLowerCase().includes(query) ||
				tool.use.toLowerCase().includes(query),
		)
	);
}

function isCatalogMatch(item: TrustedAddOn, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.provider.toLowerCase().includes(query) ||
		item.description.toLowerCase().includes(query) ||
		item.kind.toLowerCase().includes(query) ||
		item.source.toLowerCase().includes(query)
	);
}

function isSourceMatch(item: LoadoutSource, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.kind.toLowerCase().includes(query) ||
		item.description.toLowerCase().includes(query) ||
		(item.uri ?? "").toLowerCase().includes(query)
	);
}

function isPresetMatch(item: LoadoutPreset, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.description.toLowerCase().includes(query) ||
		item.sourceIds.some((id) => id.toLowerCase().includes(query)) ||
		item.customEntryIds.some((id) => id.toLowerCase().includes(query))
	);
}

function isCustomMatch(item: CustomLoadoutEntry, query: string): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.kind.toLowerCase().includes(query) ||
		item.description.toLowerCase().includes(query) ||
		(item.command ?? "").toLowerCase().includes(query)
	);
}

function CountStrip({ counts }: { counts: LoadoutCounts }) {
	const items = [
		{ label: "skills", value: counts.skills },
		{ label: "mcp servers", value: counts.mcpServers },
		{ label: "mcp tools", value: counts.mcpTools },
		{ label: "built-in tools", value: counts.builtinTools },
		{ label: "available add-ons", value: counts.trustedAddOns },
		{ label: "services", value: counts.services },
		{ label: "task categories", value: counts.tasks },
	];
	return (
		<div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-7">
			{items.map((i) => (
				<div
					key={i.label}
					className="flex flex-col gap-0.5 bg-[var(--ret-bg)] px-4 py-3"
				>
					<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{i.label}
					</p>
					<p className="font-mono text-base tabular-nums text-[var(--ret-text)]">
						{i.value}
					</p>
				</div>
			))}
		</div>
	);
}

function PresetStrip({
	activePreset,
	sources,
	custom,
}: {
	activePreset: LoadoutPreset | null;
	sources: LoadoutSource[];
	custom: CustomLoadoutEntry[];
}) {
	return (
		<ReticleFrame>
			<div className="grid gap-px bg-[var(--ret-border)] lg:grid-cols-[0.9fr_1.2fr_0.9fr]">
				<div className="relative overflow-hidden bg-[var(--ret-bg)] p-3">
					<WingBackground
						variant="nyx-waves"
						opacity={{ light: 0.08, dark: 0.2 }}
						fadeEdges
					/>
					<div className="relative z-10">
						<ReticleLabel>ACTIVE PRESET</ReticleLabel>
						<p className="mt-2 text-base font-semibold tracking-tight text-[var(--ret-text)]">
							{activePreset?.name ?? "No preset selected"}
						</p>
						<p className="mt-1 text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
							{activePreset?.description ??
								"Create a preset in Settings to compose sources and custom entries."}
						</p>
					</div>
				</div>
				<div className="bg-[var(--ret-bg)] p-3">
					<ReticleLabel>SOURCES</ReticleLabel>
					<div className="mt-2 flex flex-wrap gap-1">
						{sources.map((source) => (
							<span
								key={source.id}
								className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ret-text-dim)]"
								title={source.description}
							>
								{source.kind} . {source.name}
							</span>
						))}
						{sources.length === 0 ? (
							<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
								no enabled sources
							</span>
						) : null}
					</div>
				</div>
				<div className="relative overflow-hidden bg-[var(--ret-bg)] p-3">
					<WingBackground
						variant="nyx-lines"
						opacity={{ light: 0.08, dark: 0.2 }}
						fadeEdges
					/>
					<div className="relative z-10">
						<ReticleLabel>CUSTOM</ReticleLabel>
						<p className="mt-2 font-mono text-xl tabular-nums text-[var(--ret-text)]">
							{custom.length}
						</p>
						<p className="mt-1 text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
							User-added skills, MCPs, CLIs, tools, and plugins. Edit in
							Settings or sync from machine settings.json.
						</p>
					</div>
				</div>
			</div>
		</ReticleFrame>
	);
}

function Section({
	kicker,
	title,
	body,
	children,
}: {
	kicker: string;
	title: string;
	body: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-3">
			<div>
				<ReticleLabel>{kicker}</ReticleLabel>
				<h2 className="ret-display mt-1 text-base">{title}</h2>
				<p className="mt-1 max-w-[80ch] text-[12px] text-[var(--ret-text-dim)]">
					{body}
				</p>
			</div>
			<ReticleHatch
				className="h-1 border-t border-b border-[var(--ret-border)]"
				pitch={6}
			/>
			{children}
		</section>
	);
}

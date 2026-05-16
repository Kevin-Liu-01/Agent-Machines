"use client";

import { useMemo } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import {
	CATEGORY_LABEL,
	INTERFACE_LABEL,
	type AgentSupport,
	type BuiltinTool,
	type ServiceEntry,
	type TaskEntry,
	type TaskTool,
	type ToolCategory,
	type TrustedAddOn,
} from "@/lib/dashboard/loadout";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { SkillSummary } from "@/lib/dashboard/types";

const MARK_SET = new Set<string>(["dedalus", "nous", "cursor", "openclaw", "anthropic", "openai"]);
function isMark(value: string): value is Mark { return MARK_SET.has(value); }

const AGENT_BADGE: Record<
	AgentSupport,
	{ label: string; tone: "accent" | "default" | "warning" }
> = {
	hermes: { label: "hermes", tone: "default" },
	openclaw: { label: "openclaw", tone: "warning" },
	both: { label: "both agents", tone: "accent" },
};

const CATALOG_ICON: Record<TrustedAddOn["kind"], ToolCategory> = {
	skill: "memory",
	mcp: "delegate",
	cli: "shell",
	tool: "code",
	plugin: "code",
	provider: "filesystem",
	source: "search",
};

const CATALOG_BADGE: Record<
	TrustedAddOn["kind"],
	"default" | "accent" | "success" | "warning"
> = {
	skill: "accent",
	mcp: "success",
	cli: "warning",
	tool: "default",
	plugin: "accent",
	provider: "success",
	source: "default",
};

export function BuiltinCard({ tool }: { tool: BuiltinTool }) {
	const agent = AGENT_BADGE[tool.agent];
	const provider = tool.provider === "rig" ? null : tool.provider;
	return (
		<ReticleFrame>
			<div className="flex items-start justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					{provider ? (
						<Logo mark={provider} size={14} />
					) : (
						<ToolIcon
							name={tool.category}
							size={14}
							className="text-[var(--ret-text-muted)]"
						/>
					)}
					<span className="truncate font-mono text-[12px] text-[var(--ret-text)]">
						{tool.name}
					</span>
				</div>
				<ReticleBadge variant={agent.tone} className="text-[10px]">
					{agent.label}
				</ReticleBadge>
			</div>
			<div className="space-y-2 p-3">
				<p className="text-[12px] font-semibold tracking-tight text-[var(--ret-text)]">
					{tool.title}
				</p>
				<p className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
					{tool.description}
				</p>
				<p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					<ToolIcon name={tool.category} size={10} />
					{CATEGORY_LABEL[tool.category]}
				</p>
			</div>
		</ReticleFrame>
	);
}

export function CatalogCard({ item }: { item: TrustedAddOn }) {
	const agent = AGENT_BADGE[item.agent];
	const icon = CATALOG_ICON[item.kind];
	return (
		<ReticleFrame>
			<div className="flex items-start justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					{item.brand ? (
						<ServiceIcon slug={item.brand} size={16} tone="color" />
					) : (
						<ToolIcon
							name={icon}
							size={14}
							className="text-[var(--ret-text-muted)]"
						/>
					)}
					<span className="truncate font-mono text-[12px] text-[var(--ret-text)]">
						{item.name}
					</span>
				</div>
				<ReticleBadge variant={CATALOG_BADGE[item.kind]} className="text-[10px]">
					{item.kind}
				</ReticleBadge>
			</div>
			<div className="space-y-2 p-3">
				<p className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
					{item.description}
				</p>
				<div className="grid gap-1 border-t border-[var(--ret-border)] pt-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
					<p className="truncate">
						<span className="uppercase tracking-[0.16em]">provider</span>{" "}
						<span className="text-[var(--ret-text-dim)]">{item.provider}</span>
					</p>
					<p className="truncate">
						<span className="uppercase tracking-[0.16em]">source</span>{" "}
						<span className="text-[var(--ret-text-dim)]">{item.source}</span>
					</p>
					{item.command ? (
						<p className="truncate">
							<span className="uppercase tracking-[0.16em]">cmd</span>{" "}
							<code className="text-[var(--ret-text-dim)]">{item.command}</code>
						</p>
					) : null}
				</div>
				<ReticleBadge variant={agent.tone} className="text-[10px]">
					{agent.label}
				</ReticleBadge>
			</div>
		</ReticleFrame>
	);
}

export function McpCard({
	server,
	query,
}: {
	server: McpServerWithBrand;
	query: string;
}) {
	const tools = query
		? server.tools.filter((tool) => isMcpToolMatch(tool, query))
		: server.tools;
	return (
		<ReticleFrame>
			<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex items-center gap-2">
					{server.brand ? (
						isMark(server.brand) ? <Logo mark={server.brand} size={14} /> :
						isServiceSlug(server.brand) ? <ServiceIcon slug={server.brand} size={14} /> : null
					) : null}
					<span className="font-mono text-[12px] text-[var(--ret-text)]">
						{server.name}
					</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{server.transport}
					</span>
				</div>
				{server.link ? (
					<a
						href={server.link}
						target="_blank"
						rel="noreferrer"
						className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:underline"
					>
						docs
					</a>
				) : null}
			</div>
			<div className="space-y-1 p-3">
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					{server.source}
				</p>
				<ul className="mt-2 space-y-2">
					{tools.map((tool) => (
						<li
							key={tool.name}
							className="border-l-2 border-[var(--ret-border)] pl-2"
						>
							<p className="font-mono text-[11px] text-[var(--ret-text)]">
								{tool.name}
							</p>
							<p className="text-[11px] text-[var(--ret-text-dim)]">
								{tool.title}
							</p>
							<p className="mt-0.5 text-[10px] text-[var(--ret-text-muted)]">
								{tool.description}
							</p>
						</li>
					))}
				</ul>
			</div>
		</ReticleFrame>
	);
}

export function ServiceCard({ service }: { service: ServiceEntry }) {
	return (
		<ReticleFrame>
			<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					{service.brand ? (
						<ServiceIcon slug={service.brand} size={16} tone="color" />
					) : (
						<ToolIcon
							name={service.icon}
							size={14}
							className="text-[var(--ret-text-muted)]"
						/>
					)}
					<span className="font-mono text-[12px] text-[var(--ret-text)]">
						{service.name}
					</span>
				</div>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{service.interfaces.length}{" "}
					{service.interfaces.length === 1 ? "interface" : "interfaces"}
				</span>
			</div>
			<div className="space-y-2 p-3">
				<p className="text-[11px] text-[var(--ret-text-dim)]">
					{service.tagline}
				</p>
				<ol className="space-y-1.5">
					{service.interfaces.map((item) => (
						<li
							key={`${service.id}-${item.rank}`}
							className="flex items-start gap-2"
						>
							<span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] font-mono text-[9px] tabular-nums text-[var(--ret-purple)]">
								{item.rank}
							</span>
							<span className="min-w-0 flex-1">
								<span className="font-mono text-[11px] text-[var(--ret-text)]">
									{item.label}
								</span>
								<span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{INTERFACE_LABEL[item.kind]}
								</span>
								<p className="text-[10px] text-[var(--ret-text-dim)]">
									{item.use}
								</p>
							</span>
						</li>
					))}
				</ol>
			</div>
		</ReticleFrame>
	);
}

export function TaskCard({ task }: { task: TaskEntry }) {
	return (
		<ReticleFrame>
			<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					<ToolIcon
						name={task.category}
						size={14}
						className="text-[var(--ret-text-muted)]"
					/>
					<span className="font-mono text-[12px] text-[var(--ret-text)]">
						{task.name}
					</span>
				</div>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{task.tools.length} ranked
				</span>
			</div>
			<div className="space-y-2 p-3">
				<p className="text-[11px] text-[var(--ret-text-dim)]">{task.tagline}</p>
				<ol className="space-y-1.5">
					{task.tools.map((tool) => (
						<TaskToolRow
							key={`${task.id}-${tool.rank}`}
							tool={tool}
							category={task.category}
						/>
					))}
				</ol>
			</div>
		</ReticleFrame>
	);
}

export function SkillsByCategory({ skills }: { skills: SkillSummary[] }) {
	const grouped = useMemo(() => groupSkills(skills), [skills]);
	return (
		<div className="space-y-4">
			{grouped.map(([category, list]) => (
				<div key={category}>
					<p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{category} . {list.length}
					</p>
					<div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
						{list.map((skill) => (
							<a
								key={skill.slug}
								href={`/dashboard/skills/${skill.slug}`}
								className="group flex flex-col gap-1 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-2.5 hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)]"
							>
								<p className="font-mono text-[11px] text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
									{skill.name}
								</p>
								<p className="line-clamp-2 text-[10px] leading-snug text-[var(--ret-text-dim)]">
									{skill.description}
								</p>
							</a>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

function TaskToolRow({
	tool,
	category,
}: {
	tool: TaskTool;
	category: ToolCategory;
}) {
	return (
		<li className="flex items-start gap-2">
			<span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 font-mono text-[9px] tabular-nums text-[var(--ret-amber)]">
				{tool.rank}
			</span>
			<span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ret-text-muted)]">
				{tool.brand ? (
					<ServiceIcon slug={tool.brand} size={12} tone="mono" />
				) : (
					<ToolIcon name={category} size={12} />
				)}
			</span>
			<span className="min-w-0 flex-1">
				<span className="font-mono text-[11px] text-[var(--ret-text)]">
					{tool.label}
				</span>
				{tool.skill ? (
					<a
						href={`/dashboard/skills/${tool.skill}`}
						className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:underline"
					>
						skill
					</a>
				) : null}
				<p className="text-[10px] text-[var(--ret-text-dim)]">{tool.use}</p>
			</span>
		</li>
	);
}

function isMcpToolMatch(
	tool: McpServerWithBrand["tools"][number],
	query: string,
): boolean {
	return (
		tool.name.toLowerCase().includes(query) ||
		tool.title.toLowerCase().includes(query) ||
		tool.description.toLowerCase().includes(query)
	);
}

function groupSkills(
	skills: SkillSummary[],
): Array<[string, SkillSummary[]]> {
	const byCategory: Record<string, SkillSummary[]> = {};
	for (const skill of skills) {
		(byCategory[skill.category] ??= []).push(skill);
	}
	const grouped = Object.entries(byCategory).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	return grouped;
}

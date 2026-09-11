"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { LibrarySearch } from "./LibrarySearch";
import { AddSkillPanel } from "@/components/dashboard/AddSkillPanel";
import { Logo, type Mark } from "@/components/Logo";
import { ToolIcon } from "@/components/ToolIcon";
import { cn } from "@/lib/cn";
import type { ToolCategory } from "@/lib/dashboard/loadout";
import type { SkillSummary } from "@/lib/dashboard/types";
import type { CustomLoadoutEntry } from "@/lib/user-config/schema";

/**
 * Skill slugs that map to a partner whose logo we should attribute on the
 * card. Most skills are general-purpose (no logo), but a few like
 * cursor-coding are about a specific partner system.
 */
const SKILL_BRAND: Record<string, Mark> = {
	"cursor-coding": "cursor",
};

/**
 * Map a skill's category to a ToolIcon `ToolCategory` for the fallback
 * Lucide-style icon. Each skill always shows *some* icon -- either its
 * partner brand (above) or this category icon -- so cards never read
 * as visually anonymous.
 */
const SKILL_CATEGORY_ICON: Record<string, ToolCategory> = {
	content: "memory",
	delegation: "delegate",
	design: "vision",
	engineering: "code",
	ops: "shell",
	philosophy: "memory",
	review: "search",
};

const ALL = "all";
const CUSTOM = "custom";

type Props = {
	skills: SkillSummary[];
	categories: string[];
	customSkills?: CustomLoadoutEntry[];
};

function customSkillSlug(entry: CustomLoadoutEntry): string {
	const prefix = "custom-skill:custom/";
	if (entry.id.startsWith(prefix)) return entry.id.slice(prefix.length);
	return entry.id.replace(/^custom-skill:/, "");
}

/**
 * Search and category filters compose over the loaded catalog, including
 * enabled custom skills, without a network request on each keystroke.
 */
export function SkillsBrowser({ skills, categories, customSkills = [] }: Props) {
	const router = useRouter();
	const [active, setActive] = useState<string>(ALL);
	const [query, setQuery] = useState("");
	const matches = (name: string, description: string) => `${name} ${description}`.toLowerCase().includes(query.trim().toLowerCase());
	const userSkills = useMemo(
		() => customSkills.filter((entry) => entry.kind === "skill" && entry.enabled),
		[customSkills],
	);
	const visible = useMemo(() => {
		if (active === CUSTOM) return [];
		if (active === ALL) return skills;
		return skills.filter((s) => s.category === active);
	}, [skills, active]);

	const isEmpty = skills.length === 0 && userSkills.length === 0;
	const filteredSkills = visible.filter(skill => matches(skill.name, skill.description));
	const filteredCustom = (active === ALL || active === CUSTOM) ? userSkills.filter(entry => matches(entry.name, entry.description ?? "")) : [];

	return (
		<>
			<AddSkillPanel
				customSkills={userSkills}
				onAdded={() => router.refresh()}
			/>
			{isEmpty ? (
				<div className="px-[var(--dashboard-gutter,20px)] py-10">
					<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-6 py-12 text-center">
						<p className="text-[13px] text-[var(--ret-text-dim)]">No skills imported yet.</p>
						<p className="mx-auto mt-1 max-w-[48ch] text-[13px] text-[var(--ret-text-muted)]">
							Save skills from the Registry to see them here. Installation is a
							separate step on a selected, supported machine.
						</p>
						<Link
							href="/dashboard/registry"
							className="mt-4 inline-block border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-4 py-2 text-sm font-medium text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20"
						>
							Browse the Registry →
						</Link>
					</div>
				</div>
			) : null}
			<div className={cn("space-y-5 px-[var(--dashboard-gutter,20px)] py-6", isEmpty && "hidden")}>
				<LibrarySearch value={query} onChange={setQuery} label="Search skills" />
				<div className="flex flex-wrap items-center gap-2">
					<Chip
						label={`all (${skills.length + userSkills.length})`}
						active={active === ALL}
						onClick={() => setActive(ALL)}
					/>
					{userSkills.length > 0 ? (
						<Chip
							label={`custom (${userSkills.length})`}
							active={active === CUSTOM}
							onClick={() => setActive(CUSTOM)}
						/>
					) : null}
					{categories.map((c) => {
						const count = skills.filter((s) => s.category === c).length;
						return (
							<Chip
								key={c}
								label={`${c} (${count})`}
								active={active === c}
								onClick={() => setActive(c)}
							/>
						);
					})}
				</div>

				{!filteredSkills.length && !filteredCustom.length ? <div role="status" className="rounded-lg border border-dashed border-[var(--ret-border)] p-8 text-center text-sm text-[var(--ret-text-muted)]"><p>No skills match this search and category.</p><button type="button" onClick={() => { setQuery(""); setActive(ALL); }} className="mt-3 min-h-11 rounded-md border border-[var(--ret-border)] px-4 text-[var(--ret-text)] hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Clear filters</button></div> : null}
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{active !== CUSTOM
						? filteredSkills.map((skill) => <SkillCard key={skill.slug} skill={skill} />)
						: null}
					{(active === ALL || active === CUSTOM) &&
						filteredCustom.map((entry) => (
							<CustomSkillCard key={entry.id} entry={entry} />
						))}
				</div>
			</div>
		</>
	);
}

function Chip({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"min-h-9 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ret-text)]",
				active
					? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-[var(--ret-border)] text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)] hover:text-[var(--ret-text)]",
			)}
		>
			{label}
		</button>
	);
}

function CustomSkillCard({ entry }: { entry: CustomLoadoutEntry }) {
	const slug = customSkillSlug(entry);
	return (
		<div className="flex h-full flex-col border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<ToolIcon name="memory" size={14} className="text-[var(--ret-text-muted)]" />
					<p className="font-mono text-sm text-[var(--ret-purple)]">{slug}</p>
				</div>
				<span className="border border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)] px-1.5 py-0.5 text-xs font-medium text-[var(--ret-purple)]">
					custom
				</span>
			</div>
			<p className="mt-3 line-clamp-3 text-sm text-[var(--ret-text-dim)]">
				{entry.description}
			</p>
			<div className="mt-auto pt-4 font-mono text-xs text-[var(--ret-text-muted)]">
				{entry.command ?? `~/.agent-machines/skills/custom/${slug}/SKILL.md`}
			</div>
		</div>
	);
}

function SkillCard({ skill }: { skill: SkillSummary }) {
	const mark = SKILL_BRAND[skill.slug];
	const categoryIcon = SKILL_CATEGORY_ICON[skill.category] ?? "memory";
	return (
		<Link
			href={`/dashboard/skills/${skill.slug}`}
			className="group flex h-full flex-col border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5 transition-colors duration-200 hover:border-[var(--ret-purple)]/40"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					{mark ? (
						<Logo mark={mark} size={14} />
					) : (
						<ToolIcon
							name={categoryIcon}
							size={14}
							className="text-[var(--ret-text-muted)]"
						/>
					)}
					<p className="font-mono text-sm text-[var(--ret-purple)] group-hover:underline">
						{skill.slug}
					</p>
				</div>
				<span className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 text-xs font-medium text-[var(--ret-text-muted)]">
					{skill.category}
				</span>
			</div>
			<p className="mt-3 line-clamp-3 text-sm text-[var(--ret-text-dim)]">
				{skill.description}
			</p>
			<div className="mt-4 flex flex-wrap gap-1.5 pt-1">
				{skill.tags.slice(0, 4).map((t) => (
					<span
						key={t}
						className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--ret-text-dim)]"
					>
						{t}
					</span>
				))}
			</div>
			<div className="mt-auto pt-4 font-mono text-xs text-[var(--ret-text-muted)]">
				{(skill.bytes / 1024).toFixed(1)} KiB . read
			</div>
		</Link>
	);
}

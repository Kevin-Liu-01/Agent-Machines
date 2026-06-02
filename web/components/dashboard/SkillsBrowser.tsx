"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
 * cursor-coding and dedalus-machines are about a specific partner system.
 */
const SKILL_BRAND: Record<string, Mark> = {
	"cursor-coding": "cursor",
	"dedalus-machines": "dedalus",
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
 * Card grid + category filter chips. Filtering is local state; we already
 * have all the metadata in memory (no per-category fetch needed). Search
 * is intentionally omitted in PR1 -- with 13 skills the chips alone are
 * enough; revisit when the library grows beyond ~30.
 */
export function SkillsBrowser({ skills, categories, customSkills = [] }: Props) {
	const router = useRouter();
	const [active, setActive] = useState<string>(ALL);
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

	return (
		<>
			<AddSkillPanel
				customSkills={userSkills}
				onAdded={() => router.refresh()}
			/>
			{isEmpty ? (
				<div className="px-6 py-10">
					<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-6 py-12 text-center">
						<p className="text-[13px] text-[var(--ret-text-dim)]">No skills imported yet.</p>
						<p className="mx-auto mt-1 max-w-[48ch] text-[11px] text-[var(--ret-text-muted)]">
							Skills you install from the Registry show up here and load on your
							machines. Browse the full catalog to add some.
						</p>
						<Link
							href="/dashboard/registry"
							className="mt-4 inline-block border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20"
						>
							Browse the Registry →
						</Link>
					</div>
				</div>
			) : null}
			<div className={cn("px-6 py-6", isEmpty && "hidden")}>
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

				<div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{active !== CUSTOM
						? visible.map((skill) => <SkillCard key={skill.slug} skill={skill} />)
						: null}
					{(active === ALL || active === CUSTOM) &&
						userSkills.map((entry) => (
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
			className={cn(
				"border px-3 py-1 font-mono text-[11px] transition-colors",
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
				<span className="border border-[var(--ret-purple)]/30 bg-[var(--ret-purple-glow)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)]">
					custom
				</span>
			</div>
			<p className="mt-3 line-clamp-3 text-sm text-[var(--ret-text-dim)]">
				{entry.description}
			</p>
			<div className="mt-auto pt-4 font-mono text-[10px] text-[var(--ret-text-muted)]">
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
				<span className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
						className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ret-text-dim)]"
					>
						{t}
					</span>
				))}
			</div>
			<div className="mt-auto pt-4 font-mono text-[10px] text-[var(--ret-text-muted)]">
				{(skill.bytes / 1024).toFixed(1)} KiB . read
			</div>
		</Link>
	);
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { SkillSummary } from "@/lib/dashboard/types";

const ALL = "all";

type Props = {
	skills: SkillSummary[];
	categories: string[];
};

/**
 * Card grid + category filter chips. Filtering is local state; we already
 * have all the metadata in memory (no per-category fetch needed). Search
 * is intentionally omitted in PR1 -- with 13 skills the chips alone are
 * enough; revisit when the library grows beyond ~30.
 */
export function SkillsBrowser({ skills, categories }: Props) {
	const [active, setActive] = useState<string>(ALL);
	const visible = useMemo(() => {
		if (active === ALL) return skills;
		return skills.filter((s) => s.category === active);
	}, [skills, active]);

	return (
		<div className="px-6 py-6">
			<div className="flex flex-wrap items-center gap-2">
				<Chip
					label={`all (${skills.length})`}
					active={active === ALL}
					onClick={() => setActive(ALL)}
				/>
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
				{visible.map((skill) => (
					<SkillCard key={skill.slug} skill={skill} />
				))}
			</div>
		</div>
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
				"rounded-full border px-3 py-1 font-mono text-[11px] transition-colors",
				active
					? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
					: "border-[var(--ret-border)] text-[var(--ret-text-dim)] hover:border-[var(--ret-border-hover)] hover:text-[var(--ret-text)]",
			)}
		>
			{label}
		</button>
	);
}

function SkillCard({ skill }: { skill: SkillSummary }) {
	return (
		<Link
			href={`/dashboard/skills/${skill.slug}`}
			className="group flex h-full flex-col rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5 transition-colors duration-200 hover:border-[var(--ret-purple)]/40"
		>
			<div className="flex items-start justify-between gap-3">
				<p className="font-mono text-sm text-[var(--ret-purple)] group-hover:underline">
					{skill.slug}
				</p>
				<span className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
						className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ret-text-dim)]"
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

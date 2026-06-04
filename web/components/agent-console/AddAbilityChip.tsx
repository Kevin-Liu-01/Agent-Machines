"use client";

import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { cn } from "@/lib/cn";
import type { PackageSuggestion } from "@/lib/packages/types";
import Image from "next/image";

type Props = {
	suggestion: PackageSuggestion;
	onAccept: () => void;
	disabled?: boolean;
};

export function AddAbilityChip({ suggestion, onAccept, disabled }: Props) {
	const label =
		suggestion.kind === "matched_in_pool"
			? `Add ${suggestion.name}`
			: `Install ${suggestion.name}`;

	const logo = suggestion.logoUrl ? (
		<Image
			src={suggestion.logoUrl}
			alt=""
			width={14}
			height={14}
			className="h-3.5 w-3.5 shrink-0 object-contain"
			unoptimized
		/>
	) : suggestion.brand && isServiceSlug(suggestion.brand) ? (
		<ServiceIcon slug={suggestion.brand} size={14} />
	) : (
		<ToolIcon name="skill" size={14} />
	);

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onAccept}
			title={[suggestion.description, suggestion.docsUrl].filter(Boolean).join(" — ")}
			className={cn(
				"inline-flex max-w-full items-center gap-2 rounded-full",
				"border border-[var(--ret-border)] bg-[var(--ret-surface)]",
				"px-2.5 py-1.5 text-left transition-colors duration-150",
				"hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-bg)]",
				"disabled:cursor-not-allowed disabled:opacity-50",
			)}
		>
			<span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--ret-purple)]/10">
				{logo}
			</span>
			<span className="truncate font-mono text-[11px] text-[var(--ret-text)]">{label}</span>
			{suggestion.homepage ? (
				<a
					href={suggestion.docsUrl ?? suggestion.homepage}
					target="_blank"
					rel="noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="hidden shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--ret-text-muted)] hover:text-[var(--ret-purple)] sm:inline"
				>
					docs
				</a>
			) : null}
			<span className="hidden shrink-0 items-center gap-0.5 font-mono text-[10px] text-[var(--ret-text-muted)] sm:inline-flex">
				<Kbd>⌘</Kbd>
				<Kbd>↵</Kbd>
			</span>
		</button>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded border border-[var(--ret-border)] px-1 py-px leading-none">
			{children}
		</span>
	);
}

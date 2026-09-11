"use client";

import { cn } from "@/lib/cn";

type Props = {
	label: string;
	value: string | number;
	unit?: string;
	badge?: React.ReactNode;
	subtext?: string;
	className?: string;
};

export function StatCard({ label, value, unit, badge, subtext, className }: Props) {
	return (
		<div
			className={cn(
				"relative flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5 text-left",
				className,
			)}
		>
			{badge && (
				<div className="absolute top-2 left-2">{badge}</div>
			)}
			<span className="text-sm font-medium text-[var(--ret-text-muted)]">
				{label}
			</span>
			<span className="break-words text-3xl font-semibold tracking-tight tabular-nums text-[var(--ret-text)]">
				{value}
				{unit && (
					<span className="ml-2 text-xs font-normal tracking-normal text-[var(--ret-text-dim)]">
						{unit}
					</span>
				)}
			</span>
			{subtext && (
				<span className="text-xs leading-5 text-[var(--ret-text-muted)]">
					{subtext}
				</span>
			)}
		</div>
	);
}

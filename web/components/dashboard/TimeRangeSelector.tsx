"use client";

import { cn } from "@/lib/cn";

type TimeRangeOption = { label: string; value: number };

type Props = {
	options: TimeRangeOption[];
	selected: number;
	onSelect: (value: number) => void;
	className?: string;
};

export function TimeRangeSelector({
	options,
	selected,
	onSelect,
	className,
}: Props) {
	return (
		<div className={cn("inline-flex items-center gap-2", className)}>
			<span className="text-xs text-[var(--ret-text-muted)]">
				Range
			</span>
			<div className="inline-flex border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] rounded-sm overflow-hidden">
				{options.map((opt) => (
					<button
						key={opt.value}
						type="button"
						aria-pressed={selected === opt.value}
						onClick={() => onSelect(opt.value)}
						className={cn(
							"min-h-9 px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
							selected === opt.value &&
								"bg-[var(--ret-bg)] text-[var(--ret-text)] shadow-[0_0_0_1px_var(--ret-border)]",
							selected !== opt.value &&
								"text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]",
						)}
					>
						{opt.label}
					</button>
				))}
			</div>
		</div>
	);
}

export const RANGE_OPTIONS_USAGE: TimeRangeOption[] = [
	{ label: "24 hrs", value: 1 },
	{ label: "7 days", value: 7 },
	{ label: "30 days", value: 30 },
	{ label: "90 days", value: 90 },
];

export const RANGE_OPTIONS_MACHINES: TimeRangeOption[] = [
	{ label: "24h", value: 1 },
	{ label: "7d", value: 7 },
	{ label: "14d", value: 14 },
	{ label: "30d", value: 30 },
];

export const RANGE_OPTIONS_DETAIL: TimeRangeOption[] = [
	{ label: "24h", value: 1 },
	{ label: "7d", value: 7 },
	{ label: "30d", value: 30 },
];

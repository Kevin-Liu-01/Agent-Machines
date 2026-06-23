"use client";

import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { GatewaySummary } from "@/lib/dashboard/types";

type Props = {
	data: GatewaySummary | null;
	className?: string;
};

export function GatewayStrip({ data, className }: Props) {
	if (!data) {
		return (
			<BrailleSpinner
				name="orbit"
				label="gateway"
				className={cn(
					"inline-flex text-[11px] text-[var(--ret-text-muted)]",
					className,
				)}
			/>
		);
	}
	const ok = data.ok;
	return (
		<div
			className={cn(
				"inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[12px] text-[var(--ret-text-muted)]",
				className,
			)}
			title={data.apiHost}
		>
			<span
				className={cn(
					"h-1.5 w-1.5 shrink-0",
					ok ? "bg-[var(--ret-green)]" : "bg-[var(--ret-red)]",
				)}
				aria-hidden
			/>
			<span className={ok ? "text-[var(--ret-text)]" : "text-[var(--ret-red)]"}>
				Gateway
			</span>
			<span className="text-[var(--ret-text-muted)]">
				{ok ? `${data.latencyMs} ms` : "offline"}
			</span>
		</div>
	);
}

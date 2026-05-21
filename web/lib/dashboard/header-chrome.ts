import { cn } from "@/lib/cn";

/** Shared header control chrome — Nacelle body, mono only for micro labels when needed. */
export const headerControlTrigger = (active?: boolean) =>
	cn(
		"flex items-center gap-2 rounded-sm border bg-[var(--ret-bg)] px-2.5 py-1 text-[12px] leading-none transition-colors",
		"border-[var(--ret-border)] hover:border-[var(--ret-purple)]/45 hover:bg-[var(--ret-surface)]",
		active && "border-[var(--ret-purple)]/55 bg-[var(--ret-surface)]",
	);

export const headerControlKicker =
	"text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ret-text-muted)]";

export const headerControlValue = "truncate text-[12px] text-[var(--ret-text)]";

export const headerPopover =
	"absolute right-0 top-[calc(100%+6px)] z-50 min-w-[240px] border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_12px_40px_rgba(0,0,0,0.28)]";

export const headerPopoverTitle =
	"border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 text-[11px] font-medium text-[var(--ret-text-muted)]";

export const headerDivider = "hidden h-4 w-px shrink-0 bg-[var(--ret-border)] md:block";

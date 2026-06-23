"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";

export type ReticleSelectOption = {
	value: string;
	label: string;
	/** Optional group heading; options sharing a group render under one header. */
	group?: string;
	/** Non-selectable (shown dimmed). */
	disabled?: boolean;
};

/**
 * Custom (non-native) select. Matches the reticle instrument aesthetic: a
 * bordered trigger + a bordered popover list, keyboard-dismissable, closes on
 * outside click. Use anywhere a native <select> would otherwise appear.
 */
export function ReticleSelect({
	value,
	options,
	onChange,
	className,
	placeholder = "Select...",
	ariaLabel,
}: {
	value: string;
	options: ReticleSelectOption[];
	onChange: (value: string) => void;
	className?: string;
	placeholder?: string;
	ariaLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const listId = useId();
	const selected = options.find((o) => o.value === value);

	useEffect(() => {
		if (!open) return;
		function onDocMouseDown(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", onDocMouseDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDocMouseDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	// Preserve declared order while grouping; ungrouped options render first.
	const groups: Array<{ group: string | null; items: ReticleSelectOption[] }> = [];
	for (const opt of options) {
		const key = opt.group ?? null;
		const bucket = groups.find((g) => g.group === key);
		if (bucket) bucket.items.push(opt);
		else groups.push({ group: key, items: [opt] });
	}

	return (
		<div ref={ref} className={cn("relative", className)}>
			<button
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel}
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"flex w-full items-center justify-between gap-2 border bg-[var(--ret-bg)] px-2.5 py-1.5",
					"ret-pressable font-mono text-[12px] text-[var(--ret-text)]",
					open
						? "border-[var(--ret-accent)]"
						: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
				)}
			>
				<span className={cn("truncate", !selected && "text-[var(--ret-text-muted)]")}>
					{selected?.label ?? placeholder}
				</span>
				<ChevronDown
					className={cn(
						"h-3.5 w-3.5 shrink-0 text-[var(--ret-text-muted)] transition-transform duration-[var(--ret-duration-hover)] [transition-timing-function:var(--ret-ease-out)]",
						open && "rotate-180",
					)}
					strokeWidth={1.75}
				/>
			</button>
			{open ? (
				<div
					id={listId}
					role="listbox"
					className="ret-popover-panel absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
				>
					{groups.map((g) => (
						<div key={g.group ?? "_"}>
							{g.group ? (
								<p className="border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{g.group}
								</p>
							) : null}
							{g.items.map((opt) => {
								const active = opt.value === value;
								return (
									<button
										key={opt.value}
										type="button"
										role="option"
										aria-selected={active}
										aria-disabled={opt.disabled}
										disabled={opt.disabled}
										onClick={() => {
											if (opt.disabled) return;
											onChange(opt.value);
											setOpen(false);
										}}
										className={cn(
											"ret-pressable block w-full truncate px-2.5 py-1.5 text-left font-mono text-[12px]",
											opt.disabled
												? "cursor-not-allowed text-[var(--ret-text-muted)] opacity-60"
												: active
													? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
													: "text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
										)}
									>
										{opt.label}
									</button>
								);
							})}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

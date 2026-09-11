"use client";

import { SearchOutline, X } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function LibrarySearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
	return <label className={cn("relative flex min-h-11 w-full items-center gap-2 rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 focus-within:border-[var(--ret-text-dim)] sm:max-w-sm")}>
		<SearchOutline className={cn("size-4 shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" />
		<input type="search" aria-label={label} placeholder={label} value={value} onChange={event => onChange(event.target.value)} className={cn("min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--ret-text-muted)] [&::-webkit-search-cancel-button]:appearance-none")} />
		{value ? <button type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange("")} className={cn("grid size-7 shrink-0 place-items-center rounded-sm text-[var(--ret-text-muted)] hover:text-[var(--ret-text)] focus-visible:outline-2")}><X className={cn("size-3.5")} aria-hidden="true" /></button> : null}
	</label>;
}

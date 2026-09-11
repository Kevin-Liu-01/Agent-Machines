"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** Native modal focus containment, Escape, and return-to-trigger. */
export function DashboardDialog({ title, children, onClose, busy = false }: {
	title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	useEffect(() => {
		const node = dialog.current;
		const trigger = document.activeElement;
		node?.showModal();
		return () => { node?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
	}, []);
	return <dialog ref={dialog} aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className={cn("fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_32px)] max-w-xl overflow-y-auto rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)] p-0 text-[var(--ret-text)] shadow-2xl backdrop:bg-black/65")}>
		<header className={cn("flex items-center justify-between gap-4 border-b border-[var(--ret-border)] px-6 py-5")}>
			<h2 id={titleId} className={cn("text-xl font-semibold tracking-tight")}>{title}</h2>
			<button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className={cn("grid size-9 shrink-0 place-items-center rounded-md text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-text)] disabled:opacity-40")}><X className={cn("size-4")} aria-hidden="true" /></button>
		</header>
		<div className={cn("space-y-4 p-6")}>{children}</div>
	</dialog>;
}

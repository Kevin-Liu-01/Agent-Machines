"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Clock, FileText, History, Activity } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export const SCHEDULE_STARTERS = [
	{ name: "Daily project brief", schedule: "0 9 * * *", cadence: "Daily · 09:00 UTC", icon: FileText, prompt: "Review this workspace’s project files and recent notes. Write a concise daily briefing with changes, open questions, and suggested next steps. Save the briefing to a dated file; do not modify project code or send messages." },
	{ name: "Weekly review", schedule: "0 9 * * mon", cadence: "Monday · 09:00 UTC", icon: History, prompt: "Review the project files and available activity from the past week. Save a weekly summary covering progress, unresolved issues, and suggested priorities. Do not modify project code or contact external services." },
	{ name: "Hourly status check", schedule: "0 * * * *", cadence: "Hourly · On the hour", icon: Activity, prompt: "Inspect this workspace’s available logs for new errors. Save a brief status note describing what you checked and any failures. Do not restart processes, change files other than the status note, or send external messages." },
] as const;

export type ScheduleDraft = { name: string; schedule: string; prompt: string };

export function ScheduleStarters({ onSelect, disabled = false }: { onSelect?: (draft: ScheduleDraft) => void; disabled?: boolean }) {
	const [selected, setSelected] = useState(0);
	const starter = SCHEDULE_STARTERS[selected];
	return <section aria-label="Schedule starters" className="grid min-w-0 overflow-hidden rounded-lg border border-[var(--ret-border)] md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
		<div className="space-y-1 bg-[var(--ret-bg-soft)] p-3"><h2 className="px-2 pb-2 text-sm font-medium">Start with a responsibility</h2>{SCHEDULE_STARTERS.map(({ name, cadence, icon: Icon }, i) => <button key={name} type="button" aria-pressed={selected === i} disabled={disabled} onClick={() => setSelected(i)} className={cn("flex min-h-16 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-2 disabled:opacity-50", selected === i ? "bg-[var(--ret-bg)] shadow-sm" : "text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)]")}><Icon size={19} aria-hidden="true" /><span><span className="block text-sm font-medium">{name}</span><span className="mt-1 block text-xs text-[var(--ret-text-muted)]">{cadence}</span></span></button>)}</div>
		<div className="flex min-w-0 flex-col p-5" aria-live="polite">
			<div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-medium">{starter.name}</h3><span className="inline-flex items-center gap-1.5 text-xs text-[var(--ret-text-muted)]"><Clock size={14} aria-hidden="true" />Draft preview</span></div>
			<p className="mt-3 flex-1 text-sm leading-6 text-[var(--ret-text-dim)]">{starter.prompt}</p>
			<div className="my-4 flex items-center gap-2 text-xs text-[var(--ret-text-muted)]"><span className="rounded border border-[var(--ret-border)] px-2 py-1.5">{starter.cadence}</span><ArrowRight size={14} aria-hidden="true" /><span>Run prompt</span><ArrowRight size={14} aria-hidden="true" /><span>Record result</span></div>
			{onSelect ? <button type="button" disabled={disabled} onClick={() => onSelect({ name: starter.name, schedule: starter.schedule, prompt: starter.prompt })} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-md border border-[var(--ret-border)] px-3 text-sm font-medium hover:bg-[var(--ret-surface)] focus-visible:outline-2 disabled:opacity-50">Use this schedule<ArrowRight size={16} aria-hidden="true" /></button> : <Link href="/dashboard/machines" className="inline-flex min-h-10 items-center gap-2 self-start rounded-md bg-[var(--ret-text)] px-4 text-sm font-medium text-[var(--ret-bg)] focus-visible:outline-2 focus-visible:outline-offset-2">Choose a workspace<ArrowRight size={16} aria-hidden="true" /></Link>}
			<p className="mt-3 text-xs leading-5 text-[var(--ret-text-muted)]">Nothing runs from this preview. Review before saving; enabled schedules can incur compute and model charges.</p>
		</div>
	</section>;
}

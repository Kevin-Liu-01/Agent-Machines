"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, SquareTerminal, FolderOpen, History, Server, FileText, Check, type LucideIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const VIEWS = [
	{ id: "terminal", label: "Terminal", icon: SquareTerminal },
	{ id: "files", label: "Files", icon: FolderOpen },
	{ id: "activity", label: "Activity", icon: History },
] as const;

/** An explicitly illustrative workbench, never fabricated machine activity. */
export function WorkspacePreview({ onCreate }: { onCreate: () => void }) {
	const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("terminal");
	return <section className="grid overflow-hidden rounded-lg border border-[var(--ret-border)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-labelledby="workspace-preview-title">
		<div className="flex flex-col justify-center gap-4 p-5 sm:p-6">
			<Server size={24} className="text-[var(--ret-purple)]" aria-hidden="true" />
			<div><h2 id="workspace-preview-title" className="text-2xl font-medium tracking-tight">A home for the work.</h2><p className="mt-2 max-w-sm text-[15px] leading-6 text-[var(--ret-text-dim)]">Run an agent, inspect its files, and follow its activity in one workspace.</p></div>
			<div className="flex flex-wrap gap-2"><button type="button" onClick={onCreate} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--ret-text)] px-4 text-sm font-medium text-[var(--ret-bg)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2">Create a workspace<ArrowRight size={16} aria-hidden="true" /></button><Link href="/dashboard/agents" className="inline-flex min-h-10 items-center rounded-md px-3 text-sm underline-offset-4 hover:underline focus-visible:outline-2">Start with a template</Link></div>
			<p className="text-xs leading-5 text-[var(--ret-text-muted)]">Requires compute and model credentials. Your providers bill you directly.</p>
		</div>
		<div className="min-w-0 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3 sm:p-5 lg:border-l lg:border-t-0">
			<div className="overflow-hidden rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)]">
				<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-4 py-3"><span className="text-sm font-medium">Your workbench</span><span className="text-xs text-[var(--ret-text-muted)]">Interactive preview</span></div>
				<div role="tablist" aria-label="Workspace preview" className="flex gap-1 border-b border-[var(--ret-border)] px-2">
					{VIEWS.map(({ id, label, icon: Icon }) => <button key={id} id={`preview-tab-${id}`} type="button" role="tab" aria-selected={view === id} aria-controls="workspace-preview-panel" onClick={() => setView(id)} onKeyDown={event => { const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (!offset) return; event.preventDefault(); const next = VIEWS[(VIEWS.findIndex(v => v.id === view) + offset + VIEWS.length) % VIEWS.length].id; setView(next); document.getElementById(`preview-tab-${next}`)?.focus(); }} tabIndex={view === id ? 0 : -1} className={cn("flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px]", view === id ? "border-[var(--ret-purple)]" : "border-transparent text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]")}><Icon size={15} aria-hidden="true" />{label}</button>)}
				</div>
				<div id="workspace-preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${view}`} className="flex min-h-52 flex-col justify-center p-5" tabIndex={0}>
					{view === "terminal" ? <><SquareTerminal size={24} className="mb-4 text-[var(--ret-text-muted)]" aria-hidden="true" /><h3 className="text-base font-medium">Work directly with the agent.</h3><p className="mt-2 text-sm leading-6 text-[var(--ret-text-dim)]">The live terminal appears here after you create a machine and install its runtime.</p><div className="mt-4 flex gap-2 font-mono text-sm text-[var(--ret-text-muted)]" aria-hidden="true"><span>❯</span><span className="h-4 w-2 bg-[var(--ret-text-muted)]/30" /></div></> : view === "files" ? <><PreviewRow icon={FolderOpen} title="Project files" detail="Browse the workspace’s filesystem." /><PreviewRow icon={FileText} title="Saved output" detail="Open the artifacts your agent produces." /><p className="mt-3 text-xs text-[var(--ret-text-muted)]">Example destinations. No files have been created.</p></> : <><PreviewRow icon={History} title="Sessions" detail="Return to recorded conversations." /><PreviewRow icon={Check} title="Run evidence" detail="Inspect logs and recorded operation results." /><p className="mt-3 text-xs text-[var(--ret-text-muted)]">Activity appears after the first run.</p></>}
				</div>
			</div>
		</div>
	</section>;
}

function PreviewRow({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
	return <div className="flex items-center gap-3 py-3"><Icon size={20} className="shrink-0 text-[var(--ret-text-muted)]" aria-hidden="true" /><div><h3 className="text-sm font-medium">{title}</h3><p className="mt-1 text-sm text-[var(--ret-text-dim)]">{detail}</p></div></div>;
}

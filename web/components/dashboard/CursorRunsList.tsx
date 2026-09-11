"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { LiveDataView } from "@/components/dashboard/LiveDataView";
import { Logo } from "@/components/Logo";
import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { cn } from "@/lib/cn";
import { formatAge, formatDuration } from "@/lib/dashboard/format";
import type { CursorRun, CursorRunsPayload } from "@/lib/dashboard/types";

const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;

const STATUS_COLOR: Record<string, string> = {
	completed: "text-[var(--ret-green)]",
	succeeded: "text-[var(--ret-green)]",
	error: "text-[var(--ret-red)]",
	failed: "text-[var(--ret-red)]",
	cancelled: "text-[var(--ret-amber)]",
	running: "text-[var(--ret-amber)]",
};

export function CursorRunsList() {
	const pathname = usePathname();
	const machineCtx = useOptionalMachineContext();
	const machineMatch = MACHINE_PATH_RE.exec(pathname);
	const machineId = machineCtx?.machineId ?? machineMatch?.[1];
	const chatHref = machineId
		? `/dashboard/machines/${encodeURIComponent(machineId)}/chat`
		: "/dashboard/chat";
	const endpoint = machineId
		? `/api/dashboard/cursor?machineId=${encodeURIComponent(machineId)}`
		: "/api/dashboard/cursor";

	return (
		<LiveDataView<CursorRunsPayload>
			key={endpoint}
			endpoint={endpoint}
			loadingLabel="Loading Cursor runs…"
			pollMs={30_000}
			offlineHint={"# the dashboard reads:\ncat ~/.agent-machines/cursor-runs.jsonl"}
			render={(data, fetchedAt) => (
				<div className="flex flex-col gap-5 px-[var(--dashboard-gutter,20px)] py-8">
					<div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-[13px] text-[var(--ret-text-dim)]">
						<span>
							<span className="text-[var(--ret-text-muted)]">total</span>{" "}
							{data.totalRuns}
						</span>
						<span>
							<span className="text-[var(--ret-text-muted)]">log</span>{" "}
							{data.logPath}
						</span>
						<span className="ml-auto text-[var(--ret-text-muted)]">
							refreshed {formatAge(fetchedAt)}
						</span>
					</div>

					{data.runs.length === 0 ? (
						<div className="border border-dashed border-[var(--ret-border)] bg-[var(--ret-bg)] px-6 py-12 text-center text-sm text-[var(--ret-text-dim)]">
						<h2 className="text-lg font-medium text-[var(--ret-text)]">No recorded Cursor runs</h2>
						<p className="mt-2">Delegate a coding task from chat. Runs recorded by the runtime appear here.</p>
						<a href={chatHref} className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--ret-border)] px-4 text-[var(--ret-text)] hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Open chat</a>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							{data.runs.map((run) => (
								<RunCard key={`${run.runId}:${run.loggedAt}`} run={run} />
							))}
						</div>
					)}
				</div>
			)}
		/>
	);
}

function RunCard({ run }: { run: CursorRun }) {
	const [open, setOpen] = useState(false);
	const statusClass = STATUS_COLOR[run.status] ?? "text-[var(--ret-text-dim)]";
	return (
		<article className="overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--ret-surface)]"
			>
				<Logo mark="cursor" size={22} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-baseline gap-2">
						<p className="font-mono text-[13px] text-[var(--ret-text)]">
							{run.kind}
						</p>
						<p className="font-mono text-[13px] text-[var(--ret-text-muted)]">
							{run.runId.slice(0, 24)}...
						</p>
						<p className="font-mono text-[13px] text-[var(--ret-text-muted)]">
							{run.model}
						</p>
					</div>
					<p className="mt-1 line-clamp-1 text-[13px] text-[var(--ret-text-dim)]">
						{run.prompt}
					</p>
				</div>
				<div className="hidden shrink-0 flex-col items-end gap-1 font-mono text-[13px] md:flex">
					<span className={cn("uppercase tracking-[0.18em]", statusClass)}>
						{run.status}
					</span>
					<span className="text-[var(--ret-text-muted)]">
						{formatDuration(run.durationMs)} . {formatAge(run.loggedAt)}
					</span>
				</div>
				<span
					aria-hidden="true"
					className={cn(
						"font-mono text-[14px] text-[var(--ret-text-muted)] transition-transform",
						open ? "rotate-90" : "rotate-0",
					)}
				>
					{">"}
				</span>
			</button>
			{open ? (
				<div className="grid gap-3 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-5 py-4 text-sm md:grid-cols-2">
					<RunMeta label="agent_id" value={run.agentId} />
					<RunMeta label="working_dir" value={run.workingDir} />
					<RunMeta label="status" value={run.status} />
					<RunMeta label="logged_at" value={run.loggedAt} />
					<RunMeta
						label="loaded_skills"
						value={run.loadedSkills.length > 0 ? run.loadedSkills.join(",") : "(none)"}
					/>
					<RunMeta label="duration" value={formatDuration(run.durationMs)} />
					<div className="md:col-span-2">
						<p className="text-xs font-medium text-[var(--ret-text-muted)]">
							prompt
						</p>
						<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-sm text-[var(--ret-text)]">
							{run.prompt}
						</pre>
					</div>
					{run.finalText ? (
						<div className="md:col-span-2">
							<p className="text-xs font-medium text-[var(--ret-text-muted)]">
								final_text
							</p>
							<pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-sm text-[var(--ret-text-dim)]">
								{run.finalText}
							</pre>
						</div>
					) : null}
				</div>
			) : null}
		</article>
	);
}

function RunMeta({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline gap-3">
			<span className="text-xs font-medium text-[var(--ret-text-muted)]">
				{label}
			</span>
			<span className="break-all font-mono text-[var(--ret-text-dim)]">{value}</span>
		</div>
	);
}

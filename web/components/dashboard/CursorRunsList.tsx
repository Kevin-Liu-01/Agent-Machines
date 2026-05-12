"use client";

import { useState } from "react";

import { LiveDataView } from "@/components/dashboard/LiveDataView";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import { formatAge, formatDuration } from "@/lib/dashboard/format";
import type { CursorRun, CursorRunsPayload } from "@/lib/dashboard/types";

const STATUS_COLOR: Record<string, string> = {
	completed: "text-[var(--ret-green)]",
	succeeded: "text-[var(--ret-green)]",
	error: "text-[var(--ret-red)]",
	failed: "text-[var(--ret-red)]",
	cancelled: "text-[var(--ret-amber)]",
	running: "text-[var(--ret-amber)]",
};

export function CursorRunsList() {
	return (
		<LiveDataView<CursorRunsPayload>
			endpoint="/api/dashboard/cursor"
			pollMs={30_000}
			offlineHint={"# the dashboard reads:\ncat ~/.agent-machines/cursor-runs.jsonl"}
			render={(data, fetchedAt) => (
				<div className="flex flex-col gap-4 px-6 py-6">
					<div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-[11px] text-[var(--ret-text-dim)]">
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
							No Cursor agents have been spawned yet. Hand the agent some
							code work in{" "}
							<a href="/dashboard/chat" className="underline">
								chat
							</a>{" "}
							-- it'll log every run here.
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
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--ret-surface)]"
			>
				<Logo mark="cursor" size={22} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-baseline gap-2">
						<p className="font-mono text-[13px] text-[var(--ret-text)]">
							{run.kind}
						</p>
						<p className="font-mono text-[11px] text-[var(--ret-text-muted)]">
							{run.runId.slice(0, 24)}...
						</p>
						<p className="font-mono text-[11px] text-[var(--ret-text-muted)]">
							{run.model}
						</p>
					</div>
					<p className="mt-1 line-clamp-1 text-[13px] text-[var(--ret-text-dim)]">
						{run.prompt}
					</p>
				</div>
				<div className="hidden shrink-0 flex-col items-end gap-1 font-mono text-[11px] md:flex">
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
				<div className="grid gap-3 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-5 py-4 text-[12px] md:grid-cols-2">
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
						<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							prompt
						</p>
						<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)]">
							{run.prompt}
						</pre>
					</div>
					{run.finalText ? (
						<div className="md:col-span-2">
							<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
								final_text
							</p>
							<pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text-dim)]">
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
			<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<span className="break-all font-mono text-[var(--ret-text-dim)]">{value}</span>
		</div>
	);
}

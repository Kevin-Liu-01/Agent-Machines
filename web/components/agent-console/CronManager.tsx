"use client";

/**
 * Crons tab for the agent console. Lists, creates, edits, enables/disables,
 * deletes, and runs-now the scheduled tasks for the console's machine.
 * Fully wired to /api/dashboard/crons (see lib/crons/service.ts). The
 * server-side scheduler fires enabled crons on their schedule; "run now"
 * dispatches immediately and reports the outcome.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { describeSchedule, isValidSchedule } from "@/lib/cron/expr";
import type { CronEntry, CronStatus } from "@/lib/user-config/schema";

type Props = {
	machineId: string | null;
	machineOk: boolean;
};

type Draft = {
	name: string;
	schedule: string;
	prompt: string;
};

const EMPTY_DRAFT: Draft = { name: "", schedule: "0 9 * * *", prompt: "" };

const SCHEDULE_PRESETS = [
	{ label: "every 15m", value: "*/15 * * * *" },
	{ label: "hourly", value: "0 * * * *" },
	{ label: "daily 09:00", value: "0 9 * * *" },
	{ label: "weekly Mon", value: "0 9 * * mon" },
];

export function CronManager({ machineId, machineOk }: Props) {
	const [crons, setCrons] = useState<CronEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | "new" | null>(null);
	const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [runOut, setRunOut] = useState<{ id: string; text: string } | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const r = await fetch("/api/dashboard/crons", { cache: "no-store" });
			const body = (await r.json()) as { ok?: boolean; crons?: CronEntry[]; error?: string };
			if (!r.ok || !body.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
			setCrons(body.crons ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "load_failed");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const machineCrons = useMemo(
		() => (machineId ? crons.filter((c) => c.machineId === machineId) : crons),
		[crons, machineId],
	);

	const startCreate = () => {
		setDraft(EMPTY_DRAFT);
		setEditing("new");
		setRunOut(null);
	};

	const startEdit = (cron: CronEntry) => {
		setDraft({ name: cron.name, schedule: cron.schedule, prompt: cron.prompt });
		setEditing(cron.id);
		setRunOut(null);
	};

	const save = async () => {
		if (!machineId) return;
		const name = draft.name.trim();
		const schedule = draft.schedule.trim();
		const prompt = draft.prompt.trim();
		if (!name || !prompt || !isValidSchedule(schedule)) return;
		setBusyId("save");
		try {
			if (editing === "new") {
				await fetch("/api/dashboard/crons", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, schedule, prompt, machineId }),
				});
			} else if (editing) {
				await fetch(`/api/dashboard/crons/${encodeURIComponent(editing)}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, schedule, prompt }),
				});
			}
			setEditing(null);
			await load();
		} finally {
			setBusyId(null);
		}
	};

	const toggle = async (cron: CronEntry) => {
		setBusyId(cron.id);
		try {
			await fetch(`/api/dashboard/crons/${encodeURIComponent(cron.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: !cron.enabled }),
			});
			await load();
		} finally {
			setBusyId(null);
		}
	};

	const remove = async (cron: CronEntry) => {
		if (!window.confirm(`Delete cron "${cron.name}"?`)) return;
		setBusyId(cron.id);
		try {
			await fetch(`/api/dashboard/crons/${encodeURIComponent(cron.id)}`, {
				method: "DELETE",
			});
			await load();
		} finally {
			setBusyId(null);
		}
	};

	const runNow = async (cron: CronEntry) => {
		setBusyId(cron.id);
		setRunOut(null);
		try {
			const r = await fetch(
				`/api/dashboard/crons/${encodeURIComponent(cron.id)}/run`,
				{ method: "POST" },
			);
			const body = (await r.json()) as {
				status?: CronStatus;
				summary?: string;
				output?: string | null;
				error?: string;
				message?: string;
			};
			setRunOut({
				id: cron.id,
				text:
					body.output?.trim() ||
					body.summary ||
					body.message ||
					body.error ||
					"(no output)",
			});
			await load();
		} catch (err) {
			setRunOut({ id: cron.id, text: err instanceof Error ? err.message : "run_failed" });
		} finally {
			setBusyId(null);
		}
	};

	if (loading) {
		return (
			<div className="p-3">
				<BrailleSpinner name="orbit" label="loading crons" className="text-[10px] text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-3 py-2">
				<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					Scheduled · {machineCrons.length}
				</span>
				<ReticleButton
					variant="primary"
					size="sm"
					onClick={startCreate}
					disabled={!machineOk || editing === "new"}
				>
					+ new
				</ReticleButton>
			</div>

			{error ? (
				<div className="border-b border-[var(--ret-border)] px-3 py-2">
					<p className="font-mono text-[10px] text-[var(--ret-red)]">{error}</p>
					<button type="button" onClick={() => void load()} className="mt-1 font-mono text-[10px] text-[var(--ret-accent)] underline">
						retry
					</button>
				</div>
			) : null}

			{editing === "new" ? (
				<CronForm
					draft={draft}
					setDraft={setDraft}
					onSave={save}
					onCancel={() => setEditing(null)}
					saving={busyId === "save"}
				/>
			) : null}

			{machineCrons.length === 0 && editing !== "new" ? (
				<div className="p-3">
					<p className="font-mono text-[11px] text-[var(--ret-text-muted)]">No crons yet.</p>
					<p className="mt-1 text-[10px] leading-relaxed text-[var(--ret-text-dim)]">
						Create one to run an agent prompt on a schedule. The scheduler fires it
						automatically; use Run to test it now.
					</p>
				</div>
			) : null}

			{machineCrons.map((cron) =>
				editing === cron.id ? (
					<CronForm
						key={cron.id}
						draft={draft}
						setDraft={setDraft}
						onSave={save}
						onCancel={() => setEditing(null)}
						saving={busyId === "save"}
					/>
				) : (
					<CronRow
						key={cron.id}
						cron={cron}
						busy={busyId === cron.id}
						runOutput={runOut?.id === cron.id ? runOut.text : null}
						onRun={() => void runNow(cron)}
						onToggle={() => void toggle(cron)}
						onEdit={() => startEdit(cron)}
						onDelete={() => void remove(cron)}
					/>
				),
			)}
		</div>
	);
}

function CronForm({
	draft,
	setDraft,
	onSave,
	onCancel,
	saving,
}: {
	draft: Draft;
	setDraft: (d: Draft) => void;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
}) {
	const scheduleValid = isValidSchedule(draft.schedule);
	const canSave = draft.name.trim() && draft.prompt.trim() && scheduleValid && !saving;
	const inputCls = cn(
		"w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1",
		"font-mono text-[11px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
		"focus:border-[var(--ret-accent)] focus:outline-none",
	);

	return (
		<div className="border-b border-[var(--ret-border)] bg-[var(--ret-surface)]/40 px-3 py-2.5">
			<div className="flex flex-col gap-2">
				<input
					className={inputCls}
					placeholder="name (e.g. nightly-digest)"
					value={draft.name}
					onChange={(e) => setDraft({ ...draft, name: e.target.value })}
				/>
				<div>
					<input
						className={cn(inputCls, !scheduleValid && draft.schedule ? "border-[var(--ret-red)]/60" : "")}
						placeholder="schedule (cron or 'every 30m')"
						value={draft.schedule}
						onChange={(e) => setDraft({ ...draft, schedule: e.target.value })}
					/>
					<div className="mt-1 flex flex-wrap gap-1">
						{SCHEDULE_PRESETS.map((p) => (
							<button
								key={p.value}
								type="button"
								onClick={() => setDraft({ ...draft, schedule: p.value })}
								className="border border-[var(--ret-border)] px-1.5 py-0.5 font-mono text-[8px] text-[var(--ret-text-muted)] hover:border-[var(--ret-accent)] hover:text-[var(--ret-text)]"
							>
								{p.label}
							</button>
						))}
					</div>
					<p className="mt-1 font-mono text-[9px] text-[var(--ret-text-dim)]">
						{scheduleValid ? describeSchedule(draft.schedule) : "invalid schedule"} · UTC
					</p>
				</div>
				<textarea
					className={cn(inputCls, "min-h-[64px] resize-y leading-relaxed")}
					placeholder="prompt to run on the agent…"
					value={draft.prompt}
					onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
				/>
				<div className="flex items-center gap-2">
					<ReticleButton variant="primary" size="sm" onClick={onSave} disabled={!canSave}>
						{saving ? "saving…" : "save"}
					</ReticleButton>
					<button
						type="button"
						onClick={onCancel}
						className="font-mono text-[10px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
					>
						cancel
					</button>
				</div>
			</div>
		</div>
	);
}

const STATUS_TONE: Record<CronStatus, string> = {
	success: "bg-[var(--ret-green)]",
	failed: "bg-[var(--ret-red)]",
	running: "bg-[var(--ret-amber)]",
};

function CronRow({
	cron,
	busy,
	runOutput,
	onRun,
	onToggle,
	onEdit,
	onDelete,
}: {
	cron: CronEntry;
	busy: boolean;
	runOutput: string | null;
	onRun: () => void;
	onToggle: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className={cn("border-b border-[var(--ret-border)]/30", !cron.enabled && "opacity-55")}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--ret-surface)]"
			>
				<span
					className={cn(
						"h-1.5 w-1.5 shrink-0 rounded-full",
						cron.lastStatus ? STATUS_TONE[cron.lastStatus] : "bg-[var(--ret-text-muted)]",
					)}
					aria-hidden
				/>
				<div className="min-w-0 flex-1">
					<p className="truncate font-mono text-[11px] text-[var(--ret-text)]">{cron.name}</p>
					<p className="font-mono text-[9px] text-[var(--ret-text-muted)]">
						{describeSchedule(cron.schedule)}
						{cron.lastRunAt ? ` · ran ${timeAgo(cron.lastRunAt)}` : " · never run"}
					</p>
				</div>
				{!cron.enabled ? (
					<span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
						paused
					</span>
				) : null}
				<span
					className={cn(
						"shrink-0 font-mono text-[10px] text-[var(--ret-text-muted)] transition-transform",
						open ? "rotate-90" : "rotate-0",
					)}
				>
					{">"}
				</span>
			</button>
			{open ? (
				<div className="border-t border-[var(--ret-border)]/20 px-3 py-2">
					<p className="text-[10px] leading-relaxed text-[var(--ret-text-dim)]">{cron.prompt}</p>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<RowAction label={busy ? "…" : "run now"} onClick={onRun} disabled={busy} accent />
						<RowAction label={cron.enabled ? "pause" : "resume"} onClick={onToggle} disabled={busy} />
						<RowAction label="edit" onClick={onEdit} disabled={busy} />
						<RowAction label="delete" onClick={onDelete} disabled={busy} danger />
					</div>
					{runOutput ? (
						<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] p-2 font-mono text-[9px] leading-relaxed text-[var(--ret-text-dim)]">
							{runOutput}
						</pre>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function RowAction({
	label,
	onClick,
	disabled,
	accent,
	danger,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	accent?: boolean;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"border border-[var(--ret-border)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50",
				accent
					? "text-[var(--ret-accent)] hover:border-[var(--ret-accent)]"
					: danger
						? "text-[var(--ret-text-muted)] hover:border-[var(--ret-red)]/60 hover:text-[var(--ret-red)]"
						: "text-[var(--ret-text-muted)] hover:border-[var(--ret-border-hover)] hover:text-[var(--ret-text)]",
			)}
		>
			{label}
		</button>
	);
}

function timeAgo(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "--";
	const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

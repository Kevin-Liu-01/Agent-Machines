"use client";

/**
 * Crons tab for the agent console. Lists, creates, edits, enables/disables,
 * deletes, and runs-now the scheduled tasks for the console's machine.
 * Fully wired to /api/dashboard/crons (see lib/crons/service.ts). The
 * server-side scheduler fires enabled crons on their schedule; "run now"
 * dispatches immediately and reports the outcome.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ChevronDown, Plus } from "@/components/ui/icons";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { describeSchedule, isValidSchedule } from "@/lib/cron/expr";
import type { CronEntry, CronStatus } from "@/lib/user-config/schema";
import { ScheduleStarters } from "@/components/dashboard/ScheduleStarters";

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

async function requireCronMutation(response: Response): Promise<void> {
	const body = await response.json().catch(() => ({}));
	if (!response.ok || !body.ok) throw new Error(body.message ?? body.error ?? `Cron update failed (HTTP ${response.status}).`);
}

export function CronManager({ machineId, machineOk: _machineOk }: Props) {
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
		if (!machineId || busyId) return;
		const name = draft.name.trim();
		const schedule = draft.schedule.trim();
		const prompt = draft.prompt.trim();
		if (!name || !prompt || !isValidSchedule(schedule)) return;
		setBusyId("save");
		try {
			if (editing === "new") {
				await requireCronMutation(await fetch("/api/dashboard/crons", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, schedule, prompt, machineId }),
				}));
			} else if (editing) {
				await requireCronMutation(await fetch(`/api/dashboard/crons/${encodeURIComponent(editing)}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, schedule, prompt }),
				}));
			}
			setEditing(null);
			await load();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "Cron update failed.");
		} finally {
			setBusyId(null);
		}
	};

	const toggle = async (cron: CronEntry) => {
		setBusyId(cron.id);
		try {
			await requireCronMutation(await fetch(`/api/dashboard/crons/${encodeURIComponent(cron.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: !cron.enabled }),
			}));
			await load();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "Cron update failed.");
		} finally {
			setBusyId(null);
		}
	};

	const remove = async (cron: CronEntry) => {
		if (!window.confirm(`Delete cron "${cron.name}"?`)) return;
		setBusyId(cron.id);
		try {
			await requireCronMutation(await fetch(`/api/dashboard/crons/${encodeURIComponent(cron.id)}`, {
				method: "DELETE",
			}));
			await load();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "Cron deletion failed.");
		} finally {
			setBusyId(null);
		}
	};

	const runNow = async (cron: CronEntry) => {
		if (!window.confirm(`Run "${cron.name}" now? This executes its prompt on the selected machine and may incur provider and model charges.`)) return;
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
				<BrailleSpinner name="orbit" label="loading crons" className="text-sm text-[var(--ret-text-muted)]" />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
				<span className="text-sm font-medium text-[var(--ret-text-muted)]">
					Schedules · {machineCrons.length}
				</span>
				<ReticleButton
					variant="primary"
					size="sm"
					onClick={startCreate}
					disabled={!machineId || editing === "new" || Boolean(busyId)}
				>
					<Plus className="size-4" aria-hidden="true" /> New schedule
				</ReticleButton>
			</div>

			{error ? (
				<div className="border-b border-[var(--ret-border)] px-3 py-2">
					<p className="text-sm text-[var(--ret-red)]">{error}</p>
					<button type="button" onClick={() => void load()} className="mt-1 text-sm text-[var(--ret-accent)] underline">
						retry
					</button>
				</div>
			) : null}

			{editing === "new" ? (
				<CronForm
					creating
					draft={draft}
					setDraft={setDraft}
					onSave={save}
					onCancel={() => setEditing(null)}
					saving={busyId === "save"}
				/>
			) : null}

			{machineCrons.length === 0 && editing !== "new" ? (
				<div className="p-3">
					<p className="text-sm text-[var(--ret-text-muted)]">No schedules for this machine.</p>
					<p className="mt-1 text-sm leading-relaxed text-[var(--ret-text-dim)]">
						Create a recurring prompt. Saving enables scheduled execution and may incur provider and model charges. All schedules use UTC; the machine must be available to run.
					</p>
				</div>
			) : null}
			{machineId && machineCrons.length === 0 && !editing && !error ? <div className="p-3"><ScheduleStarters disabled={Boolean(busyId)} onSelect={draft => { setDraft(draft); setEditing("new"); setRunOut(null); }} /></div> : null}

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
						busy={Boolean(busyId)}
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
	creating = false,
	draft,
	setDraft,
	onSave,
	onCancel,
	saving,
}: {
	creating?: boolean;
	draft: Draft;
	setDraft: (d: Draft) => void;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
}) {
	const scheduleValid = isValidSchedule(draft.schedule);
	const canSave = draft.name.trim() && draft.prompt.trim() && scheduleValid && !saving;
	const inputCls = cn(
		"min-h-11 w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2",
		"text-sm text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)]",
		"focus:border-[var(--ret-accent)] focus:outline-none",
	);

	return (
		<div className="border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5">
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor="schedule-name">Name</label>
				<input
					id="schedule-name"
					maxLength={120}
					className={inputCls}
					placeholder="name (e.g. nightly-digest)"
					value={draft.name}
					onChange={(e) => setDraft({ ...draft, name: e.target.value })}
				/>
				<div>
					<label className="mb-2 block text-sm font-medium" htmlFor="schedule-expression">Schedule (UTC)</label>
					<input
						id="schedule-expression"
						aria-invalid={!scheduleValid}
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
								className="border border-[var(--ret-border)] px-1.5 py-0.5 min-h-8 rounded-sm text-xs text-[var(--ret-text-muted)] hover:border-[var(--ret-accent)] hover:text-[var(--ret-text)]"
							>
								{p.label}
							</button>
						))}
					</div>
					<p className="mt-1 text-xs text-[var(--ret-text-dim)]">
						{scheduleValid ? describeSchedule(draft.schedule) : "invalid schedule"} · UTC
					</p>
				</div>
				<label className="text-sm font-medium" htmlFor="schedule-prompt">Agent prompt</label>
				<textarea
					id="schedule-prompt"
					maxLength={100000}
					className={cn(inputCls, "min-h-[120px] resize-y leading-relaxed")}
					placeholder="prompt to run on the agent…"
					value={draft.prompt}
					onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
				/>
				<p id="schedule-execution-notice" className={cn("mt-2 text-sm leading-6 text-[var(--ret-text-dim)]")}>
					{creating ? "Saving enables automatic execution on this machine. " : "Enabled schedules run automatically on this machine. "}
					Scheduled runs may incur provider and model charges. Times use UTC; the machine must be available to run.
				</p>
				<div className="flex items-center gap-2">
					<ReticleButton variant="primary" size="sm" onClick={onSave} disabled={!canSave} aria-describedby="schedule-execution-notice">
						{saving ? "Saving…" : "Save schedule"}
					</ReticleButton>
					<button
						type="button"
						onClick={onCancel}
						disabled={saving}
						className="text-sm text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
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
				aria-expanded={open}
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
					<p className="truncate text-sm text-[var(--ret-text)]">{cron.name}</p>
					<p className="text-xs text-[var(--ret-text-muted)]">
						{describeSchedule(cron.schedule)}
						{cron.lastRunAt ? ` · ran ${timeAgo(cron.lastRunAt)}` : " · never run"}
					</p>
				</div>
				{!cron.enabled ? (
					<span className="shrink-0 text-xs text-[var(--ret-text-muted)]">
						paused
					</span>
				) : null}
				<span
					className={cn(
						"shrink-0 text-sm text-[var(--ret-text-muted)] transition-transform",
						open ? "rotate-180" : "rotate-0",
					)}
				>
					<ChevronDown className="size-4" aria-hidden="true" />
				</span>
			</button>
			{open ? (
				<div className="border-t border-[var(--ret-border)]/20 px-3 py-2">
					<p className="text-sm leading-relaxed text-[var(--ret-text-dim)]">{cron.prompt}</p>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<RowAction label={busy ? "…" : "run now"} onClick={onRun} disabled={busy || !cron.enabled} accent />
						<RowAction label={cron.enabled ? "pause" : "resume"} onClick={onToggle} disabled={busy} />
						<RowAction label="edit" onClick={onEdit} disabled={busy} />
						<RowAction label="delete" onClick={onDelete} disabled={busy} danger />
					</div>
					{runOutput ? (
						<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--ret-border)] bg-[var(--ret-bg)] p-2 text-xs leading-relaxed text-[var(--ret-text-dim)]">
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
				"border border-[var(--ret-border)] px-1.5 py-0.5 min-h-9 rounded-md text-sm transition-colors disabled:opacity-50",
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

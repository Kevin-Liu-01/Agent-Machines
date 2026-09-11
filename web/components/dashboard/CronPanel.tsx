"use client";

import { CronManager } from "@/components/agent-console/CronManager";
import { Clock } from "@/components/ui/icons";
import { useEffect, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { ScheduleStarters } from "@/components/dashboard/ScheduleStarters";
import { cn } from "@/lib/cn";
import type { CronEntry, PublicMachineRef } from "@/lib/user-config/schema";
import type { CronRunView } from "@/lib/crons/history";

type Payload = {
	ok: boolean;
	crons?: CronEntry[];
	runs?: CronRunView[];
	error?: string;
};

/** Manage one machine's schedules while retaining the entire fleet's run evidence. */
export function CronPanel() {
	const [crons, setCrons] = useState<CronEntry[] | null>(null);
	const [machines, setMachines] = useState<PublicMachineRef[] | null>(null);
	const [runs, setRuns] = useState<CronRunView[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [machineError, setMachineError] = useState<string | null>(null);
	const [machineRetry, setMachineRetry] = useState(0);
	const [historyRetry, setHistoryRetry] = useState(0);
	const [selectedMachineId, setSelectedMachineId] = useState("");
	const availableMachines = (machines ?? []).filter(machine => !machine.archived);
	const targetId = availableMachines.some(machine => machine.id === selectedMachineId) ? selectedMachineId : availableMachines[0]?.id ?? "";

	useEffect(() => {
		let disposed = false;
		let pending = false;
		const controller = new AbortController();
		setError(null);
		const refresh = async () => {
			if (pending) return;
			pending = true;
			try {
				const response = await fetch("/api/dashboard/crons", { cache: "no-store", signal: controller.signal });
				const json = await response.json() as Payload;
				if (!response.ok || !json.ok) throw new Error(json.error ?? `Cron history unavailable (HTTP ${response.status}).`);
				if (!disposed) { setCrons(json.crons ?? []); setRuns(json.runs ?? []); setError(null); }
			} catch (failure) { if (!disposed) setError(failure instanceof Error ? failure.message : "Cron history unavailable."); }
			finally { pending = false; }
		};
		void refresh();
		const interval = setInterval(() => void refresh(), 15_000);
		return () => { disposed = true; controller.abort(); clearInterval(interval); };
	}, [historyRetry]);

	useEffect(() => {
		let disposed = false;
		const controller = new AbortController();
		setMachineError(null);
		const loadMachines = async () => {
			try {
				const response = await fetch("/api/dashboard/machines", { cache: "no-store", signal: controller.signal });
				const json = await response.json() as { machines?: PublicMachineRef[]; error?: string; message?: string };
				if (!response.ok || !Array.isArray(json.machines)) throw new Error(json.message ?? json.error ?? `Machine list unavailable (HTTP ${response.status}).`);
				if (!disposed) setMachines(json.machines);
			} catch (failure) {
				if (!disposed) setMachineError(failure instanceof Error ? failure.message : "Could not load your machines.");
			}
		};
		void loadMachines();
		return () => { disposed = true; controller.abort(); };
	}, [machineRetry]);

	return (
		<div className={cn("flex flex-col")}>
			<PageHeader
				artSlug="cron"
				kicker="Automations"
				title="Automations"
				description="Schedule recurring prompts and review the results."
			/>
			<DashboardPageBody className={cn("space-y-5")}>
				{machineError ? <div role="alert" className={cn("rounded-lg border border-[var(--ret-border)] p-6")}>
					<h2 className={cn("text-lg font-semibold")}>Could not load your machines</h2>
					<p className={cn("mt-2 text-sm text-[var(--ret-text-dim)]")}>{machineError}</p>
					<button type="button" onClick={() => setMachineRetry(value => value + 1)} className={cn("mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--ret-border)] px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2")}>Retry machine list</button>
				</div> : machines === null ? <DashboardLoadingState label="Loading your machines…" variant="table" /> : availableMachines.length ? <section aria-label="Manage machine schedules" className={cn("overflow-hidden rounded-lg border border-[var(--ret-border)]")}>
					<div className={cn("flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ret-border)] p-5")}>
						<div className={cn("flex items-center gap-3")}><Clock className={cn("size-5")} aria-hidden="true" /><div><h2 className={cn("text-base font-semibold")}>Scheduled work</h2><p className={cn("mt-1 text-sm text-[var(--ret-text-muted)]")}>Select the machine that will run these prompts.</p></div></div>
						<label className={cn("flex items-center gap-3 text-sm")}>Machine<select value={targetId} onChange={event => setSelectedMachineId(event.target.value)} className={cn("min-h-11 max-w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 text-sm")}>{availableMachines.map(machine => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></label>
					</div>
					<CronManager key={targetId} machineId={targetId} machineOk={false} />
				</section> : <div className="space-y-3"><p className="text-sm text-[var(--ret-text-dim)]">A schedule needs a machine. Explore a draft below, then choose a workspace to configure it.</p><ScheduleStarters /></div>}
				{error ? <div role="alert" className="rounded-md border border-[var(--ret-red)]/30 p-4 text-sm text-[var(--ret-red)]"><p>{error}</p><button type="button" onClick={() => setHistoryRetry(value => value + 1)} className="mt-2 min-h-11 rounded-md border border-[var(--ret-border)] px-4 text-[var(--ret-text)] hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Retry run history</button></div> : null}
				<section aria-label="Cron run history" className={cn("space-y-3")}>
					<h2 className={cn("text-base font-medium text-[var(--ret-text)]")}>Fleet run history</h2>
					<p className={cn("text-sm text-[var(--ret-text-muted)]")}>Recorded operations remain here after a schedule is deleted.</p>
					{crons === null && !error ? <DashboardLoadingState label="Loading run history…" variant="table" /> : null}
					{crons !== null && !error && runs.length === 0 ? <p className={cn("text-sm text-[var(--ret-text-dim)]")}>No recorded runs yet. Completed and attempted scheduled work will appear here.</p> : null}
					{runs.map((run) => (
						<details key={run.operationId} className={cn("border border-[var(--ret-border)] p-3")}>
							<summary className={cn("cursor-pointer text-sm text-[var(--ret-text)]")}>
								{crons?.find((cron) => cron.id === run.scheduleId)?.name ?? "Deleted schedule"} · {run.status} · {new Date(run.startedAt ?? run.createdAt).toLocaleString()}
							</summary>
							<p className={cn("mt-2 text-xs text-[var(--ret-text-dim)]")}>{run.summary}</p>
							<p className={cn("mt-1 text-xs text-[var(--ret-text-muted)]")}>Operation {run.operationId}{run.exitCode !== undefined ? ` · exit ${run.exitCode}` : ""}</p>
							{run.output ? <pre className={cn("mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--ret-text)]")}>{run.output}</pre> : null}
						</details>
						))}
				</section>
			</DashboardPageBody>
		</div>
	);
}

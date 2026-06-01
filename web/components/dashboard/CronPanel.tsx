"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { describeSchedule } from "@/lib/cron/expr";
import type { CronEntry, CronStatus, PublicMachineRef } from "@/lib/user-config/schema";

type Payload = {
	ok: boolean;
	crons?: CronEntry[];
};

const STATUS_VARIANT: Record<CronStatus, "success" | "default"> = {
	success: "success",
	failed: "default",
	running: "default",
};

const STATUS_TONE: Record<CronStatus, string> = {
	success: "bg-[var(--ret-green)]",
	failed: "bg-[var(--ret-red)]",
	running: "bg-[var(--ret-amber)]",
};

/**
 * Fleet-wide view of scheduled crons. Read-only overview grouped by machine;
 * creating / editing / running a cron happens in that machine's console
 * (Crons tab), so this links straight there.
 */
export function CronPanel() {
	const [crons, setCrons] = useState<CronEntry[] | null>(null);
	const [machines, setMachines] = useState<PublicMachineRef[]>([]);

	useEffect(() => {
		fetch("/api/dashboard/crons", { cache: "no-store" })
			.then((r) => r.json() as Promise<Payload>)
			.then((json) => setCrons(json.crons ?? []))
			.catch(() => setCrons([]));
		fetch("/api/dashboard/machines", { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<{ machines?: PublicMachineRef[] }>) : null))
			.then((json) => setMachines(json?.machines ?? []))
			.catch(() => setMachines([]));
	}, []);

	const machineName = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of machines) map.set(m.id, m.name);
		return map;
	}, [machines]);

	const grouped = useMemo(() => {
		const map = new Map<string, CronEntry[]>();
		for (const cron of crons ?? []) {
			const list = map.get(cron.machineId) ?? [];
			list.push(cron);
			map.set(cron.machineId, list);
		}
		return [...map.entries()];
	}, [crons]);

	if (!crons) {
		return (
			<DashboardPageBody>
				<div className="flex items-center gap-2 py-12 text-[11px] text-[var(--ret-text-muted)]">
					<BrailleSpinner /> loading cron registry...
				</div>
			</DashboardPageBody>
		);
	}

	return (
		<div className="flex flex-col">
			<PageHeader
				artSlug="cron"
				kicker="AUTOMATION"
				title="Cron schedules"
				description="Autonomous agent work — health checks, digests, audits. The scheduler fires enabled crons on their schedule. Create and run crons from each machine's console."
			/>
			<DashboardPageBody className="space-y-5">
				{grouped.length === 0 ? (
					<ReticleFrame className="px-4 py-10 text-center">
						<p className="text-[13px] text-[var(--ret-text-dim)]">No crons scheduled yet.</p>
						<p className="mt-1 text-[11px] text-[var(--ret-text-muted)]">
							Open a machine console and use the Crons tab to schedule agent work.
						</p>
					</ReticleFrame>
				) : null}

				{grouped.map(([machineId, list]) => {
					const base = `/dashboard/machines/${machineId}`;
					const name = machineName.get(machineId) ?? `${machineId.slice(0, 12)}…`;
					return (
						<section key={machineId} className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
										{name}
									</span>
									<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
										{list.length} cron{list.length === 1 ? "" : "s"}
									</span>
								</div>
								<Link
									href={`${base}/console`}
									className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-accent)] hover:underline"
								>
									manage →
								</Link>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								{list.map((cron) => (
									<ReticleFrame key={cron.id} className={cn("p-4", !cron.enabled && "opacity-60")}>
										<div className="mb-2 flex items-center justify-between gap-2">
											<div className="flex min-w-0 items-center gap-2">
												<span
													className={cn(
														"h-1.5 w-1.5 shrink-0 rounded-full",
														cron.lastStatus
															? STATUS_TONE[cron.lastStatus]
															: "bg-[var(--ret-text-muted)]",
													)}
													aria-hidden
												/>
												<span className="truncate font-mono text-[12px] text-[var(--ret-text)]">
													{cron.name}
												</span>
											</div>
											<ReticleBadge variant={cron.lastStatus ? STATUS_VARIANT[cron.lastStatus] : "default"}>
												{cron.enabled ? cron.lastStatus ?? "idle" : "paused"}
											</ReticleBadge>
										</div>
										<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
											{describeSchedule(cron.schedule)} · UTC
											{cron.lastRunAt
												? ` · last ${new Date(cron.lastRunAt).toLocaleString()}`
												: " · never run"}
										</p>
										<p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
											{cron.prompt}
										</p>
									</ReticleFrame>
								))}
							</div>
						</section>
					);
				})}
			</DashboardPageBody>
		</div>
	);
}

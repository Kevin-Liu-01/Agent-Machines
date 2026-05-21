"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { CronRunDetail, CronRunSummary, CronSummary } from "@/lib/dashboard/types";

type Payload = {
	ok: boolean;
	scheduled: CronSummary[];
	runs: CronRunSummary[];
};

type DetailTab = "trail" | "log" | "diff";

const TRAIL_TONE: Record<CronRunDetail["trail"][number]["status"], string> = {
	ok: "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/5 text-[var(--ret-green)]",
	warn: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 text-[var(--ret-amber)]",
	error: "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 text-[var(--ret-red)]",
	info: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text-dim)]",
};

const LOG_TONE: Record<string, string> = {
	error: "text-[var(--ret-red)]",
	warn: "text-[var(--ret-amber)]",
	info: "text-[var(--ret-text)]",
	debug: "text-[var(--ret-text-muted)]",
};

export function CronPanel() {
	const [data, setData] = useState<Payload | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [detail, setDetail] = useState<CronRunDetail | null>(null);
	const [tab, setTab] = useState<DetailTab>("trail");
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [detailError, setDetailError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/dashboard/crons", { cache: "no-store" })
			.then((r) => r.json())
			.then((json) => setData(json as Payload))
			.catch(() => setData(null));
	}, []);

	const loadDetail = useCallback(async (name: string) => {
		setSelected(name);
		setLoadingDetail(true);
		setDetailError(null);
		setDetail(null);
		try {
			const res = await fetch(`/api/dashboard/crons/${encodeURIComponent(name)}`, {
				cache: "no-store",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(body.message ?? `HTTP ${res.status}`);
			}
			const body = (await res.json()) as { ok: boolean; detail: CronRunDetail };
			setDetail(body.detail);
			setTab("trail");
		} catch (err) {
			setDetailError(err instanceof Error ? err.message : "load failed");
		} finally {
			setLoadingDetail(false);
		}
	}, []);

	if (!data) {
		return (
			<DashboardPageBody>
				<div className="flex items-center gap-2 py-12 text-[11px] text-[var(--ret-text-muted)]">
					<BrailleSpinner /> loading cron registry...
				</div>
			</DashboardPageBody>
		);
	}

	const runs = data.runs.length > 0 ? data.runs : data.scheduled.map((c) => ({
		name: c.name,
		schedule: c.schedule,
		lastRunAt: new Date().toISOString(),
		status: "success" as const,
		costUsd: 0,
		summary: c.prompt,
	}));

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="AUTOMATION"
				title="Cron schedules"
				description="Autonomous agent work — health checks, digests, skill audits. Runs while you sleep."
			/>
			<DashboardPageBody className="space-y-4">
				<div className="grid gap-3 md:grid-cols-2">
					{runs.map((run) => {
						const active = selected === run.name;
						return (
							<button
								key={run.name}
								type="button"
								onClick={() => void loadDetail(run.name)}
								className="text-left"
							>
								<ReticleFrame
									className={cn(
										"p-4 transition-colors",
										active
											? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
											: "hover:bg-[var(--ret-surface)]",
									)}
								>
									<div className="mb-2 flex items-center justify-between gap-2">
										<ReticleLabel>{run.name}</ReticleLabel>
										<div className="flex items-center gap-2">
											<ReticleBadge
												variant={run.status === "success" ? "success" : "default"}
											>
												{run.status}
											</ReticleBadge>
											<span
												aria-hidden="true"
												className={cn(
													"font-mono text-[12px] text-[var(--ret-text-muted)] transition-transform",
													active ? "rotate-90 text-[var(--ret-purple)]" : "",
												)}
											>
												{">"}
											</span>
										</div>
									</div>
									<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
										{run.schedule}
									</p>
									<p className="mt-2 text-[11px] text-[var(--ret-text)]">
										{run.summary}
									</p>
									{"lastRunAt" in run && run.lastRunAt ? (
										<p className="mt-2 text-[10px] text-[var(--ret-text-muted)]">
											Last run {new Date(run.lastRunAt).toLocaleString()}
											{"costUsd" in run && run.costUsd > 0
												? ` · $${run.costUsd.toFixed(2)}`
												: null}
										</p>
									) : null}
								</ReticleFrame>
							</button>
						);
					})}
				</div>

				<ReticleFrame className="overflow-hidden">
					{!selected ? (
						<div className="px-4 py-8 text-center">
							<p className="text-[13px] text-[var(--ret-text-dim)]">
								Select a schedule above to view execution trail, logs, and file diffs.
							</p>
						</div>
					) : loadingDetail ? (
						<div className="flex items-center gap-2 px-4 py-8 text-[11px] text-[var(--ret-text-muted)]">
							<BrailleSpinner /> loading {selected}...
						</div>
					) : detailError ? (
						<div className="px-4 py-6">
							<p className="text-[11px] text-[var(--ret-red)]">{detailError}</p>
							<ReticleButton
								variant="ghost"
								size="sm"
								className="mt-3"
								onClick={() => void loadDetail(selected)}
							>
								Retry
							</ReticleButton>
						</div>
					) : detail ? (
						<CronDetailPanel detail={detail} tab={tab} onTab={setTab} />
					) : null}
				</ReticleFrame>
			</DashboardPageBody>
		</div>
	);
}

function CronDetailPanel({
	detail,
	tab,
	onTab,
}: {
	detail: CronRunDetail;
	tab: DetailTab;
	onTab: (tab: DetailTab) => void;
}) {
	const machineBase = `/dashboard/machines/${detail.machineId}`;

	return (
		<div>
			<header className="border-b border-[var(--ret-border)] px-4 py-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
							Run detail
						</p>
						<h3 className="mt-1 text-[15px] text-[var(--ret-text)]">{detail.name}</h3>
						<p className="mt-1 text-[11px] text-[var(--ret-text-dim)]">{detail.summary}</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<ReticleBadge variant="success">{detail.status}</ReticleBadge>
						<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
							${detail.costUsd.toFixed(2)}
						</span>
					</div>
				</div>
				<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
					<span>
						machine{" "}
						<Link href={machineBase} className="text-[var(--ret-purple)] hover:underline">
							{detail.machineName}
						</Link>
					</span>
					{detail.sessionId ? (
						<span>
							session{" "}
							<Link
								href={`${machineBase}/sessions`}
								className="text-[var(--ret-purple)] hover:underline"
							>
								{detail.sessionId}
							</Link>
						</span>
					) : null}
					{detail.artifactPath ? (
						<span>
							artifact{" "}
							<Link
								href={`${machineBase}/artifacts`}
								className="text-[var(--ret-purple)] hover:underline"
							>
								{detail.artifactPath.split("/").pop()}
							</Link>
						</span>
					) : null}
					<span>{new Date(detail.lastRunAt).toLocaleString()}</span>
				</div>
				<nav className="mt-4 flex gap-1 border-b border-[var(--ret-border)] pb-0">
					{(
						[
							["trail", "Trail"],
							["log", "Log"],
							["diff", "Diff"],
						] as const
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							onClick={() => onTab(id)}
							className={cn(
								"relative px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
								tab === id
									? "text-[var(--ret-purple)]"
									: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
							)}
						>
							{label}
							{tab === id ? (
								<span className="absolute inset-x-0 -bottom-px h-px bg-[var(--ret-purple)]" />
							) : null}
						</button>
					))}
					<div className="ml-auto flex items-center gap-2 pb-2">
						<Link
							href={`${machineBase}/logs`}
							className="text-[10px] uppercase tracking-wider text-[var(--ret-text-muted)] hover:text-[var(--ret-purple)]"
						>
							Machine logs →
						</Link>
					</div>
				</nav>
			</header>

			<div className="px-4 py-4">
				{tab === "trail" ? <TrailView trail={detail.trail} /> : null}
				{tab === "log" ? <LogView logs={detail.logs} /> : null}
				{tab === "diff" ? <DiffView diffs={detail.diffs} /> : null}
			</div>
		</div>
	);
}

function TrailView({ trail }: { trail: CronRunDetail["trail"] }) {
	return (
		<ol className="relative ml-2 border-l border-[var(--ret-border)]">
			{trail.map((step, i) => (
				<li key={`${step.at}-${step.phase}`} className="relative pb-5 pl-6 last:pb-0">
					<span
						className={cn(
							"absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2",
							i === trail.length - 1
								? "border-[var(--ret-green)] bg-[var(--ret-green)]"
								: "border-[var(--ret-border)] bg-[var(--ret-bg)]",
						)}
					/>
					<div
						className={cn(
							"border px-3 py-2",
							TRAIL_TONE[step.status],
						)}
					>
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<span className="font-mono text-[10px] uppercase tracking-[0.18em]">
								{step.phase}
							</span>
							<span className="font-mono text-[9px] opacity-70">
								{new Date(step.at).toLocaleTimeString()}
							</span>
						</div>
						<p className="mt-1 text-[12px]">{step.detail}</p>
					</div>
				</li>
			))}
		</ol>
	);
}

function LogView({ logs }: { logs: CronRunDetail["logs"] }) {
	return (
		<pre className="max-h-[420px] overflow-auto border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3 font-mono text-[10px] leading-relaxed">
			{logs.map((line, i) => (
				<div key={`${line.at}-${i}`} className="flex gap-3">
					<span className="shrink-0 text-[var(--ret-text-muted)]">
						{line.at ? new Date(line.at).toISOString().slice(11, 23) : "—"}
					</span>
					<span className={cn("shrink-0 uppercase", LOG_TONE[line.level] ?? "text-[var(--ret-text-dim)]")}>
						{line.level.padEnd(5)}
					</span>
					<span className="text-[var(--ret-text-dim)]">{line.message}</span>
				</div>
			))}
		</pre>
	);
}

function DiffView({ diffs }: { diffs: CronRunDetail["diffs"] }) {
	if (diffs.length === 0) {
		return (
			<p className="py-6 text-center text-[12px] text-[var(--ret-text-muted)]">
				No file changes recorded for this run.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			{diffs.map((hunk) => (
				<div key={hunk.file}>
					<p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{hunk.file}
					</p>
					<pre className="max-h-80 overflow-auto border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3 font-mono text-[10px] leading-relaxed">
						{hunk.patch.split("\n").map((line, i) => (
							<div
								key={`${hunk.file}-${i}`}
								className={cn(
									line.startsWith("+") && !line.startsWith("+++")
										? "bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
										: line.startsWith("-") && !line.startsWith("---")
											? "bg-[var(--ret-red)]/10 text-[var(--ret-red)]"
											: line.startsWith("@@")
												? "text-[var(--ret-purple)]"
												: "text-[var(--ret-text-dim)]",
								)}
							>
								{line || " "}
							</div>
						))}
					</pre>
				</div>
			))}
		</div>
	);
}

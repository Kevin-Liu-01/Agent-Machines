"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { CATEGORY_LABELS } from "@/lib/benchmarks/constants";
import type { BenchmarkRun, BenchmarkSnapshot } from "@/lib/benchmarks/types";
import {
	applyRunToSnapshot,
	buildBenchmarksView,
	isBenchmarkSnapshot,
	type BenchmarksView,
} from "@/lib/dashboard/benchmarks-view";
import { cn } from "@/lib/cn";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

import { BenchmarkComparisonBars } from "./BenchmarkComparisonBars";
import { BenchmarkLeaderboard } from "./BenchmarkLeaderboard";
import { CapabilityMatrix } from "./CapabilityMatrix";
import { MethodologyPanel } from "./MethodologyPanel";
import { PricingMatrix } from "./PricingMatrix";
import { ScoreRanking } from "./ScoreRanking";

type RunMode = "demo" | "live";

export function BenchmarksClient() {
	const [snapshot, setSnapshot] = useState<BenchmarkSnapshot | null>(null);
	const [view, setView] = useState<BenchmarksView | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [running, setRunning] = useState<RunMode | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/dashboard/benchmarks", { cache: "no-store" });
			if (!res.ok) {
				setError(`HTTP ${res.status}`);
				return;
			}
			const json: unknown = await res.json();
			if (!isBenchmarkSnapshot(json)) {
				setError("Invalid benchmark payload");
				return;
			}
			setSnapshot(json);
			setView(buildBenchmarksView(json));
			setError(null);
		} catch {
			setError("Failed to load benchmarks");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const runBenchmark = useCallback(
		async (mode: RunMode) => {
			if (
				mode === "live" &&
				!window.confirm(
					"A live run provisions AND destroys real machines on every provider you have credentials for, and spends real credits. It can take several minutes. Continue?",
				)
			) {
				return;
			}
			setRunning(mode);
			setNotice(null);
			try {
				const res = await fetch("/api/dashboard/benchmarks/run", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ mode, providers: view?.providers }),
				});
				const json: {
					ok?: boolean;
					message?: string;
					error?: string;
					run?: BenchmarkRun;
					stored?: number;
				} = await res.json();
				if (!res.ok || !json.ok) {
					setNotice(json.message ?? json.error ?? `Run failed (HTTP ${res.status})`);
				} else {
					// Reflect the run immediately (works even if Supabase isn't
					// provisioned); then reload to pick up the persisted copy.
					if (json.run && snapshot) {
						const merged = applyRunToSnapshot(snapshot, json.run);
						setSnapshot(merged);
						setView(buildBenchmarksView(merged));
					}
					const persisted = json.stored ? "" : " (not persisted, apply migration 003)";
					setNotice(
						mode === "demo"
							? `Demo data populated${persisted}.`
							: `Live run complete${persisted}.`,
					);
					if (json.stored) await load();
				}
			} catch {
				setNotice("Run request failed.");
			} finally {
				setRunning(null);
			}
		},
		[load, snapshot, view?.providers],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="BENCHMARKS"
				title="Substrate benchmarks"
				description="Apples-to-apples comparison across every substrate provider: boot, resume, exec, compute, I/O, and a composite responsiveness score, all driven through the same MachineProvider contract."
				right={
					<RunControls running={running} onRun={runBenchmark} />
				}
			/>
			<DashboardPageBody>
				{error ? (
					<Banner tone="error">error: {error}</Banner>
				) : null}
				{notice ? <Banner tone="info">{notice}</Banner> : null}

				{loading && !view ? (
					<LoadingState />
				) : view ? (
					<>
						<SourceBanner view={view} />

						<BenchmarkLeaderboard
							leaderboard={view.leaderboard}
							scores={view.scores}
						/>

						<Panel header="Responsiveness ranking">
							<ScoreRanking scores={view.scores} />
						</Panel>

						{view.comparisonsByCategory.map((group) => (
							<Panel
								key={group.category}
								header={CATEGORY_LABELS[group.category]}
							>
								<div className="divide-y divide-[var(--ret-border)]">
									{group.comparisons.map((cmp) => (
										<BenchmarkComparisonBars key={cmp.id} comparison={cmp} />
									))}
								</div>
							</Panel>
						))}

						<Panel header="Capability matrix">
							<CapabilityMatrix profiles={view.profiles} />
						</Panel>

						<Panel header="Pricing">
							<PricingMatrix profiles={view.profiles} />
						</Panel>

						<Panel header="Methodology & sources">
							<MethodologyPanel
								methodology={view.methodology}
								profiles={view.profiles}
							/>
						</Panel>
					</>
				) : null}
			</DashboardPageBody>
		</div>
	);
}

function RunControls({
	running,
	onRun,
}: {
	running: RunMode | null;
	onRun: (mode: RunMode) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				disabled={running !== null}
				onClick={() => onRun("demo")}
				className={cn(
					"border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2.5 py-1.5 font-mono text-[11px] transition-colors",
					"text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
			>
				{running === "demo" ? "running…" : "Demo data"}
			</button>
			<button
				type="button"
				disabled={running !== null}
				onClick={() => onRun("live")}
				className={cn(
					"border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
					"text-[var(--ret-purple)] hover:border-[var(--ret-purple)]/70",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
				title="Provisions + destroys real machines and spends real credits"
			>
				{running === "live" ? "running…" : "Run live"}
			</button>
		</div>
	);
}

function SourceBanner({ view }: { view: BenchmarksView }) {
	const meta = view.runMeta;
	if (!meta) {
		return (
			<Banner tone="warn">
				Showing cited reference + capability data. No measured run yet, so click{" "}
				<strong>Demo data</strong> for synthetic numbers, or run{" "}
				<code className="font-mono">npm run benchmark -- --yes</code> for
				measured data.
			</Banner>
		);
	}
	if (meta.source === "demo") {
		return (
			<Banner tone="info">
				Synthetic <strong>demo</strong> data ({fmtTime(meta.finishedAt)}). Not a
				measurement, so run a live benchmark for real numbers.
			</Banner>
		);
	}
	return (
		<Banner tone="ok">
			Measured run · {fmtTime(meta.finishedAt)}
			{meta.region ? ` · ${meta.region}` : ""} · {meta.iterations} exec iters ·
			run <span className="font-mono">{meta.runId.slice(0, 8)}</span>
		</Banner>
	);
}

const BANNER_TONE: Record<string, string> = {
	error: "border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 text-[var(--ret-red)]",
	warn: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 text-[var(--ret-text-dim)]",
	info: "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-text-dim)]",
	ok: "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/5 text-[var(--ret-text-dim)]",
};

function Banner({
	tone,
	children,
}: {
	tone: "error" | "warn" | "info" | "ok";
	children: ReactNode;
}) {
	return (
		<div className={cn("border px-3 py-2 text-[11.5px] leading-relaxed", BANNER_TONE[tone])}>
			{children}
		</div>
	);
}

function Panel({ header, children }: { header: string; children: ReactNode }) {
	return (
		<section className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<div className="border-b border-[var(--ret-border)] px-4 py-3">
				<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{header}
				</h2>
			</div>
			{children}
		</section>
	);
}

function LoadingState() {
	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-[104px]" />
				))}
			</div>
			<Skeleton className="h-[160px]" />
			<Skeleton className="h-[240px]" />
		</div>
	);
}

function fmtTime(iso: string): string {
	try {
		return new Date(iso).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

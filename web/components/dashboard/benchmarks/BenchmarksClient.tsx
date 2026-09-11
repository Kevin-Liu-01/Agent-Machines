"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Gauge, History, Layers, Play, RefreshCcw, Route, Server, Terminal } from "@/components/ui/icons";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type { BenchmarkRun, BenchmarkSnapshot } from "@/lib/benchmarks/types";
import { applyRunToSnapshot, buildBenchmarksView, isBenchmarkSnapshot, type BenchmarksView } from "@/lib/dashboard/benchmarks-view";
import { BenchmarkLeaderboard } from "./BenchmarkLeaderboard";
import { CapabilityMatrix } from "./CapabilityMatrix";
import { ComparisonExplorer } from "./ComparisonExplorer";
import { MethodologyPanel } from "./MethodologyPanel";
import { PricingMatrix } from "./PricingMatrix";
import { ScoreRanking } from "./ScoreRanking";
import { BENCHMARK_BUTTON, BENCHMARK_CONTROL, BENCHMARK_SELECT, BenchmarkNotice, BenchmarkPanel, SourceTag } from "./BenchmarkUi";

type RunMode = "demo" | "live";
type Recommendation = { runtime: string; substrate: string; model: string; routerId: string | null; samples?: number; meanSuccess?: number };
type Notice = { text: string; error?: boolean };

export function BenchmarksClient({ embedded = false }: { embedded?: boolean } = {}) {
	const [snapshot, setSnapshot] = useState<BenchmarkSnapshot | null>(null);
	const [selectedRun, setSelectedRun] = useState("latest");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [running, setRunning] = useState<RunMode | null>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
	const [recommendationState, setRecommendationState] = useState<"loading" | "ready" | "unavailable">("loading");
	const requestId = useRef(0);
	const runPending = useRef(false);
	const loadPending = useRef(false);
	const view = useMemo(() => {
		if (!snapshot) return null;
		const run = selectedRun === "latest" ? snapshot.latest : snapshot.history.find((entry) => entry.runId === selectedRun) ?? snapshot.latest;
		return buildBenchmarksView({ ...snapshot, latest: run });
	}, [snapshot, selectedRun]);

	const load = useCallback(async (intent?: "after-run") => {
		if (runPending.current && intent !== "after-run") return;
		const id = ++requestId.current;
		loadPending.current = true;
		setLoading(true);
		try {
			const res = await fetch("/api/dashboard/benchmarks", { cache: "no-store" });
			if (!res.ok) throw new Error(res.status === 401 ? "Sign in to load your benchmark results." : "Benchmark results could not be loaded. Please try again.");
			const json: unknown = await res.json();
			if (!isBenchmarkSnapshot(json) || !Array.isArray(json.history) || typeof json.generatedAt !== "string") throw new Error("The benchmark response was incomplete. Please try again.");
			buildBenchmarksView(json);
			if (id !== requestId.current) return;
			setSnapshot(json);
			setError(null);
		} catch (cause) {
			const message = cause instanceof Error && /^(Benchmark|Sign in|The benchmark)/.test(cause.message)
				? cause.message : "Benchmark results could not be loaded. Please try again.";
			if (id === requestId.current) setError(message);
		} finally {
			if (id === requestId.current) {
				loadPending.current = false;
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => { void load(); return () => { requestId.current += 1; }; }, [load]);
	useEffect(() => {
		let stopped = false;
		fetch("/api/dashboard/admin/route-recommendation", { cache: "no-store" }).then(async (res) => {
			if (!res.ok) throw new Error("unavailable");
			const payload = await res.json();
			if (stopped) return;
			const value = payload?.recommended;
			if (value && (typeof value.runtime !== "string" || typeof value.substrate !== "string" || typeof value.model !== "string")) throw new Error("invalid");
			setRecommendation(value ? { ...value, samples: payload.samples, meanSuccess: payload.meanSuccess } : null);
			setRecommendationState("ready");
		}).catch(() => { if (!stopped) setRecommendationState("unavailable"); });
		return () => { stopped = true; };
	}, []);

	const runBenchmark = useCallback(async (mode: RunMode) => {
		if (runPending.current || loadPending.current || !snapshot || loading || error) return;
		if (mode === "live" && !window.confirm("Run a paid benchmark? This creates and destroys disposable machines on every supported provider with saved credentials. It spends provider credits and may take several minutes. Existing Worker machines are not the target. Continue?")) return;
		runPending.current = true;
		setRunning(mode);
		setNotice(null);
		try {
			const res = await fetch("/api/dashboard/benchmarks/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, providers: snapshot.profiles.map((profile) => profile.provider) }) });
			const json = await res.json();
			if (!res.ok || !json.ok) {
				setNotice({ error: true, text: json.error === "no_credentials" ? "No provider credentials are available. Connect a provider in Settings before running a paid benchmark." : "The benchmark request did not complete successfully. Refresh results before trying again." });
				return;
			}
			if (!isCompletedRun(json.run, mode)) throw new Error("Incomplete run response");
			const merged = applyRunToSnapshot(snapshot, json.run);
			buildBenchmarksView(merged);
			setSnapshot(merged);
			setSelectedRun("latest");
			const failed = json.run.providers.filter((provider: { ok: boolean }) => !provider.ok).length;
			const skipped = Array.isArray(json.skipped) ? json.skipped.length : 0;
			setNotice({ text: `${mode === "demo" ? "Synthetic demo results are ready. No provider credits were used." : "Benchmark run returned. Check each provider’s results; completion does not mean every probe succeeded."}${failed ? ` ${failed} provider result(s) contain failed or unsupported probes.` : ""}${skipped ? ` ${skipped} provider(s) were skipped.` : ""}${json.stored > 0 ? " Saved to run history." : " Results are shown for this session only; benchmark storage is not available."}` });
			if (json.stored > 0) await load("after-run");
		} catch {
			setNotice({ error: true, text: mode === "demo"
				? "The demo response could not be confirmed. Refresh results before retrying. Demo mode does not use provider credits."
				: "The response could not be confirmed. A requested run may still have created resources or incurred charges. Refresh results and check your provider before retrying." });
		} finally {
			runPending.current = false;
			setRunning(null);
		}
	}, [snapshot, loading, error, load]);

	return <div className={cn("min-w-0")}>
		{!embedded ? <PageHeader kicker="Benchmarks" title="Find the right compute." description="Compare provider performance, capabilities, and reference pricing. Understand the evidence behind each number before choosing where to run." right={<RunControls running={running} disabled={loading || Boolean(error) || !snapshot} onRun={runBenchmark} onRefresh={() => void load()} />} /> : null}
		<DashboardPageBody>
			{embedded ? <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Provider comparison</h2><RunControls running={running} disabled={loading || Boolean(error) || !snapshot} onRun={runBenchmark} onRefresh={() => void load()} /></div> : null}
			{error ? <BenchmarkNotice error><div className={cn("flex flex-wrap items-center justify-between gap-3")}><span>{error}{view ? " The previous dataset is still shown below." : ""}</span><button type="button" onClick={() => void load()} disabled={loading || running !== null} className={BENCHMARK_BUTTON}><RefreshCcw size={15} aria-hidden="true" />{loading ? "Retrying…" : "Try again"}</button></div></BenchmarkNotice> : null}
			{notice ? <BenchmarkNotice error={notice.error}>{notice.text}</BenchmarkNotice> : null}
			{running ? <BenchmarkNotice>{running === "live" ? "Benchmark in progress. Creating, testing, and cleaning up disposable machines can take several minutes. Avoid starting another run." : "Preparing synthetic demo results…"}</BenchmarkNotice> : null}
			{loading && !view ? <LoadingState /> : view ? <>
				<div className={cn("flex flex-wrap items-center justify-between gap-4")}><nav aria-label="Benchmark sections" className={cn("flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--ret-text-dim)]")}>{[["comparison", "Performance"], ["capabilities", "Capabilities"], ["pricing", "Pricing"], ["methodology", "Methodology"]].map(([id, label]) => <a key={id} href={`#${id}`} className={cn("inline-flex min-h-10 items-center hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>{label}</a>)}</nav>{snapshot && snapshot.history.length > 0 ? <label htmlFor="benchmark-dataset" className={cn("flex min-w-0 items-center gap-2 text-sm text-[var(--ret-text-dim)]")}><History size={16} aria-hidden="true" /><span className={cn("sr-only")}>Dataset</span><select id="benchmark-dataset" value={selectedRun} onChange={(event) => setSelectedRun(event.target.value)} className={cn(BENCHMARK_SELECT, "max-w-[260px]")}><option value="latest">Latest dataset</option>{snapshot.history.map((run) => <option key={run.runId} value={run.runId}>{formatBenchmarkTime(run.finishedAt)} · {run.source}</option>)}</select></label> : null}</div>
				<SourceBanner view={view} refreshing={loading} />
				<BenchmarkLeaderboard leaderboard={view.leaderboard} scores={view.scores} scoreSource={view.runMeta?.source ?? null} />
				<ComparisonExplorer view={view} />
				<BenchmarkPanel title="Responsiveness score" description="A relative summary of the latency metrics available in this dataset—not a universal provider ranking." icon={Gauge}><ScoreRanking scores={view.scores} source={view.runMeta?.source ?? null} /></BenchmarkPanel>
				<BenchmarkPanel id="capabilities" title="Provider capabilities" description="Published capability profiles. Availability and allocation can vary by account, plan, and runtime." icon={Server}><CapabilityMatrix profiles={view.profiles} /></BenchmarkPanel>
				<BenchmarkPanel id="pricing" title="Reference pricing" description="Saved reference rates, not a live quote or your invoice. Check the provider’s current terms before spending." icon={Layers}><PricingMatrix profiles={view.profiles} /></BenchmarkPanel>
				<LearningPanel recommendation={recommendation} state={recommendationState} />
				<BenchmarkPanel id="methodology" title="Methodology and sources" description="See how each metric is collected and where published claims come from." icon={BookOpen}><MethodologyPanel methodology={view.methodology} profiles={view.profiles} /></BenchmarkPanel>
			</> : !loading && !error ? <BenchmarkNotice>No benchmark dataset is available. Refresh to load the reference profiles.</BenchmarkNotice> : null}
		</DashboardPageBody>
	</div>;
}

export function isCompletedRun(value: unknown, mode: RunMode): value is BenchmarkRun {
	if (!value || typeof value !== "object") return false;
	const run = value as Partial<BenchmarkRun>;
	return typeof run.runId === "string" && run.runId.length > 0 && typeof run.finishedAt === "string" && Number.isFinite(Date.parse(run.finishedAt)) && run.source === (mode === "demo" ? "demo" : "measured") && Array.isArray(run.providers) && run.providers.length > 0 && run.providers.every((provider) => provider && typeof provider.provider === "string" && typeof provider.ok === "boolean" && provider.metrics && typeof provider.metrics === "object");
}

function RunControls({ running, disabled, onRun, onRefresh }: { running: RunMode | null; disabled: boolean; onRun: (mode: RunMode) => void; onRefresh: () => void }) {
	return <div className={cn("flex flex-wrap items-center gap-2")}><button type="button" disabled={disabled || running !== null} onClick={onRefresh} aria-label="Refresh benchmark results" className={BENCHMARK_BUTTON}><RefreshCcw size={16} aria-hidden="true" /></button><button type="button" disabled={disabled || running !== null} onClick={() => onRun("demo")} className={BENCHMARK_BUTTON}><Terminal size={16} aria-hidden="true" />{running === "demo" ? "Preparing…" : "Try demo data"}</button><button type="button" disabled={disabled || running !== null} onClick={() => onRun("live")} className={cn(BENCHMARK_CONTROL, "border-[var(--ret-text)] bg-[var(--ret-text)] text-[var(--ret-bg)] hover:opacity-85")}><Play size={15} aria-hidden="true" />{running === "live" ? "Running…" : "Run benchmark"}</button></div>;
}

function SourceBanner({ view, refreshing }: { view: BenchmarksView; refreshing: boolean }) {
	const meta = view.runMeta;
	return <div className={cn("rounded-lg border border-[var(--ret-border)]/50 bg-[var(--ret-bg-soft)]/20 px-5 py-4 sm:px-6")}><div className={cn("flex flex-wrap items-center gap-3")}><SourceTag source={meta?.source ?? "reference"} /><span className={cn("text-sm font-medium text-[var(--ret-text)]")}>{!meta || meta.source === "reference" ? "Published reference dataset" : meta.source === "demo" ? "Synthetic results · not measurements" : "Recorded benchmark run"}</span>{refreshing ? <span role="status" className={cn("text-xs text-[var(--ret-text-muted)]")}>Refreshing…</span> : null}</div><p className={cn("mt-2 text-sm leading-6 text-[var(--ret-text-dim)]")}>{meta ? `${formatBenchmarkTime(meta.finishedAt)}${meta.region ? ` · ${meta.region}` : ""} · ${meta.iterations} command iterations · Run ${meta.runId.slice(0, 8)}.` : `Reference snapshot: ${formatBenchmarkTime(view.generatedAt)}. No measured run is available.`} Timing varies with region, allocation, and provider behavior.</p></div>;
}

function LearningPanel({ recommendation, state }: { recommendation: Recommendation | null; state: "loading" | "ready" | "unavailable" }) {
	return <BenchmarkPanel id="learning" title="Routing insights" description="An optional learned recommendation from recorded run outcomes. This is separate from the benchmark comparison above." icon={Route}><div className={cn("px-5 py-5 sm:px-6")}>{recommendation ? <dl className={cn("grid gap-5 sm:grid-cols-3")}><LearningCell label="Suggested combination" value={`${recommendation.substrate} / ${recommendation.runtime}`} detail={recommendation.model} /><LearningCell label="Recorded traces" value={typeof recommendation.samples === "number" && Number.isFinite(recommendation.samples) ? recommendation.samples.toLocaleString() : "Unavailable"} detail="Used by the recommendation" /><LearningCell label="Mean success" value={typeof recommendation.meanSuccess === "number" && Number.isFinite(recommendation.meanSuccess) ? `${Math.round(recommendation.meanSuccess * 100)}%` : "Unavailable"} detail={recommendation.routerId ?? "Native model connection"} /></dl> : <p className={cn("text-sm leading-6 text-[var(--ret-text-dim)]")}>{state === "loading" ? "Checking for an available routing recommendation…" : state === "unavailable" ? "Routing insights are not available to this account or the service could not be reached. No recommendation or trace count is assumed." : "No routing recommendation has been recorded yet. Benchmark comparisons remain available above."}</p>}</div></BenchmarkPanel>;
}

function LearningCell({ label, value, detail }: { label: string; value: string; detail: string }) {
	return <div className={cn("min-w-0")}><dt className={cn("text-xs text-[var(--ret-text-muted)]")}>{label}</dt><dd className={cn("mt-2 break-words text-lg font-medium text-[var(--ret-text)]")}>{value}</dd><dd className={cn("mt-1 break-words text-sm text-[var(--ret-text-dim)]")}>{detail}</dd></div>;
}

function LoadingState() {
	return <div role="status" aria-label="Loading benchmark results" className={cn("space-y-5")}><span className={cn("sr-only")}>Loading benchmark results…</span><Skeleton className={cn("h-24 rounded-lg")} /><div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4")}>{[0, 1, 2, 3].map((index) => <Skeleton key={index} className={cn("h-32 rounded-lg")} />)}</div><Skeleton className={cn("h-96 rounded-lg")} /></div>;
}

export function formatBenchmarkTime(iso: string): string {
	const date = new Date(iso);
	return Number.isFinite(date.getTime()) ? `${date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC` : "Date unavailable";
}

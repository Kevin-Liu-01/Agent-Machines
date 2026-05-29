/**
 * Benchmark persistence + assembly.
 *
 * Two read paths feed the UI:
 *   1. The committed reference seed (`web/data/benchmarks.json`) — cited
 *      capability/pricing/published-latency facts, always available.
 *   2. Measured/demo runs in Supabase (`provider_benchmarks`) — produced
 *      by the harness, layered on top of the seed when present.
 *
 * `assembleSnapshot` merges the two so the page always renders something
 * useful and clearly marks whether the numbers are measured or reference.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { supabaseAdmin } from "@/lib/supabase/client";
import type { ProviderKind } from "@/lib/user-config/schema";

import seedJson from "@/data/benchmarks.json";
import type {
	BenchmarkRun,
	BenchmarkSnapshot,
	ProbeResult,
	ProviderBenchmark,
	ProviderProfile,
} from "./types";

const SEED = seedJson as unknown as BenchmarkSnapshot;

export function supabaseConfigured(): boolean {
	return Boolean(
		process.env.NEXT_PUBLIC_SUPABASE_URL &&
			(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY),
	);
}

/** The reference seed: profiles + methodology, no measured runs. */
export function loadSeedSnapshot(): BenchmarkSnapshot {
	return {
		...SEED,
		latest: SEED.latest ?? null,
		history: SEED.history ?? [],
	};
}

export function seedProfiles(): ProviderProfile[] {
	return SEED.profiles;
}

type BenchmarkRow = {
	run_id: string;
	provider_kind: string;
	source: string;
	ok: boolean;
	error: string | null;
	region: string | null;
	host: string | null;
	spec: ProviderBenchmark["spec"];
	metrics: Partial<Record<string, ProbeResult>>;
	score: number | null;
	iterations: number;
	duration_ms: number;
	started_at: string;
	finished_at: string;
};

export function runToRows(run: BenchmarkRun): BenchmarkRow[] {
	return run.providers.map((p) => ({
		run_id: run.runId,
		provider_kind: p.provider,
		source: p.source,
		ok: p.ok,
		error: p.error,
		region: run.region,
		host: run.host,
		spec: p.spec,
		metrics: p.metrics,
		score: p.score,
		iterations: p.iterations,
		duration_ms: p.durationMs,
		started_at: p.startedAt,
		finished_at: p.finishedAt,
	}));
}

/** Persist a run's per-provider rows. Returns the count inserted. */
export async function storeRun(run: BenchmarkRun): Promise<number> {
	const rows = runToRows(run);
	if (rows.length === 0) return 0;
	const { error } = await supabaseAdmin().from("provider_benchmarks").insert(rows);
	if (error) throw new Error(`store benchmark run failed: ${error.message}`);
	return rows.length;
}

function rowToProviderBenchmark(row: BenchmarkRow): ProviderBenchmark {
	const started = new Date(row.started_at).getTime();
	const finished = new Date(row.finished_at).getTime();
	return {
		provider: row.provider_kind as ProviderKind,
		source: (row.source as ProviderBenchmark["source"]) ?? "measured",
		ok: row.ok,
		error: row.error,
		spec: row.spec,
		machineId: null,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		durationMs: row.duration_ms || Math.max(0, finished - started),
		iterations: row.iterations,
		metrics: row.metrics as ProviderBenchmark["metrics"],
		score: row.score,
	};
}

/**
 * Read recent benchmark rows from Supabase and reassemble them into runs
 * keyed by `run_id`, newest first. `limit` bounds how many rows we pull.
 */
export async function readRecentRuns(limit = 200): Promise<BenchmarkRun[]> {
	const { data, error } = await supabaseAdmin()
		.from("provider_benchmarks")
		.select(
			"run_id, provider_kind, source, ok, error, region, host, spec, metrics, score, iterations, duration_ms, started_at, finished_at",
		)
		.order("finished_at", { ascending: false })
		.limit(limit);
	if (error) throw new Error(`read benchmark runs failed: ${error.message}`);

	const byRun = new Map<string, BenchmarkRow[]>();
	const order: string[] = [];
	for (const row of (data ?? []) as BenchmarkRow[]) {
		if (!byRun.has(row.run_id)) {
			byRun.set(row.run_id, []);
			order.push(row.run_id);
		}
		byRun.get(row.run_id)!.push(row);
	}

	return order.map((runId) => {
		const rows = byRun.get(runId)!;
		const finishedTimes = rows.map((r) => r.finished_at).sort();
		const startedTimes = rows.map((r) => r.started_at).sort();
		return {
			runId,
			source: (rows[0].source as BenchmarkRun["source"]) ?? "measured",
			startedAt: startedTimes[0],
			finishedAt: finishedTimes[finishedTimes.length - 1],
			region: rows[0].region,
			host: rows[0].host,
			providers: rows.map(rowToProviderBenchmark),
		};
	});
}

/**
 * Merge the reference seed with measured runs. The newest run becomes
 * `latest`; older ones go to `history`. Profiles/methodology always come
 * from the seed (they're the cited facts).
 */
export function assembleSnapshot(
	runs: BenchmarkRun[],
): BenchmarkSnapshot {
	const seed = loadSeedSnapshot();
	if (runs.length === 0) return seed;

	const [latest, ...history] = runs;
	const hasMeasured = runs.some((r) =>
		r.providers.some((p) => p.source === "measured" || p.source === "demo"),
	);

	return {
		...seed,
		generatedAt: latest.finishedAt,
		hasMeasuredData: hasMeasured,
		latest,
		history: history.slice(0, 10),
	};
}

/* --------------------------------------------------------------------- */
/* Local file persistence (works without Supabase)                       */
/* --------------------------------------------------------------------- */

/**
 * Run files live in `<web>/.benchmarks` (gitignored). The CLI writes here
 * and the dashboard reads here when Supabase has no rows — so a local
 * `npm run benchmark` shows up on the page even before migration 003 is
 * applied. `baseDir` differs by caller: the CLI runs from the repo root
 * and passes the web dir; the Next server's cwd is already the web dir.
 */
function localDir(baseDir: string): string {
	return join(baseDir, ".benchmarks");
}

function isBenchmarkRun(value: unknown): value is BenchmarkRun {
	if (!value || typeof value !== "object") return false;
	const o = value as Record<string, unknown>;
	return typeof o.runId === "string" && Array.isArray(o.providers);
}

export function writeLocalRun(run: BenchmarkRun, baseDir: string): string {
	const dir = localDir(baseDir);
	mkdirSync(dir, { recursive: true });
	const stamped = join(dir, `run-${run.runId}.json`);
	const payload = JSON.stringify(run, null, 2);
	writeFileSync(join(dir, "latest-run.json"), payload);
	writeFileSync(stamped, payload);
	return stamped;
}

export function readLocalRuns(baseDir: string = process.cwd()): BenchmarkRun[] {
	try {
		const dir = localDir(baseDir);
		if (!existsSync(dir)) return [];
		const files = readdirSync(dir).filter(
			(f) => f.endsWith(".json") && f !== "latest-run.json",
		);
		const runs: BenchmarkRun[] = [];
		for (const f of files) {
			try {
				const parsed = JSON.parse(readFileSync(join(dir, f), "utf8"));
				if (isBenchmarkRun(parsed)) runs.push(parsed);
			} catch {
				// skip unparseable / partial files
			}
		}
		return runs.sort((a, b) => (b.finishedAt > a.finishedAt ? 1 : -1));
	} catch {
		return [];
	}
}

function dedupeRuns(runs: BenchmarkRun[]): BenchmarkRun[] {
	const seen = new Set<string>();
	const out: BenchmarkRun[] = [];
	for (const r of [...runs].sort((a, b) => (b.finishedAt > a.finishedAt ? 1 : -1))) {
		if (seen.has(r.runId)) continue;
		seen.add(r.runId);
		out.push(r);
	}
	return out;
}

/**
 * Top-level read used by the API. Merges measured runs from Supabase
 * (when configured) and local files; falls back to the cited seed when
 * neither has anything.
 */
export async function getSnapshot(): Promise<BenchmarkSnapshot> {
	const supabaseRuns = supabaseConfigured()
		? await readRecentRuns().catch(() => [])
		: [];
	const localRuns = readLocalRuns();
	const merged = dedupeRuns([...supabaseRuns, ...localRuns]);
	if (merged.length === 0) return loadSeedSnapshot();
	return assembleSnapshot(merged);
}

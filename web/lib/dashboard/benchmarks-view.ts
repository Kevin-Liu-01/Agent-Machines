/**
 * Benchmark view model.
 *
 * Turns a `BenchmarkSnapshot` (reference seed merged with measured runs)
 * into the exact shapes the dashboard renders: per-metric provider
 * comparisons grouped by category, a winners leaderboard, and the
 * composite-score ranking. Pure + defensive so the UI never reads
 * `undefined.value` on a partial payload.
 */

import {
	CATEGORY_ORDER,
	METRIC_DEFINITIONS,
	METRIC_BY_ID,
	PROVIDER_HUE,
} from "@/lib/benchmarks/constants";
import type {
	BenchmarkMetricId,
	BenchmarkRun,
	BenchmarkSnapshot,
	BenchmarkSource,
	MetricCategory,
	MetricDefinition,
	ProviderBenchmark,
	ProviderProfile,
} from "@/lib/benchmarks/types";

/**
 * Pure client-side merge of a fresh run into a snapshot — used to reflect
 * a demo/live run immediately without waiting on a Supabase round-trip
 * (and to make the feature work at all when the table isn't provisioned).
 * Mirrors the server's `assembleSnapshot` but without any store imports.
 */
export function applyRunToSnapshot(
	snapshot: BenchmarkSnapshot,
	run: BenchmarkRun,
): BenchmarkSnapshot {
	const hasMeasured = run.providers.some((p) => p.source !== "reference");
	const history = snapshot.latest
		? [snapshot.latest, ...snapshot.history].slice(0, 10)
		: snapshot.history;
	return {
		...snapshot,
		generatedAt: run.finishedAt,
		hasMeasuredData: snapshot.hasMeasuredData || hasMeasured,
		latest: run,
		history,
	};
}
import type { ProviderKind } from "@/lib/user-config/schema";

export type MetricValueSource = "measured" | "demo" | "reference" | null;

export type ProviderMetricCell = {
	provider: ProviderKind;
	label: string;
	hue: string;
	value: number | null;
	/** p95 companion (exec metrics only), when measured. */
	p95: number | null;
	source: MetricValueSource;
	successRate: number | null;
	isWinner: boolean;
};

export type MetricComparison = {
	id: BenchmarkMetricId;
	def: MetricDefinition;
	cells: ProviderMetricCell[];
	winner: ProviderKind | null;
};

export type ScoreEntry = {
	provider: ProviderKind;
	label: string;
	hue: string;
	score: number | null;
};

export type LeaderboardEntry = {
	id: BenchmarkMetricId;
	label: string;
	unit: MetricDefinition["unit"];
	winner: ProviderKind | null;
	winnerLabel: string | null;
	hue: string | null;
	value: number | null;
	source: MetricValueSource;
};

export type RunMeta = {
	runId: string;
	finishedAt: string;
	region: string | null;
	iterations: number;
	source: BenchmarkSource;
};

export type BenchmarksView = {
	generatedAt: string;
	hasMeasuredData: boolean;
	methodology: string;
	profiles: ProviderProfile[];
	providers: ProviderKind[];
	comparisonsByCategory: Array<{
		category: MetricCategory;
		comparisons: MetricComparison[];
	}>;
	scores: ScoreEntry[];
	leaderboard: LeaderboardEntry[];
	runMeta: RunMeta | null;
};

const LEADERBOARD_METRICS: BenchmarkMetricId[] = [
	"coldBootMs",
	"wakeMs",
	"execP50Ms",
];

function profileFor(
	snapshot: BenchmarkSnapshot,
	provider: ProviderKind,
): ProviderProfile | undefined {
	return snapshot.profiles.find((p) => p.provider === provider);
}

function benchFor(
	run: BenchmarkRun | null,
	provider: ProviderKind,
): ProviderBenchmark | undefined {
	return run?.providers.find((p) => p.provider === provider);
}

function measuredValue(
	bench: ProviderBenchmark | undefined,
	id: BenchmarkMetricId,
): { value: number | null; successRate: number | null } {
	const stats = bench?.metrics[id]?.stats;
	if (!stats) return { value: null, successRate: null };
	return { value: stats.value, successRate: stats.successRate };
}

/** Resolve the cell value for a provider+metric: measured first, else reference. */
function resolveCell(
	snapshot: BenchmarkSnapshot,
	provider: ProviderKind,
	id: BenchmarkMetricId,
): Omit<ProviderMetricCell, "isWinner"> {
	const profile = profileFor(snapshot, provider);
	const label = profile?.label ?? provider;
	const hue = profile?.hue ?? PROVIDER_HUE[provider];

	const bench = benchFor(snapshot.latest, provider);
	const measured = measuredValue(bench, id);
	if (measured.value !== null) {
		const p95 =
			id === "execP50Ms"
				? (measuredValue(bench, "execP95Ms").value ?? null)
				: null;
		return {
			provider,
			label,
			hue,
			value: measured.value,
			p95,
			source: bench?.source === "demo" ? "demo" : "measured",
			successRate: measured.successRate,
		};
	}

	const reference = profile?.referenceMetrics?.[id];
	return {
		provider,
		label,
		hue,
		value: typeof reference === "number" ? reference : null,
		p95: null,
		source: typeof reference === "number" ? "reference" : null,
		successRate: null,
	};
}

function pickWinner(
	cells: Omit<ProviderMetricCell, "isWinner">[],
	def: MetricDefinition,
): ProviderKind | null {
	const numeric = cells.filter(
		(c): c is typeof c & { value: number } => c.value !== null,
	);
	if (numeric.length === 0) return null;
	// Once we have real (measured/demo) data for a metric, rank only among
	// those — a cited reference claim must never "beat" a measurement. Fall
	// back to ranking references when nothing has been measured yet.
	const measured = numeric.filter(
		(c) => c.source === "measured" || c.source === "demo",
	);
	const pool = measured.length > 0 ? measured : numeric;
	const best = pool.reduce((acc, c) =>
		def.lowerIsBetter
			? c.value < acc.value
				? c
				: acc
			: c.value > acc.value
				? c
				: acc,
	);
	return best.provider;
}

export function buildBenchmarksView(snapshot: BenchmarkSnapshot): BenchmarksView {
	const providers = snapshot.profiles.map((p) => p.provider);

	const allComparisons: MetricComparison[] = METRIC_DEFINITIONS.map((def) => {
		const rawCells = providers.map((p) => resolveCell(snapshot, p, def.id));
		const winner = pickWinner(rawCells, def);
		const cells: ProviderMetricCell[] = rawCells.map((c) => ({
			...c,
			isWinner: c.provider === winner && c.value !== null,
		}));
		return { id: def.id, def, cells, winner };
	});

	const comparisonsByCategory = CATEGORY_ORDER.map((category) => ({
		category,
		comparisons: allComparisons.filter((c) => c.def.category === category),
	})).filter((group) => group.comparisons.length > 0);

	const scores: ScoreEntry[] = providers
		.map((provider) => {
			const profile = profileFor(snapshot, provider);
			const bench = benchFor(snapshot.latest, provider);
			return {
				provider,
				label: profile?.label ?? provider,
				hue: profile?.hue ?? PROVIDER_HUE[provider],
				score: bench?.score ?? null,
			};
		})
		.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

	const byId = new Map(allComparisons.map((c) => [c.id, c]));
	const leaderboard: LeaderboardEntry[] = LEADERBOARD_METRICS.map((id) => {
		const cmp = byId.get(id);
		const def = METRIC_BY_ID[id];
		const winnerCell = cmp?.cells.find((c) => c.isWinner) ?? null;
		return {
			id,
			label: def.label,
			unit: def.unit,
			winner: cmp?.winner ?? null,
			winnerLabel: winnerCell?.label ?? null,
			hue: winnerCell?.hue ?? null,
			value: winnerCell?.value ?? null,
			source: winnerCell?.source ?? null,
		};
	});

	const latest = snapshot.latest;
	const runMeta: RunMeta | null = latest
		? {
				runId: latest.runId,
				finishedAt: latest.finishedAt,
				region: latest.region,
				iterations: latest.providers[0]?.iterations ?? 0,
				source: latest.source,
			}
		: null;

	return {
		generatedAt: snapshot.generatedAt,
		hasMeasuredData: snapshot.hasMeasuredData,
		methodology: snapshot.methodology,
		profiles: snapshot.profiles,
		providers,
		comparisonsByCategory,
		scores,
		leaderboard,
		runMeta,
	};
}

/** Narrowing guard for the API payload before building the view. */
export function isBenchmarkSnapshot(raw: unknown): raw is BenchmarkSnapshot {
	if (!raw || typeof raw !== "object") return false;
	const o = raw as Record<string, unknown>;
	return Array.isArray(o.profiles) && typeof o.methodology === "string";
}

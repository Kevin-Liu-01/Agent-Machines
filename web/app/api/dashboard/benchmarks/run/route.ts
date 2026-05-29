/**
 * POST /api/dashboard/benchmarks/run
 *
 * Triggers a benchmark suite from the dashboard.
 *
 *   mode: "demo"  (default) — synthesize a deterministic demo run from
 *                  provider profiles. Instant, spends nothing, tagged
 *                  source:"demo".
 *   mode: "live"  — actually provision + tear down machines on the
 *                  providers the user has credentials for. This SPENDS
 *                  real credits and can be slow; for a full unattended
 *                  suite prefer the CLI (`npm run benchmark`).
 *
 * Results are stored in Supabase when configured so the GET route serves
 * them on the next load.
 */

import { BENCHMARK_PROVIDERS, DEFAULT_BENCHMARK_SPEC } from "@/lib/benchmarks/constants";
import { synthesizeDemoRun } from "@/lib/benchmarks/demo";
import { runBenchmarkSuite } from "@/lib/benchmarks/engine";
import { storeRun, supabaseConfigured } from "@/lib/benchmarks/store";
import { getProvider, MachineProviderError } from "@/lib/providers";
import type { MachineProvider } from "@/lib/providers/types";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import type { ProviderKind } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_LIVE_ITERATIONS = 20;

function parseProviders(raw: unknown): ProviderKind[] {
	if (!Array.isArray(raw)) return [...BENCHMARK_PROVIDERS];
	const valid = raw.filter((p): p is ProviderKind =>
		(BENCHMARK_PROVIDERS as readonly string[]).includes(p as string),
	);
	return valid.length > 0 ? valid : [...BENCHMARK_PROVIDERS];
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as {
		mode?: string;
		providers?: unknown;
		execIterations?: unknown;
	};
	const mode = body.mode === "live" ? "live" : "demo";
	const providers = parseProviders(body.providers);

	if (mode === "demo") {
		const run = synthesizeDemoRun(providers);
		const stored = await maybeStore(run);
		return Response.json({ ok: true, mode, run, stored });
	}

	// --- live -------------------------------------------------------------
	const config = await getUserConfig();
	const instances: MachineProvider[] = [];
	const skipped: Array<{ provider: ProviderKind; reason: string }> = [];
	for (const kind of providers) {
		try {
			instances.push(getProvider(kind, config.providers));
		} catch (err) {
			skipped.push({
				provider: kind,
				reason:
					err instanceof MachineProviderError
						? err.message
						: err instanceof Error
							? err.message
							: "unavailable",
			});
		}
	}

	if (instances.length === 0) {
		return Response.json(
			{
				ok: false,
				error: "no_credentials",
				message:
					"None of the requested providers have credentials on file. Add keys in /dashboard/setup or run `npm run benchmark` with env vars.",
				skipped,
			},
			{ status: 400 },
		);
	}

	const execIterations = clampIterations(body.execIterations);
	const run = await runBenchmarkSuite(instances, {
		execIterations,
		source: "measured",
		spec: DEFAULT_BENCHMARK_SPEC,
	});
	const stored = await maybeStore(run);

	return Response.json({ ok: true, mode, run, stored, skipped });
}

function clampIterations(raw: unknown): number {
	const n = Number(raw);
	if (!Number.isFinite(n)) return 8;
	return Math.min(MAX_LIVE_ITERATIONS, Math.max(1, Math.round(n)));
}

async function maybeStore(
	run: Awaited<ReturnType<typeof runBenchmarkSuite>>,
): Promise<number> {
	if (!supabaseConfigured()) return 0;
	try {
		return await storeRun(run);
	} catch {
		return 0;
	}
}

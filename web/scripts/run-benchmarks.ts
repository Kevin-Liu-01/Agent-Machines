/**
 * Substrate benchmark CLI.
 *
 * Drives the benchmark engine against the substrate providers you have
 * credentials for, prints a comparison table, and (when Supabase is
 * configured) stores the run so the dashboard shows it.
 *
 * Usage (from repo root):
 *   npm run benchmark -- --demo                 # instant synthetic data
 *   npm run benchmark -- --yes                  # LIVE run, all providers
 *   npm run benchmark -- --yes --providers dedalus,e2b --iterations 12
 *   npm run benchmark -- --yes --no-store --out /tmp/run.json
 *
 * Live runs PROVISION AND DESTROY real machines and spend real credits;
 * they require --yes. Credentials come from the environment (root .env +
 * web/.env.local): DEDALUS_API_KEY, E2B_API_KEY, SPRITES_API_KEY /
 * SPRITE_TOKEN, VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	BENCHMARK_PROVIDERS,
	DEFAULT_BENCHMARK_SPEC,
	DEFAULT_EXEC_ITERATIONS,
	METRIC_DEFINITIONS,
	formatMetric,
	formatScore,
	providersFromEnv,
	runBenchmarkSuite,
	storeRun,
	supabaseConfigured,
	synthesizeDemoRun,
	writeLocalRun,
	type BenchmarkRun,
} from "@/lib/benchmarks";
import type { MachineSpec, ProviderKind } from "@/lib/user-config/schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");

type CliOptions = {
	providers: ProviderKind[];
	iterations: number;
	demo: boolean;
	confirmed: boolean;
	store: boolean;
	out: string | null;
	help: boolean;
};

function loadEnvFiles(): void {
	for (const file of [resolve(REPO_ROOT, ".env"), resolve(WEB_ROOT, ".env.local")]) {
		if (!existsSync(file)) continue;
		const text = readFileSync(file, "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			let value = trimmed.slice(eq + 1).trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			if (key && process.env[key] === undefined) process.env[key] = value;
		}
	}
}

function parseArgs(argv: string[]): CliOptions {
	const opts: CliOptions = {
		providers: [...BENCHMARK_PROVIDERS],
		iterations: DEFAULT_EXEC_ITERATIONS,
		demo: false,
		confirmed: false,
		store: true,
		out: null,
		help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case "--demo":
				opts.demo = true;
				break;
			case "--yes":
			case "-y":
				opts.confirmed = true;
				break;
			case "--no-store":
				opts.store = false;
				break;
			case "--help":
			case "-h":
				opts.help = true;
				break;
			case "--providers": {
				const v = argv[++i] ?? "";
				const kinds = v
					.split(",")
					.map((s) => s.trim())
					.filter((s): s is ProviderKind =>
						(BENCHMARK_PROVIDERS as readonly string[]).includes(s),
					);
				if (kinds.length) opts.providers = kinds;
				break;
			}
			case "--iterations":
				opts.iterations = Math.max(1, Number(argv[++i]) || DEFAULT_EXEC_ITERATIONS);
				break;
			case "--out":
				opts.out = argv[++i] ?? null;
				break;
			default:
				break;
		}
	}
	return opts;
}

const HELP = `Substrate benchmark CLI

  --demo                 Synthesize a demo run (instant, spends nothing)
  --yes, -y              Confirm a LIVE run (provisions + destroys machines)
  --providers a,b,c      Subset of: ${BENCHMARK_PROVIDERS.join(", ")}
  --iterations N         Warm exec samples per provider (default ${DEFAULT_EXEC_ITERATIONS})
  --no-store             Skip writing the run to Supabase
  --out PATH             Also write the run JSON to PATH
  -h, --help             Show this help
`;

function printTable(run: BenchmarkRun): void {
	const providers = run.providers.map((p) => p.provider);
	const colWidth = 16;
	const labelWidth = 26;

	const header =
		"metric".padEnd(labelWidth) +
		providers.map((p) => p.padStart(colWidth)).join("");
	console.log(`\n${header}`);
	console.log("-".repeat(header.length));

	for (const def of METRIC_DEFINITIONS) {
		const cells = run.providers.map((bench) => {
			const stats = bench.metrics[def.id]?.stats;
			return stats ? formatMetric(stats.value, def.unit) : "—";
		});
		// Mark the winner per row.
		const numeric = run.providers.map((bench) => bench.metrics[def.id]?.stats?.value ?? null);
		const valid = numeric.filter((v): v is number => v !== null);
		let winnerIdx = -1;
		if (valid.length) {
			const target = def.lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
			winnerIdx = numeric.findIndex((v) => v === target);
		}
		const row =
			def.label.padEnd(labelWidth) +
			cells
				.map((c, i) => (i === winnerIdx ? `*${c}` : c).padStart(colWidth))
				.join("");
		console.log(row);
	}

	const scoreRow =
		"responsiveness score".padEnd(labelWidth) +
		run.providers
			.map((b) => formatScore(b.score).padStart(colWidth))
			.join("");
	console.log("-".repeat(header.length));
	console.log(scoreRow);
	console.log("\n(* = best in row; score 100 = fastest provider in suite)\n");
}

function writeOut(path: string, run: BenchmarkRun): void {
	const abs = resolve(process.cwd(), path);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, JSON.stringify(run, null, 2));
	console.log(`wrote ${abs}`);
}

async function main(): Promise<void> {
	loadEnvFiles();
	const opts = parseArgs(process.argv.slice(2));

	if (opts.help) {
		console.log(HELP);
		return;
	}

	let run: BenchmarkRun;

	if (opts.demo) {
		console.log(`Synthesizing demo run for: ${opts.providers.join(", ")}`);
		run = synthesizeDemoRun(opts.providers);
	} else {
		if (!opts.confirmed) {
			console.error(
				"LIVE runs provision and destroy real machines and spend real credits.\n" +
					"Re-run with --yes to confirm, or use --demo for synthetic data.",
			);
			process.exitCode = 1;
			return;
		}
		const resolved = providersFromEnv(opts.providers);
		const ready = resolved.filter((r) => r.provider !== null);
		for (const r of resolved) {
			if (!r.provider) console.warn(`skip ${r.kind}: ${r.error}`);
		}
		if (ready.length === 0) {
			console.error(
				"No providers have credentials in the environment. " +
					"Set DEDALUS_API_KEY / E2B_API_KEY / SPRITES_API_KEY / VERCEL_* and retry.",
			);
			process.exitCode = 1;
			return;
		}
		const spec: MachineSpec = DEFAULT_BENCHMARK_SPEC;
		console.log(
			`LIVE benchmark: ${ready.map((r) => r.kind).join(", ")} @ ` +
				`${spec.vcpu}vCPU/${spec.memoryMib}MiB/${spec.storageGib}GiB, ` +
				`${opts.iterations} exec iters`,
		);
		run = await runBenchmarkSuite(
			ready.map((r) => r.provider!),
			{
				execIterations: opts.iterations,
				source: "measured",
				spec,
				onPhase: (provider, phase, detail) =>
					console.log(`  [${provider}] ${phase}${detail ? ` ${detail}` : ""}`),
			},
		);
	}

	printTable(run);

	if (opts.store && supabaseConfigured()) {
		try {
			const n = await storeRun(run);
			console.log(`stored ${n} provider rows to Supabase (run ${run.runId})`);
		} catch (err) {
			console.warn(
				`Supabase store failed (${err instanceof Error ? err.message : String(err)}). ` +
					"Falling back to local cache — apply migration 003 for durable storage.",
			);
		}
	}

	// Always cache locally so the dashboard reflects this run even without
	// Supabase (the GET route reads <web>/.benchmarks when the DB is empty).
	const cached = writeLocalRun(run, WEB_ROOT);
	console.log(`cached run -> ${cached}`);

	if (opts.out) writeOut(opts.out, run);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

import { performance } from "node:perf_hooks";

const url =
	process.argv.slice(2).find((argument) => argument !== "--") ??
	"http://127.0.0.1:3210/";
const requestCount = Number(process.env.PERF_REQUESTS ?? 400);
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 20);
const warmupCount = Number(process.env.PERF_WARMUP ?? 20);
const budgetMs = Number(process.env.PERF_P95_BUDGET_MS ?? 300);

async function request() {
	const started = performance.now();
	const response = await fetch(url, { headers: { connection: "keep-alive" } });
	const body = await response.arrayBuffer();
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
	return { duration: performance.now() - started, bytes: body.byteLength };
}

for (let index = 0; index < warmupCount; index += 1) await request();

const results = [];
let cursor = 0;
await Promise.all(
	Array.from({ length: concurrency }, async () => {
		while (cursor < requestCount) {
			cursor += 1;
			results.push(await request());
		}
	}),
);

const durations = results.map((result) => result.duration).sort((a, b) => a - b);
const percentile = (value) => durations[Math.ceil((value / 100) * durations.length) - 1];
const output = {
	url,
	requests: results.length,
	concurrency,
	p50Ms: Number(percentile(50).toFixed(2)),
	p95Ms: Number(percentile(95).toFixed(2)),
	p99Ms: Number(percentile(99).toFixed(2)),
	maxMs: Number(durations.at(-1).toFixed(2)),
	averageBytes: Math.round(
		results.reduce((sum, result) => sum + result.bytes, 0) / results.length,
	),
	budgetMs,
	passed: percentile(95) < budgetMs,
};

console.log(JSON.stringify(output, null, 2));
if (!output.passed) process.exitCode = 1;

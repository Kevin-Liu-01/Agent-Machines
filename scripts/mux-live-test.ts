/**
 * Live matrix test for the mux: every harness on every credentialed
 * substrate, with real keys, measuring the timings that matter.
 *
 *   npx tsx scripts/mux-live-test.ts [--agents a,b] [--sandboxes x,y] [--keep]
 *
 * Reads keys from .env at the repo root (gitignored). Substrates without
 * credentials are reported as skipped -- that path is itself part of the
 * contract (fail closed, never error into an uncredentialed provider).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMux } from "../src/mux/index.js";
import type { HarnessKind, SubstrateKind } from "../src/mux/index.js";

const ROOT = resolve(import.meta.dirname, "..");
for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
	const match = line.match(/^([A-Z0-9_]+)=(.+)$/);
	if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
}

const args = process.argv.slice(2);
function listArg(flag: string): string[] | null {
	const index = args.indexOf(flag);
	if (index === -1 || !args[index + 1]) return null;
	return args[index + 1].split(",");
}

const agents = (listArg("--agents") ?? [
	"claude-code",
	"codex",
	"openclaw",
	"hermes",
]) as HarnessKind[];
const sandboxes = (listArg("--sandboxes") ?? [
	"e2b",
	"sprites",
	"vercel",
	"dedalus",
]) as SubstrateKind[];
const keep = args.includes("--keep");
/** Route model traffic through a gateway instead of a native key. */
const upstream = (listArg("--upstream") ?? [])[0] as
	| "anthropic"
	| "openai"
	| "aiGateway"
	| "openrouter"
	| undefined;

const PROMPT =
	"Reply with exactly the text MUX-OK and nothing else. Do not use any tools.";

type Row = {
	agent: HarnessKind;
	sandbox: SubstrateKind;
	outcome: "ok" | "skipped" | "failed";
	createMs?: number;
	installMs?: number;
	runMs?: number;
	firstEventMs?: number;
	events?: number;
	text?: string;
	error?: string;
};

const mux = createMux(
	upstream
		? {
				// Blank every key except the requested upstream, so a gateway run
				// cannot silently fall back to a native key and look like it
				// proved the gateway path.
				keys: {
					anthropic: upstream === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined,
					openai: upstream === "openai" ? process.env.OPENAI_API_KEY : undefined,
					aiGateway: upstream === "aiGateway" ? process.env.AI_GATEWAY_API_KEY : undefined,
					openrouter: upstream === "openrouter" ? process.env.OPENROUTER_API_KEY : undefined,
				},
			}
		: undefined,
);
if (upstream) console.log(`upstream forced: ${upstream}`);
const rows: Row[] = [];

for (const sandbox of sandboxes) {
	const readiness = mux.provider(sandbox).ready();
	if (!readiness.ok) {
		for (const agent of agents) {
			rows.push({
				agent,
				sandbox,
				outcome: "skipped",
				error: `missing credentials: ${readiness.missing.join(", ")}`,
			});
		}
		console.log(`[${sandbox}] skipped (missing: ${readiness.missing.join(", ")})`);
		continue;
	}

	for (const agent of agents) {
		const label = `${agent} @ ${sandbox}`;
		const row: Row = { agent, sandbox, outcome: "failed" };
		rows.push(row);
		const name = `mux-live-${agent}-${sandbox}`;
		try {
			console.log(`\n=== ${label} ===`);
			let t = performance.now();
			const machine = await mux.create({
				agent,
				sandbox,
				name,
				install: false,
			});
			row.createMs = Math.round(performance.now() - t);
			console.log(`  create: ${row.createMs}ms (attempts: ${machine.attempts.map((a) => `${a.substrate}=${a.outcome}`).join(",")})`);

			t = performance.now();
			await machine.ensureInstalled();
			row.installMs = Math.round(performance.now() - t);
			console.log(`  install/probe: ${row.installMs}ms`);

			t = performance.now();
			let firstEvent: number | undefined;
			const stream = machine.run(PROMPT, {
				timeoutMs: 240_000,
				onEvent: () => {
					if (firstEvent === undefined) {
						firstEvent = Math.round(performance.now() - t);
					}
				},
			});
			const result = await stream.result();
			row.runMs = Math.round(performance.now() - t);
			row.firstEventMs = firstEvent;
			row.events = result.events;
			row.text = result.text.trim().slice(0, 120);
			row.outcome = result.exitCode === 0 ? "ok" : "failed";
			if (result.exitCode !== 0) row.error = `exit ${result.exitCode}`;
			console.log(
				`  run: ${row.runMs}ms (first event ${row.firstEventMs}ms, ${row.events} events, exit ${result.exitCode})`,
			);
			console.log(`  text: ${JSON.stringify(row.text)}`);
			if (!keep) {
				await machine.destroy();
				console.log("  destroyed");
			}
		} catch (error) {
			row.error = error instanceof Error ? error.message.slice(0, 300) : String(error);
			console.log(`  FAILED: ${row.error}`);
			if (!keep) {
				try {
					const remembered = mux;
					void remembered;
					await (await mux.connect(name)).destroy();
				} catch {
					// best effort teardown
				}
			}
		}
	}
}

console.log("\n\n=== MATRIX ===");
console.log(
	"agent        sandbox   outcome  create  install  first-ev  run      text",
);
for (const row of rows) {
	console.log(
		[
			row.agent.padEnd(12),
			row.sandbox.padEnd(9),
			row.outcome.padEnd(8),
			String(row.createMs ?? "-").padEnd(7),
			String(row.installMs ?? "-").padEnd(8),
			String(row.firstEventMs ?? "-").padEnd(9),
			String(row.runMs ?? "-").padEnd(8),
			row.text ?? row.error ?? "",
		].join(" "),
	);
}
const failed = rows.filter((row) => row.outcome === "failed");
process.exit(failed.length > 0 ? 1 : 0);

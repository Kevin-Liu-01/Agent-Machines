/**
 * Live matrix test for the mux: every harness on every credentialed
 * substrate, with real keys, measuring the timings that matter.
 *
 *   npx tsx scripts/mux-live-test.ts [--agents a,b] [--sandboxes x,y] [--keep]
 *
 * Reads keys from .env at the repo root (gitignored). Substrates without
 * credentials are reported as skipped -- that path is itself part of the
 * contract (fail closed, never error into an uncredentialed provider).
 *
 * This script SPENDS MONEY, so teardown is part of its verdict, not a
 * courtesy at the end: every cell reports what happened to its sandbox, a
 * teardown failure turns the cell red and the run non-zero, and after the
 * matrix each lane that ran is asked what it still has (the sweep). The
 * verdicts, the table and the exit code are in ./live-matrix-report.ts, where
 * they are unit-tested; this file only measures.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMux } from "../src/mux/index.js";
import type { HarnessKind, MuxMachine, SubstrateKind } from "../src/mux/index.js";
import {
	type MatrixRow,
	type SweepLane,
	classifySweep,
	exitCodeFor,
	matrixLines,
	sweepLines,
	verdictLine,
} from "./live-matrix-report.js";

const ROOT = resolve(import.meta.dirname, "..");
// Both files, because they carry different credentials: .env holds the
// substrate and model keys, while `vercel env pull` writes VERCEL_OIDC_TOKEN
// into web/.env.local (see docs/VERCEL-SANDBOX-AUTH.md). Reading only the first
// left the vercel lane reporting "missing credentials" even after a successful
// login, which looks like a code problem and is not one. Missing files are
// skipped: neither is required.
for (const file of [".env", "web/.env.local"]) {
	let text: string;
	try {
		text = readFileSync(resolve(ROOT, file), "utf8");
	} catch {
		continue;
	}
	for (const line of text.split("\n")) {
		const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.+)$/);
		if (!match) continue;
		// Strip surrounding quotes: `vercel env pull` quotes its values.
		const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
		if (!process.env[match[1]]) process.env[match[1]] = value;
	}
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

// Row shape, verdict rules, table rendering and the exit code all live in
// ./live-matrix-report.ts so they can be tested without provisioning anything.

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
const rows: MatrixRow[] = [];

for (const sandbox of sandboxes) {
	const readiness = mux.provider(sandbox).ready();
	if (!readiness.ok) {
		for (const agent of agents) {
			rows.push({
				agent,
				sandbox,
				verdict: "skipped",
				teardown: "none",
				error: `missing credentials: ${readiness.missing.join(", ")}`,
			});
		}
		console.log(`[${sandbox}] skipped (missing: ${readiness.missing.join(", ")})`);
		continue;
	}

	for (const agent of agents) {
		const label = `${agent} @ ${sandbox}`;
		const row: MatrixRow = {
			agent,
			sandbox,
			verdict: "failed",
			teardown: "noMachine",
		};
		rows.push(row);
		const name = `mux-live-${agent}-${sandbox}`;
		// Hoisted out of the try so the teardown block below can see it. It used
		// to be a `const` inside, which is why the old catch tore down by
		// reconnecting to the NAME -- and why a destroy failure was
		// indistinguishable from a run failure.
		let machine: MuxMachine | undefined;
		try {
			console.log(`\n=== ${label} ===`);
			let t = performance.now();
			machine = await mux.create({
				agent,
				sandbox,
				name,
				install: false,
			});
			// Recorded before anything can fail, because the final sweep looks
			// for THIS id: a cell that dies after create must still be
			// sweepable.
			row.sandboxId = machine.sandbox.id;
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
			// BOTH conditions, not the exit code alone. Gating on the exit code
			// was fail-open: a cell whose normalized text came back EMPTY, or
			// carrying a vendor diagnostic instead of the model's answer, still
			// printed ok -- which is exactly the failure mode the 2026-08-03
			// hermes classifier bug produced (the vendor's own warning reported
			// as agent text), and this matrix could not have caught it. Same
			// hole for openclaw's documented in_flight/timeout statuses: zero
			// events, empty text, exit 0. Case-insensitive so a model that
			// shifts case does not read as a red lane.
			const sentinelSeen = result.text.toUpperCase().includes("MUX-OK");
			const exitOk = result.exitCode === 0;
			row.verdict = exitOk && sentinelSeen ? "ok" : "failed";
			if (!exitOk) {
				row.error = `exit ${result.exitCode}`;
			} else if (!sentinelSeen) {
				// Name what DID come back, so a red cell says which condition
				// failed and what to look at -- an empty string here points at
				// event classification, a diagnostic points at the harness.
				row.error =
					row.text.length > 0
						? `exit 0 but no MUX-OK in the text; got: ${JSON.stringify(row.text)}`
						: "exit 0 but the normalized text was EMPTY (zero text events reached the router)";
			}
			console.log(
				`  run: ${row.runMs}ms (first event ${row.firstEventMs}ms, ${row.events} events, exit ${result.exitCode})`,
			);
			console.log(`  text: ${JSON.stringify(row.text)}`);
			if (row.error) console.log(`  FAILED: ${row.error}`);
		} catch (error) {
			row.error = error instanceof Error ? error.message.slice(0, 300) : String(error);
			console.log(`  FAILED: ${row.error}`);
		}

		// Teardown is OUTSIDE the try on purpose. Until 2026-08-05 `destroy()`
		// was the last statement inside it, so a destroy that threw was caught
		// by the run's own catch: that set row.error but never touched the
		// outcome a passing run had already written, so the cell printed `ok`,
		// the exit code stayed 0, and the sandbox kept billing. A separate block
		// with its own verdict is what makes a leak un-hideable.
		if (keep) {
			row.teardown = "kept";
		} else if (machine === undefined) {
			// create() itself threw. create() already tears down a sandbox it
			// provisioned before a later failure in the same call, so usually
			// there is nothing here -- but a placement may have been remembered,
			// so try by name. Failure here stays quiet BECAUSE it is expected
			// (nothing of that name exists); the lane sweep below is the check
			// that does not depend on this guess.
			try {
				const remembered = await mux.connect(name);
				row.sandboxId ??= remembered.sandbox.id;
				await remembered.destroy();
				row.teardown = "ok";
				console.log("  destroyed (reconnected by name)");
			} catch {
				console.log("  no machine to destroy (create failed); see the sweep");
			}
		} else {
			try {
				await machine.destroy();
				row.teardown = "ok";
				console.log("  destroyed");
			} catch (error) {
				row.teardown = "failed";
				row.teardownError =
					error instanceof Error ? error.message.slice(0, 300) : String(error);
				console.log(`  TEARDOWN FAILED: ${row.teardownError}`);
			}
		}
	}
}

/**
 * Independent check that the run left nothing behind: ask each lane that
 * actually ran what it still has, and compare against the ids this run created.
 * A per-cell `destroy()` that resolves is the vendor's word; this is the
 * vendor's own inventory, which is the only thing that catches a destroy that
 * resolved without destroying.
 */
const lanes: SweepLane[] = [];
for (const substrate of [...new Set(rows.map((row) => row.sandbox))]) {
	const cells = rows.filter((row) => row.sandbox === substrate);
	if (cells.every((row) => row.verdict === "skipped")) continue;
	const created = cells
		.map((row) => row.sandboxId)
		.filter((id): id is string => id !== undefined);
	// A cell whose create() threw has no id to look for, so the sweep must say
	// it cannot speak for that cell rather than reporting the lane clean.
	const unidentified = cells.filter(
		(row) => row.verdict !== "skipped" && row.sandboxId === undefined,
	).length;
	try {
		const listed = await mux.provider(substrate).list();
		lanes.push(classifySweep({ substrate, created, unidentified, listed, keep }));
	} catch (error) {
		lanes.push(
			classifySweep({
				substrate,
				created,
				unidentified,
				listError:
					error instanceof Error ? error.message.slice(0, 300) : String(error),
				keep,
			}),
		);
	}
}

console.log("\n\n=== MATRIX ===");
for (const line of matrixLines(rows)) console.log(line);
console.log("\n=== SWEEP (what each lane still has) ===");
for (const line of sweepLines(lanes)) console.log(line);
console.log(`\n${verdictLine(rows, lanes)}`);
process.exit(exitCodeFor(rows, lanes));

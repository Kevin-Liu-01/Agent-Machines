/**
 * Tests for src/mux/health.ts: breaker thresholds, cooldown and half-open
 * probing, fatal outcomes staying out of the health signal, ordering
 * (healthy first, open last, nothing dropped), window aging, snapshot round
 * trips, and the error classifier.
 *
 * The clock is injected, so nothing here sleeps and every boundary is
 * asserted at the exact millisecond.
 *
 * Run: npx tsx --test src/mux/health.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_HEALTH_TUNING,
	HEALTH_SNAPSHOT_VERSION,
	SubstrateHealth,
	outcomeForError,
	type SubstrateHealthOptions,
} from "./health.js";
import { MuxError, type SubstrateKind } from "./types.js";

/** Manual clock: `at` is epoch ms, exactly what the store expects. */
function clockAt(start: number): { now: () => number; advance: (ms: number) => void } {
	let current = start;
	return {
		now: () => current,
		advance: (ms: number) => {
			current += ms;
		},
	};
}

const EPOCH = 1_780_000_000_000;

function harness(options: SubstrateHealthOptions = {}) {
	const clock = clockAt(EPOCH);
	const health = new SubstrateHealth({ now: clock.now, ...options });
	return { health, advance: clock.advance, now: clock.now };
}

function recordFailures(
	health: SubstrateHealth,
	substrate: SubstrateKind,
	count: number,
): void {
	for (let i = 0; i < count; i += 1) health.record(substrate, "transient");
}

test("defaults are the documented ones and the window can hold a full streak", () => {
	assert.deepEqual(DEFAULT_HEALTH_TUNING, {
		openAfter: 3,
		cooldownMs: 30_000,
		windowSize: 20,
		windowMs: 300_000,
		degradedAfter: 1,
	});
	assert.ok(DEFAULT_HEALTH_TUNING.windowSize >= DEFAULT_HEALTH_TUNING.openAfter);
});

test("an untried substrate is healthy", () => {
	const { health } = harness();
	assert.equal(health.state("e2b"), "healthy");
	assert.deepEqual(health.report(), []);
});

test("the circuit opens only after openAfter consecutive transport failures", () => {
	const { health } = harness({ openAfter: 3 });
	health.record("sprites", "transient");
	assert.equal(health.state("sprites"), "degraded");
	health.record("sprites", "transient");
	assert.equal(health.state("sprites"), "degraded");
	health.record("sprites", "transient");
	assert.equal(health.state("sprites"), "open");
	assert.equal(health.stats("sprites").consecutiveFailures, 3);
});

test("a success in the middle of a streak resets the count", () => {
	const { health } = harness({ openAfter: 3 });
	recordFailures(health, "e2b", 2);
	health.record("e2b", "ok", 122);
	health.record("e2b", "transient");
	health.record("e2b", "transient");
	assert.equal(health.state("e2b"), "degraded");
	assert.equal(health.stats("e2b").consecutiveFailures, 2);
	health.record("e2b", "transient");
	assert.equal(health.state("e2b"), "open");
});

test("the circuit stays open for the whole cooldown, then half-opens", () => {
	const { health, advance } = harness({ openAfter: 2, cooldownMs: 30_000 });
	recordFailures(health, "vercel", 2);
	assert.equal(health.state("vercel"), "open");

	advance(29_999);
	assert.equal(health.state("vercel"), "open", "still inside the cooldown");

	advance(1);
	assert.equal(
		health.state("vercel"),
		"degraded",
		"cooldown elapsed: half-open, eligible for one probe",
	);
});

test("a successful half-open probe closes the circuit", () => {
	const { health, advance } = harness({ openAfter: 2, cooldownMs: 10_000 });
	recordFailures(health, "dedalus", 2);
	advance(10_000);
	assert.equal(health.state("dedalus"), "degraded");

	health.record("dedalus", "ok", 866);
	assert.equal(health.stats("dedalus").openedAt, undefined);
	// The window still remembers the two failures, so the lane is not yet
	// pristine -- but it is no longer skipped.
	assert.equal(health.state("dedalus"), "degraded");

	// Once the failures age out of the window the lane is healthy again.
	advance(DEFAULT_HEALTH_TUNING.windowMs);
	health.record("dedalus", "ok", 800);
	assert.equal(health.state("dedalus"), "healthy");
});

test("a failed half-open probe reopens the circuit for a fresh cooldown", () => {
	const { health, advance } = harness({ openAfter: 2, cooldownMs: 10_000 });
	recordFailures(health, "sprites", 2);
	const firstOpenedAt = health.stats("sprites").openedAt;
	assert.equal(firstOpenedAt, EPOCH);

	advance(10_000);
	assert.equal(health.state("sprites"), "degraded");

	health.record("sprites", "transient");
	assert.equal(health.state("sprites"), "open");
	assert.equal(health.stats("sprites").openedAt, EPOCH + 10_000);
	assert.equal(health.stats("sprites").retryAtMs, EPOCH + 20_000);

	advance(9_999);
	assert.equal(health.state("sprites"), "open", "cooldown restarted from the probe");
	advance(1);
	assert.equal(health.state("sprites"), "degraded");
});

test("fatal outcomes never open the circuit and never break a streak", () => {
	const { health } = harness({ openAfter: 3 });
	for (let i = 0; i < 10; i += 1) health.record("e2b", "fatal");
	assert.equal(health.state("e2b"), "healthy", "a config gap is not a health signal");
	assert.equal(health.stats("e2b").fatals, 10);
	assert.equal(health.stats("e2b").failures, 0);
	assert.equal(health.stats("e2b").consecutiveFailures, 0);

	// A fatal interleaved into a transport streak is stepped over, not
	// counted and not treated as a reset.
	health.record("e2b", "transient");
	health.record("e2b", "fatal");
	health.record("e2b", "transient");
	assert.equal(health.state("e2b"), "degraded");
	health.record("e2b", "transient");
	assert.equal(health.state("e2b"), "open");
});

test("order puts healthy first, open last, and keeps configured order in a tier", () => {
	const { health } = harness({ openAfter: 3 });
	recordFailures(health, "e2b", 3); // open
	health.record("sprites", "transient"); // degraded
	health.record("dedalus", "ok", 866); // healthy
	// vercel: never tried, therefore healthy.

	const route: SubstrateKind[] = ["e2b", "sprites", "vercel", "dedalus"];
	assert.deepEqual(health.order(route), ["vercel", "dedalus", "sprites", "e2b"]);
	assert.deepEqual(route, ["e2b", "sprites", "vercel", "dedalus"], "input untouched");
});

test("order never removes a candidate, even when every lane is open", () => {
	const { health } = harness({ openAfter: 2 });
	const route: SubstrateKind[] = ["e2b", "sprites", "vercel", "dedalus"];
	for (const substrate of route) recordFailures(health, substrate, 2);
	for (const substrate of route) assert.equal(health.state(substrate), "open");

	const ordered = health.order(route);
	assert.deepEqual(
		ordered,
		route,
		"all-open collapses to the configured order so create() is still possible",
	);
	assert.equal(ordered.length, route.length);
});

test("order preserves configured priority between two equally healthy lanes", () => {
	const { health } = harness();
	health.record("sprites", "ok", 87);
	health.record("e2b", "ok", 122);
	assert.deepEqual(health.order(["e2b", "sprites"]), ["e2b", "sprites"]);
	assert.deepEqual(health.order(["sprites", "e2b"]), ["sprites", "e2b"]);
});

test("failures age out of the rolling window", () => {
	const { health, advance } = harness({ openAfter: 3, windowMs: 60_000 });
	health.record("vercel", "transient");
	advance(30_000);
	health.record("vercel", "transient");
	assert.equal(health.stats("vercel").consecutiveFailures, 2);

	advance(31_000); // the first failure is now older than windowMs
	assert.equal(health.stats("vercel").samples, 1);
	health.record("vercel", "transient");
	assert.equal(
		health.state("vercel"),
		"degraded",
		"two failures spread past the window never form a streak",
	);
	health.record("vercel", "transient");
	assert.equal(health.state("vercel"), "open");
});

test("the window is capped at windowSize samples", () => {
	const { health } = harness({ windowSize: 5, openAfter: 3 });
	for (let i = 0; i < 12; i += 1) health.record("e2b", "ok", 100);
	assert.equal(health.stats("e2b").samples, 5);
	assert.equal(health.stats("e2b").avgLatencyMs, 100);
});

test("stats averages only the latencies that were reported", () => {
	const { health } = harness();
	health.record("sprites", "ok", 100);
	health.record("sprites", "ok");
	health.record("sprites", "ok", 300);
	const stats = health.stats("sprites");
	assert.equal(stats.samples, 3);
	assert.equal(stats.avgLatencyMs, 200);
	assert.equal(stats.retryAtMs, undefined);
});

test("JSON round trip preserves the open state and the remaining cooldown", () => {
	const { health, advance, now } = harness({ openAfter: 2, cooldownMs: 30_000 });
	recordFailures(health, "sprites", 2);
	health.record("e2b", "ok", 122);
	health.record("vercel", "transient");

	const snapshot = JSON.parse(JSON.stringify(health.toJSON())) as unknown;
	advance(15_000);
	const restored = SubstrateHealth.fromJSON(snapshot, {
		now,
		openAfter: 2,
		cooldownMs: 30_000,
	});

	assert.equal(restored.state("sprites"), "open", "still inside the cooldown");
	assert.equal(restored.state("e2b"), "healthy");
	assert.equal(restored.state("vercel"), "degraded");
	assert.equal(restored.stats("sprites").openedAt, EPOCH);
	assert.equal(restored.stats("sprites").consecutiveFailures, 2);
	assert.equal(restored.stats("e2b").avgLatencyMs, 122);

	advance(15_000);
	assert.equal(restored.state("sprites"), "degraded", "cooldown elapses in the new process");
	restored.record("sprites", "ok", 300);
	assert.equal(restored.state("sprites"), "degraded");
	assert.equal(restored.stats("sprites").openedAt, undefined);
});

test("a serialized snapshot carries a version and only known lanes", () => {
	const { health } = harness();
	health.record("e2b", "transient");
	const snapshot = health.toJSON();
	assert.equal(snapshot.version, HEALTH_SNAPSHOT_VERSION);
	assert.deepEqual(Object.keys(snapshot.substrates), ["e2b"]);
});

test("toJSON drops lanes whose history has fully aged out", () => {
	const { health, advance } = harness({ windowMs: 60_000, openAfter: 3 });
	health.record("dedalus", "ok", 500);
	advance(61_000);
	assert.deepEqual(health.toJSON().substrates, {});
});

test("fromJSON ignores foreign, corrupt and unknown-version snapshots", () => {
	const { health, now } = harness();
	void health;
	assert.deepEqual(SubstrateHealth.fromJSON(undefined, { now }).toJSON().substrates, {});
	assert.deepEqual(SubstrateHealth.fromJSON("nope", { now }).toJSON().substrates, {});
	assert.deepEqual(
		SubstrateHealth.fromJSON({ version: 99, substrates: { e2b: { samples: [] } } }, { now })
			.toJSON().substrates,
		{},
		"an unrecognized version is discarded rather than coerced",
	);
	const hostile = SubstrateHealth.fromJSON(
		{
			version: HEALTH_SNAPSHOT_VERSION,
			substrates: {
				"../etc/passwd": { samples: [{ at: EPOCH, outcome: "transient" }] },
				modal: { samples: [{ at: EPOCH, outcome: "transient" }] },
				e2b: {
					samples: [
						{ at: EPOCH, outcome: "nonsense" },
						{ at: "not-a-number", outcome: "transient" },
						{ at: EPOCH, outcome: "transient", latencyMs: -5 },
					],
				},
			},
		},
		{ now },
	);
	assert.deepEqual(Object.keys(hostile.toJSON().substrates), ["e2b"]);
	const stats = hostile.stats("e2b");
	assert.equal(stats.samples, 1, "only the well-formed sample survives");
	assert.equal(stats.avgLatencyMs, undefined, "a negative latency is not recorded");
});

test("a snapshot from a clock that runs ahead cannot pin a lane open", () => {
	const { health, advance, now } = harness({ openAfter: 2, cooldownMs: 10_000 });
	const skewed = SubstrateHealth.fromJSON(
		{
			version: HEALTH_SNAPSHOT_VERSION,
			substrates: {
				e2b: {
					openedAt: EPOCH + 86_400_000,
					samples: [{ at: EPOCH, outcome: "transient" }],
				},
			},
		},
		{ now, openAfter: 2, cooldownMs: 10_000 },
	);
	void health;
	assert.equal(skewed.state("e2b"), "open");
	advance(10_000);
	assert.equal(skewed.state("e2b"), "degraded", "clamped to at most one cooldown");
});

test("reset clears one lane or all lanes", () => {
	const { health } = harness({ openAfter: 2 });
	recordFailures(health, "e2b", 2);
	recordFailures(health, "sprites", 2);
	health.reset("e2b");
	assert.equal(health.state("e2b"), "healthy");
	assert.equal(health.state("sprites"), "open");
	health.reset();
	assert.equal(health.state("sprites"), "healthy");
	assert.deepEqual(health.report(), []);
});

test("report lists every lane with history in substrate order", () => {
	const { health } = harness({ openAfter: 2 });
	health.record("sprites", "ok", 87);
	recordFailures(health, "e2b", 2);
	assert.deepEqual(
		health.report().map((entry) => [entry.substrate, entry.state]),
		[
			["e2b", "open"],
			["sprites", "healthy"],
		],
	);
});

test("outcomeForError keeps configuration gaps out of the health signal", () => {
	assert.equal(outcomeForError(new MuxError("missing_credentials", "no key")), null);
	assert.equal(outcomeForError(new MuxError("not_supported", "no pty")), null);
	assert.equal(outcomeForError(new MuxError("fatal", "install failed")), "fatal");
	assert.equal(outcomeForError(new MuxError("transient", "fetch failed")), "transient");
	assert.equal(outcomeForError(new MuxError("rate_limited", "429")), "transient");
	assert.equal(outcomeForError(new Error("boom")), "transient");
	assert.equal(outcomeForError("boom"), "transient");
});

test("recording via outcomeForError opens the circuit on repeated transport errors", () => {
	const { health } = harness({ openAfter: 3 });
	const errors = [
		new MuxError("transient", "sprite not found"),
		new Error("fetch failed"),
		new MuxError("rate_limited", "429 slow down"),
	];
	for (const error of errors) {
		const outcome = outcomeForError(error);
		if (outcome) health.record("sprites", outcome);
	}
	assert.equal(health.state("sprites"), "open");

	// A missing-credential error is not recorded at all, so it can never
	// contribute to a trip.
	const { health: second } = harness({ openAfter: 3 });
	for (let i = 0; i < 5; i += 1) {
		const outcome = outcomeForError(new MuxError("missing_credentials", "no token"));
		if (outcome) second.record("vercel", outcome);
	}
	assert.equal(second.state("vercel"), "healthy");
	assert.equal(second.stats("vercel").samples, 0);
});

test("invalid tuning fails closed", () => {
	assert.throws(
		() => new SubstrateHealth({ openAfter: 0 }),
		(error: unknown) => error instanceof MuxError && error.kind === "fatal",
	);
	assert.throws(
		() => new SubstrateHealth({ windowSize: 2, openAfter: 3 }),
		(error: unknown) =>
			error instanceof MuxError && /windowSize/.test(error.message),
	);
	assert.throws(() => new SubstrateHealth({ cooldownMs: -1 }), MuxError);
	assert.throws(() => new SubstrateHealth({ windowMs: 0 }), MuxError);
	assert.throws(() => new SubstrateHealth({ degradedAfter: 0 }), MuxError);
	assert.throws(() => new SubstrateHealth({ openAfter: 1.5 }), MuxError);
});

test("cooldownMs 0 makes the breaker advisory-only, never skipping", () => {
	const { health } = harness({ openAfter: 2, cooldownMs: 0 });
	recordFailures(health, "e2b", 2);
	assert.equal(health.state("e2b"), "degraded", "opens and is immediately probeable");
	assert.deepEqual(health.order(["e2b", "sprites"]), ["sprites", "e2b"]);
});

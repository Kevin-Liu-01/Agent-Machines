/**
 * Tests for src/mux/constraints.ts: the capability filter accepts and rejects
 * on every dimension, and each rejection reason names both the constraint and
 * the substrate's actual value (those strings ship to machine.attempts and the
 * dashboard, so they are asserted verbatim).
 *
 * Run: tsx --test src/mux/constraints.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMuxConfig } from "./config.js";
import {
	SUBSTRATE_LIMITS,
	asSkippedAttempts,
	checkConstraints,
	filterCandidates,
	profileFor,
	type SubstrateLimits,
	type SubstrateProfile,
} from "./constraints.js";
import { getProvider } from "./providers/index.js";
import type { SandboxCapabilities, SubstrateKind } from "./types.js";

const ROUTE: readonly SubstrateKind[] = ["e2b", "sprites", "vercel", "dedalus"];

/**
 * Capabilities come from the providers themselves rather than a copy in the
 * test, so a provider that changes what it declares changes these outcomes
 * instead of silently disagreeing with them.
 */
function realProfiles(): SubstrateProfile[] {
	const config = resolveMuxConfig({});
	return ROUTE.map((kind) =>
		profileFor(kind, getProvider(kind, config).capabilities),
	);
}

function fakeProfile(
	substrate: SubstrateKind,
	capabilities: Partial<SandboxCapabilities>,
	limits: Partial<SubstrateLimits> = {},
): SubstrateProfile {
	return {
		substrate,
		capabilities: {
			pty: "native",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			...capabilities,
		},
		limits: { ...SUBSTRATE_LIMITS[substrate], ...limits },
	};
}

function reasonFor(
	result: ReturnType<typeof filterCandidates>,
	substrate: SubstrateKind,
): string {
	const rejection = result.rejected.find((item) => item.substrate === substrate);
	assert.ok(rejection, `expected ${substrate} to be rejected`);
	return rejection.reason;
}

test("provider capabilities are the matrix the limits table was written against", () => {
	const config = resolveMuxConfig({});
	const declared = Object.fromEntries(
		ROUTE.map((kind) => [kind, getProvider(kind, config).capabilities]),
	);
	assert.deepEqual(declared, {
		e2b: {
			pty: "native",
			persistence: "memory-snapshot",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
		},
		sprites: {
			pty: "native",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
		},
		vercel: {
			pty: "tmux",
			persistence: "filesystem-snapshot",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
		},
		dedalus: {
			pty: "tmux",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			streamingExec: false,
		},
	});
});

test("no constraints accepts the whole route in the offered order", () => {
	const result = filterCandidates(realProfiles());
	assert.deepEqual(result.accepted, ["e2b", "sprites", "vercel", "dedalus"]);
	assert.deepEqual(result.rejected, []);
	// Same answer for an explicitly empty constraint object.
	assert.deepEqual(filterCandidates(realProfiles(), {}).accepted, [...ROUTE]);
});

test("pty floor is ranked: native rejects the tmux lanes by name", () => {
	const result = filterCandidates(realProfiles(), { pty: "native" });
	assert.deepEqual(result.accepted, ["e2b", "sprites"]);
	assert.deepEqual(
		result.rejected.map((item) => item.substrate),
		["vercel", "dedalus"],
	);
	assert.equal(
		reasonFor(result, "vercel"),
		'pty: requires at least "native", vercel provides "tmux"',
	);
	assert.equal(
		reasonFor(result, "dedalus"),
		'pty: requires at least "native", dedalus provides "tmux"',
	);

	// A native substrate over-satisfies a tmux floor, and "none" constrains
	// nothing, so both accept everything.
	assert.deepEqual(filterCandidates(realProfiles(), { pty: "tmux" }).accepted, [
		...ROUTE,
	]);
	assert.deepEqual(filterCandidates(realProfiles(), { pty: "none" }).accepted, [
		...ROUTE,
	]);
});

test("pty floor of native rejects a none-pty substrate with its actual value", () => {
	const failures = checkConstraints(fakeProfile("dedalus", { pty: "none" }), {
		pty: "native",
	});
	assert.equal(failures.length, 1);
	assert.deepEqual(failures[0], {
		constraint: "pty",
		required: 'at least "native"',
		actual: '"none"',
		reason: 'pty: requires at least "native", dedalus provides "none"',
	});
});

test("persistence accepts a single model or a set, and names the actual model", () => {
	const single = filterCandidates(realProfiles(), {
		persistence: "memory-snapshot",
	});
	assert.deepEqual(single.accepted, ["e2b"]);
	assert.equal(
		reasonFor(single, "sprites"),
		'persistence: requires "memory-snapshot", sprites provides "always-on"',
	);

	const snapshotting = filterCandidates(realProfiles(), {
		persistence: ["memory-snapshot", "filesystem-snapshot"],
	});
	assert.deepEqual(snapshotting.accepted, ["e2b", "vercel"]);
	assert.equal(
		reasonFor(snapshotting, "dedalus"),
		'persistence: requires "memory-snapshot" or "filesystem-snapshot", dedalus provides "always-on"',
	);

	assert.deepEqual(
		filterCandidates(realProfiles(), { persistence: "always-on" }).accepted,
		["sprites", "dedalus"],
	);
});

test("streamingExec=true rejects the one substrate that declares it false", () => {
	const result = filterCandidates(realProfiles(), { streamingExec: true });
	assert.deepEqual(result.accepted, ["e2b", "sprites", "vercel"]);
	assert.equal(
		reasonFor(result, "dedalus"),
		"streamingExec: required, dedalus reports streamingExec=false",
	);
});

test("reattach and publicUrl reject with the same precise wording", () => {
	assert.deepEqual(
		checkConstraints(fakeProfile("sprites", { reattach: false }), {
			reattach: true,
		}),
		[
			{
				constraint: "reattach",
				required: "true",
				actual: "false",
				reason: "reattach: required, sprites reports reattach=false",
			},
		],
	);
	assert.deepEqual(
		checkConstraints(fakeProfile("e2b", { publicUrl: false }), {
			publicUrl: true,
		}),
		[
			{
				constraint: "publicUrl",
				required: "true",
				actual: "false",
				reason: "publicUrl: required, e2b reports publicUrl=false",
			},
		],
	);
	// Every real lane declares both, so the whole route survives.
	assert.deepEqual(
		filterCandidates(realProfiles(), { reattach: true, publicUrl: true })
			.accepted,
		[...ROUTE],
	);
});

test("boolean false is an explicit no-op, not an inverted requirement", () => {
	const noPublicUrl = fakeProfile("dedalus", {
		publicUrl: false,
		streamingExec: false,
		reattach: false,
	});
	assert.deepEqual(
		checkConstraints(noPublicUrl, {
			publicUrl: false,
			streamingExec: false,
			reattach: false,
		}),
		[],
	);
});

test("minVcpu passes on the baseline and rejects with baseline and request state", () => {
	const profiles = realProfiles();
	// e2b's measured baseline is 2 vCPU, so a floor of 2 needs no request.
	assert.deepEqual(filterCandidates(profiles, { minVcpu: 2 }).accepted, ["e2b", "vercel"]);

	const result = filterCandidates(profiles, { minVcpu: 4 });
	assert.deepEqual(result.accepted, []);
	assert.equal(
		reasonFor(result, "e2b"),
		"minVcpu: requires at least 4 vCPU, e2b baseline is 2 vCPU and CreateSandboxOptions.resources is unknown on this substrate, so a larger size cannot be guaranteed",
	);
	assert.equal(
		reasonFor(result, "vercel"),
		"minVcpu: requires at least 4 vCPU, vercel baseline is 2 vCPU and CreateSandboxOptions.resources is ignored on this substrate, so a larger size cannot be guaranteed",
	);
	// An unpublished baseline fails closed even for a floor of 1.
	assert.equal(
		reasonFor(filterCandidates(profiles, { minVcpu: 1 }), "sprites"),
		"minVcpu: requires at least 1 vCPU, sprites publishes no baseline size and CreateSandboxOptions.resources is ignored on this substrate, so a larger size cannot be guaranteed",
	);
});

test("minVcpu carries the required and actual values for the dashboard", () => {
	const failures = checkConstraints(profileFor("e2b", realProfiles()[0].capabilities), {
		minVcpu: 4,
	});
	assert.equal(failures.length, 1);
	assert.equal(failures[0].constraint, "minVcpu");
	assert.equal(failures[0].required, "at least 4 vCPU");
	assert.equal(
		failures[0].actual,
		"baseline 2 vCPU, ceiling 8 vCPU, resource requests unknown",
	);
});

test("a honored resource request satisfies a floor up to the ceiling", () => {
	const honored = fakeProfile(
		"vercel",
		{},
		{ baseVcpu: 1, maxVcpu: 8, resourceRequest: "honored" },
	);
	assert.deepEqual(checkConstraints(honored, { minVcpu: 4 }), []);
	assert.deepEqual(checkConstraints(honored, { minVcpu: 8 }), []);
	assert.equal(
		checkConstraints(honored, { minVcpu: 16 })[0].reason,
		"minVcpu: requires at least 16 vCPU, vercel baseline is 1 vCPU and its ceiling is 8 vCPU",
	);

	// Honored but with no published ceiling is still unprovable.
	const noCeiling = fakeProfile(
		"vercel",
		{},
		{ baseVcpu: 1, maxVcpu: "unknown", resourceRequest: "honored" },
	);
	assert.equal(
		checkConstraints(noCeiling, { minVcpu: 4 })[0].reason,
		"minVcpu: requires at least 4 vCPU, vercel baseline is 1 vCPU and its ceiling is unknown",
	);
});

test("minMemoryMib compares against the substrate's real baseline in MiB", () => {
	const profiles = realProfiles();
	// Vercel's documented default is 2 vCPU with 2 GB each.
	assert.deepEqual(filterCandidates(profiles, { minMemoryMib: 4096 }).accepted, [
		"vercel",
	]);

	const result = filterCandidates(profiles, { minMemoryMib: 512 });
	assert.deepEqual(result.accepted, ["vercel"]);
	assert.equal(
		reasonFor(result, "e2b"),
		"minMemoryMib: requires at least 512 MiB, e2b baseline is 478 MiB and CreateSandboxOptions.resources is unknown on this substrate, so a larger size cannot be guaranteed",
	);
	assert.equal(
		reasonFor(filterCandidates(profiles, { minMemoryMib: 8192 }), "vercel"),
		"minMemoryMib: requires at least 8192 MiB, vercel baseline is 4096 MiB and CreateSandboxOptions.resources is ignored on this substrate, so a larger size cannot be guaranteed",
	);
});

test("maxRuntimeMs accepts the documented ceiling exactly and rejects past it", () => {
	const profiles = realProfiles();
	// e2b Base allows a 1-hour continuous run; vercel Hobby allows 45 minutes.
	assert.deepEqual(filterCandidates(profiles, { maxRuntimeMs: 2_700_000 }).accepted, [
		"e2b",
		"vercel",
	]);
	assert.deepEqual(filterCandidates(profiles, { maxRuntimeMs: 3_600_000 }).accepted, [
		"e2b",
	]);

	const result = filterCandidates(profiles, { maxRuntimeMs: 3_600_001 });
	assert.deepEqual(result.accepted, []);
	assert.equal(
		reasonFor(result, "e2b"),
		"maxRuntimeMs: requires a run of up to 3600001ms, e2b allows at most 3600000ms",
	);
	assert.equal(
		reasonFor(result, "vercel"),
		"maxRuntimeMs: requires a run of up to 3600001ms, vercel allows at most 2700000ms",
	);
	// An unpublished ceiling fails closed rather than reading as unbounded.
	assert.equal(
		reasonFor(result, "sprites"),
		"maxRuntimeMs: requires a run of up to 3600001ms, sprites publishes no maximum run duration (unknown)",
	);
	assert.equal(
		reasonFor(result, "dedalus"),
		"maxRuntimeMs: requires a run of up to 3600001ms, dedalus publishes no maximum run duration (unknown)",
	);
});

test("all failing dimensions are reported, joined into one attempt reason", () => {
	const result = filterCandidates(realProfiles(), {
		pty: "native",
		streamingExec: true,
		maxRuntimeMs: 7_200_000,
	});
	assert.deepEqual(result.accepted, []);
	const dedalus = result.rejected.find((item) => item.substrate === "dedalus");
	assert.ok(dedalus);
	assert.deepEqual(
		dedalus.failures.map((failure) => failure.constraint),
		["pty", "streamingExec", "maxRuntimeMs"],
	);
	assert.equal(
		dedalus.reason,
		'pty: requires at least "native", dedalus provides "tmux"; streamingExec: required, dedalus reports streamingExec=false; maxRuntimeMs: requires a run of up to 7200000ms, dedalus publishes no maximum run duration (unknown)',
	);
});

test("rejections render as skipped route attempts", () => {
	const result = filterCandidates(realProfiles(), { pty: "native" });
	assert.deepEqual(asSkippedAttempts(result.rejected), [
		{
			substrate: "vercel",
			constraint: "pty",
			outcome: "skipped",
			reason: 'pty: requires at least "native", vercel provides "tmux"',
		},
		{
			substrate: "dedalus",
			constraint: "pty",
			outcome: "skipped",
			reason: 'pty: requires at least "native", dedalus provides "tmux"',
		},
	]);
	assert.deepEqual(asSkippedAttempts([]), []);
});

test("profileFor defaults to the sourced limits table and accepts an override", () => {
	const capabilities = realProfiles()[0].capabilities;
	assert.deepEqual(profileFor("e2b", capabilities).limits, SUBSTRATE_LIMITS.e2b);
	const overridden = profileFor("e2b", capabilities, {
		...SUBSTRATE_LIMITS.e2b,
		maxRuntimeMs: 86_400_000,
	});
	assert.deepEqual(checkConstraints(overridden, { maxRuntimeMs: 86_400_000 }), []);
});

test("every substrate has a limits entry", () => {
	assert.deepEqual(Object.keys(SUBSTRATE_LIMITS).sort(), [
		"dedalus",
		"e2b",
		"sprites",
		"vercel",
	]);
});

test("asSkippedAttempts surfaces the failed dimension, not just prose", () => {
	// A UI should not have to parse the joined reason string to say
	// "no native PTY", so the first failed key travels structurally.
	const profile = profileFor("vercel", {
		pty: "tmux",
		persistence: "filesystem-snapshot",
		reattach: true,
		publicUrl: true,
		streamingExec: true,
	});
	const filtered = filterCandidates([profile], { pty: "native" });
	const skips = asSkippedAttempts(filtered.rejected);
	assert.equal(skips.length, 1);
	assert.equal(skips[0].constraint, "pty");
	assert.equal(skips[0].outcome, "skipped");
	assert.match(skips[0].reason, /pty/i);
});

/**
 * Tests for src/mux/constraints.ts: the capability filter accepts and rejects
 * on every dimension, and each rejection reason names both the constraint and
 * the substrate's actual value (those strings ship to machine.attempts and the
 * dashboard, so they are asserted verbatim).
 *
 * Two properties matter more than any individual case:
 *
 *   1. An unknown fact REJECTS. Every axis is checked with a substrate that
 *      declares "unknown" for it, and with a capabilities record that omits
 *      the axis entirely, because an absent axis has to behave exactly like an
 *      explicitly unknown one.
 *   2. Being able to ASK is not the same as getting it. A vendor that supports
 *      an option the adapter never forwards must still fail the constraint.
 *
 * Run: tsx --test src/mux/constraints.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMuxConfig } from "./config.js";
import {
	asSkippedAttempts,
	checkConstraints,
	filterCandidates,
	profileFor,
	type SubstrateProfile,
} from "./constraints.js";
import { getProvider } from "./providers/index.js";
import type {
	SandboxCapabilities,
	SubstrateKind,
	SubstrateLimits,
} from "./types.js";

const ROUTE: readonly SubstrateKind[] = ["e2b", "sprites", "vercel", "dedalus"];

/**
 * Config with NO substrate credentials, whatever the shell holds.
 *
 * resolveMuxConfig falls back to process.env for every credential, and vercel's
 * ceilings are credential-dependent: the OIDC JWT carries a `plan` claim
 * (measured 2026-08-05) and the adapter raises maxVcpu/maxMemoryMib/
 * maxRuntimeMs/maxConcurrentSandboxes when it proves a tier above hobby. An
 * empty string beats the env fallback (`expand("") ?? fromEnv(...)` keeps ""),
 * so this pins the suite to the uncredentialed declaration. Without it, running
 * `npm run test:mux` in a shell that happens to export VERCEL_OIDC_TOKEN would
 * change what these tests assert.
 */
function uncredentialedConfig(): ReturnType<typeof resolveMuxConfig> {
	return resolveMuxConfig({
		providers: { vercel: { token: "", teamId: "", projectId: "", oidcToken: "" } },
	});
}

/**
 * Capabilities come from the providers themselves rather than a copy in the
 * test, so a provider that changes what it declares changes these outcomes
 * instead of silently disagreeing with them.
 */
function realProfiles(): SubstrateProfile[] {
	const config = uncredentialedConfig();
	return ROUTE.map((kind) =>
		profileFor(kind, getProvider(kind, config).capabilities),
	);
}

function declared(kind: SubstrateKind): SandboxCapabilities {
	return getProvider(kind, uncredentialedConfig()).capabilities;
}

/**
 * The six required behavioral axes and nothing else -- the shape a fake or a
 * brand-new adapter has before anyone researches its vendor facts. Every new
 * axis must reject against this.
 */
const BARE_CAPABILITIES: SandboxCapabilities = {
	pty: "native",
	persistence: "always-on",
	reattach: true,
	publicUrl: true,
	streamingExec: true,
	detachedWork: "reliable",
};

function fakeProfile(
	substrate: SubstrateKind,
	capabilities: Partial<SandboxCapabilities> = {},
	limits: Partial<SubstrateLimits> = {},
): SubstrateProfile {
	const base = declared(substrate);
	return {
		substrate,
		capabilities: {
			...base,
			...capabilities,
			limits: { ...(base.limits as SubstrateLimits), ...limits },
		},
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

function accepted(constraints: Parameters<typeof filterCandidates>[1]): SubstrateKind[] {
	return filterCandidates(realProfiles(), constraints).accepted;
}

test("every adapter declares every axis, each value sourced in a comment", () => {
	// A missing axis is legal in the type (absent reads as unknown and fails
	// closed) but is NOT acceptable in a shipped adapter: it would silently
	// drop that lane from every constrained route. This is the guard that makes
	// the optional fields safe.
	for (const kind of ROUTE) {
		const capabilities = declared(kind);
		for (const axis of ["region", "gpu", "network", "fork", "publicPorts", "limits"] as const) {
			assert.ok(
				capabilities[axis] !== undefined,
				`${kind} declares no ${axis}; declare it (with a vendor citation) or state "unknown"`,
			);
		}
	}
});

test("provider capabilities are exactly what the routing model was written against", () => {
	const declaredAll = Object.fromEntries(ROUTE.map((kind) => [kind, declared(kind)]));
	assert.deepEqual(declaredAll, {
		e2b: {
			pty: "native",
			persistence: "memory-snapshot",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			detachedWork: "reliable",
			region: { default: "unknown", available: "unknown", select: "unsupported" },
			gpu: { available: "unknown", models: "unknown", request: "unsupported" },
			// E2B documents allowInternetAccess and egress allow/deny lists; the
			// adapter forwards neither, so the knob is "ignored", not available.
			network: { egress: "open", control: "ignored" },
			// Snapshots can spawn a new sandbox; the mux has no fork operation.
			fork: { vendor: true, exposed: false },
			publicPorts: {
				model: "any-port",
				vendorMax: "unknown",
				muxMax: "unknown",
				fixed: null,
			},
			limits: {
				baseVcpu: 2,
				baseMemoryMib: 478,
				baseDiskGib: 9,
				maxVcpu: 8,
				maxMemoryMib: 8192,
				maxDiskGib: 9,
				maxRuntimeMs: 3_600_000,
				maxConcurrentSandboxes: 20,
				resourceRequest: "unknown",
			},
		},
		sprites: {
			pty: "native",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			// Measured: the same install takes 17s foreground and does not
			// finish in 15 minutes detached on this substrate.
			detachedWork: "throttled",
			region: { default: "unknown", available: "unknown", select: "unsupported" },
			gpu: { available: "unknown", models: "unknown", request: "unsupported" },
			network: { egress: "open", control: "unsupported" },
			fork: { vendor: false, exposed: false },
			publicPorts: {
				model: "single-fixed",
				vendorMax: 1,
				muxMax: 1,
				fixed: [8080],
			},
			limits: {
				baseVcpu: "unknown",
				baseMemoryMib: "unknown",
				baseDiskGib: 93,
				maxVcpu: "unknown",
				maxMemoryMib: 7629,
				maxDiskGib: 93,
				maxRuntimeMs: "unknown",
				maxConcurrentSandboxes: "unknown",
				resourceRequest: "ignored",
			},
		},
		vercel: {
			pty: "tmux",
			persistence: "filesystem-snapshot",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			detachedWork: "reliable",
			region: { default: "iad1", available: ["iad1"], select: "unsupported" },
			gpu: { available: "unknown", models: "unknown", request: "unsupported" },
			network: { egress: "open", control: "unsupported" },
			fork: { vendor: true, exposed: false },
			publicPorts: {
				model: "declared-at-create",
				// 14 is measured, not published: 15 (the published maximum) fails
				// with a 500 on every attempt, 14 creates fine.
				vendorMax: 14,
				muxMax: 3,
				fixed: [3000, 8642, 18789],
			},
			limits: {
				baseVcpu: 2,
				// Measured 2026-08-05: the vendor reports memory 4096 for the
				// default 2 vCPU and the guest has 4,283 MiB, so 4096 MiB is a
				// floor the machine holds. The old 3814 came from reading the
				// pricing page's "4 GB" as decimal, which the measurement refutes.
				baseMemoryMib: 4096,
				baseDiskGib: 29,
				// Hobby ceilings: this is the declaration for a credential that
				// proves no plan. A pro OIDC token raises these (see the
				// plan-claim tests in providers/vercel-claims.test.ts).
				maxVcpu: 4,
				maxMemoryMib: 8192,
				maxDiskGib: 29,
				maxRuntimeMs: 2_700_000,
				maxConcurrentSandboxes: 10,
				resourceRequest: "honored",
			},
		},
		dedalus: {
			pty: "tmux",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			streamingExec: false,
			detachedWork: "reliable",
			region: { default: "unknown", available: "unknown", select: "unknown" },
			// The vendor claims GPU/CUDA; no documented way to ask for one.
			gpu: { available: true, models: "unknown", request: "ignored" },
			network: { egress: "unknown", control: "unsupported" },
			fork: { vendor: "unknown", exposed: false },
			publicPorts: {
				model: "unknown",
				vendorMax: "unknown",
				muxMax: "unknown",
				fixed: null,
			},
			limits: {
				baseVcpu: "unknown",
				baseMemoryMib: "unknown",
				baseDiskGib: "unknown",
				maxVcpu: 4,
				maxMemoryMib: 16384,
				maxDiskGib: 10,
				maxRuntimeMs: "unknown",
				maxConcurrentSandboxes: 5,
				resourceRequest: "unknown",
			},
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
	assert.deepEqual(accepted({ pty: "tmux" }), [...ROUTE]);
	assert.deepEqual(accepted({ pty: "none" }), [...ROUTE]);
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

	assert.deepEqual(accepted({ persistence: "always-on" }), ["sprites", "dedalus"]);
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
	assert.deepEqual(accepted({ reattach: true, publicUrl: true }), [...ROUTE]);
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
	// Same for the new booleans: only `true` constrains anything.
	assert.deepEqual(accepted({ gpu: false, fork: false }), [...ROUTE]);
});

test("region: only a declared placement or an honored selector satisfies", () => {
	// Vercel is the one substrate that publishes where a sandbox lands.
	assert.deepEqual(accepted({ region: "iad1" }), ["vercel"]);

	const result = filterCandidates(realProfiles(), { region: "fra1" });
	assert.deepEqual(result.accepted, []);
	assert.equal(
		reasonFor(result, "vercel"),
		'region: requires "fra1", vercel places sandboxes in "iad1" (available "iad1") and region requests are unsupported',
	);
	// Proximity placement is not a region: Fly places a sprite "close to you"
	// and cannot be asked for one, so no region need is satisfiable there.
	assert.equal(
		reasonFor(result, "sprites"),
		'region: requires "fra1", sprites publishes no default region (available unknown) and region requests are unsupported',
	);
	assert.equal(
		reasonFor(result, "dedalus"),
		'region: requires "fra1", dedalus publishes no default region (available unknown) and region requests are unknown',
	);

	// A published list plus an honored selector is the only other pass.
	const selectable = fakeProfile("e2b", {
		region: { default: "iad1", available: ["iad1", "fra1"], select: "honored" },
	});
	assert.deepEqual(checkConstraints(selectable, { region: "fra1" }), []);
	assert.equal(
		checkConstraints(selectable, { region: "syd1" })[0].reason,
		'region: requires "syd1", e2b places sandboxes in "iad1" (available "iad1", "fra1") and region requests are honored',
	);
	// A selector we cannot prove is honored does not count, even with a list.
	const listedButIgnored = fakeProfile("e2b", {
		region: { default: "iad1", available: ["iad1", "fra1"], select: "ignored" },
	});
	assert.equal(checkConstraints(listedButIgnored, { region: "fra1" }).length, 1);
	// "unknown" is the model's absent value, not a region a caller can want.
	assert.deepEqual(accepted({ region: "unknown" }), []);
});

test("gpu: a vendor with accelerators still fails when we cannot ask for one", () => {
	const result = filterCandidates(realProfiles(), { gpu: true });
	assert.deepEqual(result.accepted, []);
	// Dedalus advertises GPU/CUDA, but its provision call takes no GPU field,
	// so routing a GPU run there would be a promise we cannot keep.
	assert.equal(
		reasonFor(result, "dedalus"),
		"gpu: required, dedalus reports GPU available=true and GPU requests are ignored",
	);
	assert.equal(
		reasonFor(result, "e2b"),
		"gpu: required, e2b reports GPU available=unknown and GPU requests are unsupported",
	);
	const failures = checkConstraints(realProfiles()[3], { gpu: true });
	assert.equal(failures[0].actual, "available true, gpu requests ignored");

	const honored = fakeProfile("dedalus", {
		gpu: { available: true, models: ["h100"], request: "honored" },
	});
	assert.deepEqual(checkConstraints(honored, { gpu: true }), []);
});

test("egress: a knob the adapter never forwards does not satisfy a posture", () => {
	assert.deepEqual(accepted({ egress: "open" }), ["e2b", "sprites", "vercel"]);
	const result = filterCandidates(realProfiles(), { egress: "blocked" });
	assert.deepEqual(result.accepted, []);
	// E2B *can* create a sandbox with no internet; this adapter passes no
	// network options, so an untrusted-code run must not be routed here.
	assert.equal(
		reasonFor(result, "e2b"),
		'egress: requires "blocked", e2b provides "open" and egress control is ignored',
	);
	assert.equal(
		reasonFor(result, "dedalus"),
		'egress: requires "blocked", dedalus provides unknown and egress control is unsupported',
	);

	const controllable = fakeProfile("e2b", {
		network: { egress: "open", control: "honored" },
	});
	assert.deepEqual(checkConstraints(controllable, { egress: "blocked" }), []);
});

test("fork: nothing satisfies it today, and the reason names the blocker", () => {
	const result = filterCandidates(realProfiles(), { fork: true });
	assert.deepEqual(result.accepted, []);
	assert.equal(
		reasonFor(result, "e2b"),
		"fork: required, e2b can fork but the mux exposes no fork operation",
	);
	assert.equal(
		reasonFor(result, "sprites"),
		"fork: required, sprites reports vendor fork=false and the mux exposes no fork operation",
	);
	assert.equal(
		reasonFor(result, "dedalus"),
		"fork: required, dedalus reports vendor fork=unknown and the mux exposes no fork operation",
	);
	const exposed = fakeProfile("e2b", { fork: { vendor: true, exposed: true } });
	assert.deepEqual(checkConstraints(exposed, { fork: true }), []);
});

test("minPublicPorts: any-port satisfies any count, a fixed port does not", () => {
	// E2B maps a URL per port on demand, so there is no count to compare.
	assert.deepEqual(accepted({ minPublicPorts: 9 }), ["e2b"]);
	assert.deepEqual(accepted({ minPublicPorts: 1 }), ["e2b", "sprites", "vercel"]);
	assert.deepEqual(accepted({ minPublicPorts: 3 }), ["e2b", "vercel"]);

	const result = filterCandidates(realProfiles(), { minPublicPorts: 4 });
	assert.deepEqual(result.accepted, ["e2b"]);
	assert.equal(
		reasonFor(result, "sprites"),
		"minPublicPorts: requires at least 4 public ports, sprites exposes 1 (only 8080)",
	);
	// The vendor allows 15; this adapter declares 3 at create time, so 3 is
	// what a run gets.
	assert.equal(
		reasonFor(result, "vercel"),
		"minPublicPorts: requires at least 4 public ports, vercel exposes 3 (only 3000, 8642, 18789)",
	);
	assert.equal(
		reasonFor(filterCandidates(realProfiles(), { minPublicPorts: 1 }), "dedalus"),
		"minPublicPorts: requires at least 1 public port, dedalus publishes no public port count (unknown)",
	);
});

test("minVcpu passes on the baseline and rejects with baseline and request state", () => {
	// e2b's measured baseline is 2 vCPU, so a floor of 2 needs no request.
	assert.deepEqual(accepted({ minVcpu: 2 }), ["e2b", "vercel"]);

	// 4 is ABOVE vercel's 2-vCPU baseline and vercel still passes, because its
	// resource request is measured honored (2026-08-05: a request for 8 vCPU
	// came up as 8) and 4 is inside the uncredentialed ceiling. e2b forwards no
	// size request, so the same floor loses it.
	const result = filterCandidates(realProfiles(), { minVcpu: 4 });
	assert.deepEqual(result.accepted, ["vercel"]);
	assert.equal(
		reasonFor(result, "e2b"),
		"minVcpu: requires at least 4 vCPU, e2b baseline is 2 vCPU and CreateSandboxOptions.resources is unknown on this substrate, so a larger size cannot be guaranteed",
	);
	// Past the ceiling the honored request stops helping, and the reason says
	// which number ran out.
	assert.equal(
		reasonFor(filterCandidates(realProfiles(), { minVcpu: 5 }), "vercel"),
		"minVcpu: requires at least 5 vCPU, vercel baseline is 2 vCPU and its ceiling is 4 vCPU",
	);
	// An unpublished baseline fails closed even for a floor of 1.
	assert.equal(
		reasonFor(filterCandidates(realProfiles(), { minVcpu: 1 }), "sprites"),
		"minVcpu: requires at least 1 vCPU, sprites publishes no baseline size and CreateSandboxOptions.resources is ignored on this substrate, so a larger size cannot be guaranteed",
	);
});

test("minVcpu carries the required and actual values for the dashboard", () => {
	const failures = checkConstraints(profileFor("e2b", declared("e2b")), {
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
	// Vercel's default 2 vCPU carries 4096 MiB: measured 2026-08-05, the vendor
	// reported memory 4096 and the guest's MemTotal was 4,386,564 kB (4,283
	// MiB), so 4096 MiB is a floor the machine really holds.
	assert.deepEqual(accepted({ minMemoryMib: 4096 }), ["vercel"]);
	// Above the baseline the honored size request carries it to the ceiling
	// (4 vCPU x 2048 MiB on the uncredentialed declaration), and no further.
	assert.deepEqual(accepted({ minMemoryMib: 8192 }), ["vercel"]);
	const strict = filterCandidates(realProfiles(), { minMemoryMib: 8193 });
	assert.deepEqual(strict.accepted, []);
	assert.equal(
		reasonFor(strict, "vercel"),
		"minMemoryMib: requires at least 8193 MiB, vercel baseline is 4096 MiB and its ceiling is 8192 MiB",
	);

	const result = filterCandidates(realProfiles(), { minMemoryMib: 512 });
	assert.deepEqual(result.accepted, ["vercel"]);
	assert.equal(
		reasonFor(result, "e2b"),
		"minMemoryMib: requires at least 512 MiB, e2b baseline is 478 MiB and CreateSandboxOptions.resources is unknown on this substrate, so a larger size cannot be guaranteed",
	);
});

test("minDiskGib uses the disk axis, not the resources request", () => {
	assert.deepEqual(accepted({ minDiskGib: 9 }), ["e2b", "sprites", "vercel"]);
	assert.deepEqual(accepted({ minDiskGib: 30 }), ["sprites"]);
	assert.deepEqual(accepted({ minDiskGib: 94 }), []);

	const result = filterCandidates(realProfiles(), { minDiskGib: 30 });
	// CreateSandboxOptions carries vcpu and memory only, so no substrate can be
	// asked for a bigger disk -- the reason must say that, not blame resources.
	assert.equal(
		reasonFor(result, "e2b"),
		"minDiskGib: requires at least 30 GiB, e2b baseline is 9 GiB and a disk-size request is unsupported on this substrate, so a larger size cannot be guaranteed",
	);
	assert.equal(
		reasonFor(result, "dedalus"),
		"minDiskGib: requires at least 30 GiB, dedalus publishes no baseline size and a disk-size request is unsupported on this substrate, so a larger size cannot be guaranteed",
	);
	// Dedalus publishes a 10 GiB tier ceiling but no default, so even a floor
	// inside the ceiling fails: the ceiling is unreachable without a request.
	assert.equal(
		checkConstraints(realProfiles()[3], { minDiskGib: 10 }).length,
		1,
	);
});

test("minConcurrency compares against the lowest published tier", () => {
	assert.deepEqual(accepted({ minConcurrency: 5 }), ["e2b", "vercel", "dedalus"]);
	assert.deepEqual(accepted({ minConcurrency: 20 }), ["e2b"]);
	assert.deepEqual(accepted({ minConcurrency: 21 }), []);

	const result = filterCandidates(realProfiles(), { minConcurrency: 20 });
	assert.equal(
		reasonFor(result, "vercel"),
		"minConcurrency: requires 20 concurrent sandboxes, vercel allows at most 10",
	);
	assert.equal(
		reasonFor(result, "dedalus"),
		"minConcurrency: requires 20 concurrent sandboxes, dedalus allows at most 5",
	);
	// Sprites returns concurrent_sprite_limit_exceeded, so a limit exists; Fly
	// publishes no number, and an unknown ceiling must not read as generous.
	assert.equal(
		reasonFor(filterCandidates(realProfiles(), { minConcurrency: 2 }), "sprites"),
		"minConcurrency: requires 2 concurrent sandboxes, sprites publishes no concurrency limit (unknown)",
	);
});

test("maxRuntimeMs accepts the documented ceiling exactly and rejects past it", () => {
	// e2b Base allows a 1-hour continuous run; vercel Hobby allows 45 minutes.
	assert.deepEqual(accepted({ maxRuntimeMs: 2_700_000 }), ["e2b", "vercel"]);
	assert.deepEqual(accepted({ maxRuntimeMs: 3_600_000 }), ["e2b"]);

	const result = filterCandidates(realProfiles(), { maxRuntimeMs: 3_600_001 });
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

test("an absent axis behaves exactly like an explicit unknown", () => {
	// This is what a test fake or an unresearched adapter looks like. Every
	// vendor-fact constraint must reject it -- optional fields are only safe
	// because absent means unknown means no.
	const bare = profileFor("e2b", BARE_CAPABILITIES);
	const cases: Array<[string, Parameters<typeof checkConstraints>[1]]> = [
		["region", { region: "iad1" }],
		["gpu", { gpu: true }],
		["egress", { egress: "open" }],
		["fork", { fork: true }],
		["minVcpu", { minVcpu: 1 }],
		["minMemoryMib", { minMemoryMib: 1 }],
		["minDiskGib", { minDiskGib: 1 }],
		["minPublicPorts", { minPublicPorts: 1 }],
		["minConcurrency", { minConcurrency: 1 }],
		["maxRuntimeMs", { maxRuntimeMs: 1 }],
	];
	for (const [key, constraints] of cases) {
		const failures = checkConstraints(bare, constraints);
		assert.equal(failures.length, 1, `${key} must reject an undeclared axis`);
		assert.equal(failures[0].constraint, key);
		assert.match(failures[0].reason, /unknown|unsupported|no default region/);
	}
	// The behavioral axes it DOES declare still work, so a bare record is
	// usable for unconstrained routing rather than being useless.
	assert.deepEqual(checkConstraints(bare, { pty: "native", reattach: true }), []);
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

test("failures are reported in one stable order across all twelve axes", () => {
	// The dashboard renders the first failure as the headline reason, so the
	// order is part of the contract rather than an implementation detail.
	const failures = checkConstraints(realProfiles()[1], {
		pty: "native",
		persistence: "memory-snapshot",
		region: "iad1",
		gpu: true,
		egress: "blocked",
		fork: true,
		minVcpu: 1,
		minMemoryMib: 1,
		minDiskGib: 1_000,
		minPublicPorts: 2,
		minConcurrency: 1,
		maxRuntimeMs: 1,
	});
	assert.deepEqual(
		failures.map((failure) => failure.constraint),
		[
			"persistence",
			"region",
			"gpu",
			"egress",
			"fork",
			"minVcpu",
			"minMemoryMib",
			"minDiskGib",
			"minPublicPorts",
			"minConcurrency",
			"maxRuntimeMs",
		],
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

test("profileFor carries the provider's own capabilities, overrides included", () => {
	assert.deepEqual(profileFor("e2b", declared("e2b")), {
		substrate: "e2b",
		capabilities: declared("e2b"),
	});
	// A caller (or a test) that overrides a limit changes the decision, which
	// is what makes the limits a routing input rather than documentation.
	const longer = fakeProfile("e2b", {}, { maxRuntimeMs: 86_400_000 });
	assert.deepEqual(checkConstraints(longer, { maxRuntimeMs: 86_400_000 }), []);
});

test("asSkippedAttempts surfaces the failed dimension, not just prose", () => {
	// A UI should not have to parse the joined reason string to say
	// "no native PTY", so the first failed key travels structurally.
	const filtered = filterCandidates([profileFor("vercel", declared("vercel"))], {
		pty: "native",
	});
	const skips = asSkippedAttempts(filtered.rejected);
	assert.equal(skips.length, 1);
	assert.equal(skips[0].constraint, "pty");
	assert.equal(skips[0].outcome, "skipped");
	assert.match(skips[0].reason, /pty/i);
});

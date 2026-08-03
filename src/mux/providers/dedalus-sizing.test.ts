/**
 * What Dedalus is actually asked for when a caller declares a size.
 *
 * This lane used to POST a constant spec, so a request for a bigger machine was
 * dropped without a word and the harness starved at run time. All three axes are
 * forwarded now -- disk included, since `CreateSandboxOptions.resources` carries
 * `diskGib` (ROADMAP 0.2 named the missing axis; adding it to the contract was
 * the alternative to Dedalus hardcoding a second source of truth).
 *
 * The clamps had no test at all before this file: the vendor's plan ceilings are
 * read off a pricing page, and a clamp that silently stopped clamping would show
 * up as a 4xx from the vendor rather than as a failing build.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createDedalusProvider } from "./dedalus.js";

const CREATED_AT = "2026-08-02T12:00:00.000Z";

/** Documented Hobby ceilings, https://www.dedaluslabs.ai/pricing. */
const HOBBY = { vcpu: 4, memoryMib: 16384, diskGib: 10 };
/** What provision() falls back to when the caller declares nothing. */
const DEFAULTS = { vcpu: 1, memory_mib: 2048, storage_gib: 10 };

type Body = { vcpu: number; memory_mib: number; storage_gib: number };

/**
 * Capture the create body, then fail the call: a provider that got as far as
 * POSTing /v1/machines has already told us everything this file asks about, and
 * stubbing the rest of the lifecycle would add fixture without adding proof.
 */
async function createBody(
	resources?: { vcpu?: number; memoryMib?: number; diskGib?: number },
): Promise<Body> {
	const original = globalThis.fetch;
	let captured: Body | null = null;
	globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
		const url = new URL(String(input));
		if (url.pathname === "/v1/machines" && (init?.method ?? "GET") === "POST") {
			captured = JSON.parse(String(init?.body)) as Body;
			return new Response(
				JSON.stringify({
					machine_id: "dm-1",
					...captured,
					created_at: CREATED_AT,
					desired_state: "running",
					status: { phase: "failed", reason: "stop here" },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}
		return new Response(null, { status: 500 });
	}) as typeof globalThis.fetch;
	try {
		const provider = createDedalusProvider({ apiKey: "test-key" });
		await provider.create({ resources }).catch(() => undefined);
	} finally {
		globalThis.fetch = original;
	}
	assert.ok(captured, "the provider never POSTed /v1/machines");
	return captured;
}

test("a declared size is forwarded on all three axes, not dropped", async () => {
	assert.deepEqual(await createBody({ vcpu: 2, memoryMib: 4096, diskGib: 8 }), {
		vcpu: 2,
		memory_mib: 4096,
		storage_gib: 8,
	});
});

test("an omitted axis falls back to the default rather than to zero", async () => {
	// Partial declarations are the common case: a harness that needs memory
	// should not have to restate the vCPU count to avoid a 0-core machine.
	assert.deepEqual(await createBody({ memoryMib: 4096 }), {
		vcpu: DEFAULTS.vcpu,
		memory_mib: 4096,
		storage_gib: DEFAULTS.storage_gib,
	});
	assert.deepEqual(await createBody({ diskGib: 5 }), {
		vcpu: DEFAULTS.vcpu,
		memory_mib: DEFAULTS.memory_mib,
		storage_gib: 5,
	});
	assert.deepEqual(await createBody(undefined), DEFAULTS);
});

test("a request above the plan ceiling is clamped, not rejected", async () => {
	// Clamped because an over-plan request is still satisfiable, just smaller,
	// and `capabilities.limits` already tells a caller what the ceiling is.
	// Failing here instead would turn a size preference into a routing failure.
	assert.deepEqual(await createBody({ vcpu: 64, memoryMib: 1_048_576, diskGib: 500 }), {
		vcpu: HOBBY.vcpu,
		memory_mib: HOBBY.memoryMib,
		storage_gib: HOBBY.diskGib,
	});
});

test("a request below the vendor's floor is raised to it", async () => {
	// 0 and negatives come from arithmetic upstream (a percentage of a budget,
	// a subtraction), not from someone typing them. The vendor would 4xx.
	const body = await createBody({ vcpu: 0, memoryMib: 1, diskGib: 0 });
	assert.equal(body.vcpu, 1);
	assert.equal(body.memory_mib, 512, "512 MiB is the documented minimum");
	assert.equal(body.storage_gib, 1);
});

test("fractional sizes are rounded, since the API takes integers", async () => {
	const body = await createBody({ vcpu: 2.4, memoryMib: 4096.6, diskGib: 7.5 });
	assert.equal(body.vcpu, 2);
	assert.equal(body.memory_mib, 4097);
	assert.equal(body.storage_gib, 8);
	for (const [axis, value] of Object.entries(body)) {
		assert.ok(Number.isInteger(value), `${axis} must be an integer, got ${value}`);
	}
});

test("the declared disk ceiling matches what the clamp enforces", async () => {
	// The capability record and the clamp are both transcriptions of the same
	// pricing page. If they disagree, one of them was edited alone.
	const provider = createDedalusProvider({ apiKey: "test-key" });
	assert.equal(provider.capabilities.limits?.maxDiskGib, HOBBY.diskGib);
	assert.equal(provider.capabilities.limits?.maxVcpu, HOBBY.vcpu);
	assert.equal(provider.capabilities.limits?.maxMemoryMib, HOBBY.memoryMib);
});

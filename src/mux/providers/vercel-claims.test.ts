/**
 * What the Vercel credential itself decides -- the plan-tiered ceilings, the
 * vCPU clamp derived from them, the all-or-none credential params that
 * `Sandbox.list` is subject to -- and what a size read reports back.
 *
 * Every expectation here was measured live on 2026-08-05 against
 * @vercel/sandbox 2.9.2 under OIDC auth (project agent-machines, plan pro):
 *
 *   - the OIDC JWT carries `plan` beside owner_id/project_id, and it said "pro"
 *   - a create asking for 8 vCPUs -- twice the published hobby maximum -- was
 *     accepted, and the machine reported vcpus 8 / memory 16384 with the guest
 *     seeing nproc 8 and MemTotal 17,043,048 kB (16,643 MiB)
 *   - `Sandbox.list({ projectId })` under OIDC threw "Missing credentials
 *     parameters to access the Vercel API: token, teamId", while
 *     `Sandbox.list({})` returned the project's sandboxes
 *
 * Run: npx tsx --test src/mux/providers/vercel-claims.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createVercelProvider } from "./vercel.js";
import type { SandboxProvider, SubstrateLimits } from "../types.js";

// ---------------------------------------------------------------------------
// A JWT with the measured claim shape. The ids are placeholders of the real
// LENGTH and prefix (team_ / prj_) -- the account's actual ids are not test
// data -- and every other claim key is the set the live token carried:
// aud, client_id, environment, exp, iat, iss, nbf, owner, owner_id, plan,
// project, project_id, scope, sub, user_id.
// ---------------------------------------------------------------------------

function base64url(value: string): string {
	return Buffer.from(value, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function oidcTokenWith(claims: Record<string, unknown>): string {
	const payload = {
		aud: "https://vercel.com/kl01s-projects",
		client_id: "vercel-sandbox-test",
		environment: "development",
		exp: 1_785_992_677,
		iat: 1_785_906_277,
		iss: "https://oidc.vercel.com/kl01s-projects",
		nbf: 1_785_906_277,
		owner: "kl01s-projects",
		owner_id: "team_00000000000000000000000",
		project: "agent-machines",
		project_id: "prj_00000000000000000000000000000",
		scope: "owner:kl01s-projects:project:agent-machines:environment:development",
		sub: "owner:kl01s-projects:project:agent-machines:environment:development",
		user_id: "user_0000000000000000000000000",
		...claims,
	};
	// Header content is never read by planOf; only the payload segment is.
	return `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
		JSON.stringify(payload),
	)}.signature-not-verified-locally`;
}

function limitsOf(provider: SandboxProvider): SubstrateLimits {
	const limits = provider.capabilities.limits;
	assert.ok(limits, "the vercel adapter must declare limits");
	return limits;
}

/**
 * authParams() bridges a configured oidcToken into process.env at call time, so
 * any test that reaches a vendor call must put the environment back.
 */
async function withCleanOidcEnv(body: () => Promise<void>): Promise<void> {
	const before = process.env.VERCEL_OIDC_TOKEN;
	delete process.env.VERCEL_OIDC_TOKEN;
	try {
		await body();
	} finally {
		if (before === undefined) delete process.env.VERCEL_OIDC_TOKEN;
		else process.env.VERCEL_OIDC_TOKEN = before;
	}
}

// ---------------------------------------------------------------------------
// Plan-tiered ceilings
// ---------------------------------------------------------------------------

test("a pro plan claim raises the ceilings the pricing page tiers", () => {
	const pro = limitsOf(
		createVercelProvider({ oidcToken: oidcTokenWith({ plan: "pro" }) }),
	);
	// Measured: 8 vCPU was accepted and came up as 8 with 16384 MiB.
	assert.equal(pro.maxVcpu, 8);
	assert.equal(pro.maxMemoryMib, 16_384);
	// Published Pro runtime limit (24 hours) and concurrency (2,000).
	assert.equal(pro.maxRuntimeMs, 86_400_000);
	assert.equal(pro.maxConcurrentSandboxes, 2_000);
	// The substrate's own facts do not move with the plan.
	assert.equal(pro.baseVcpu, 2);
	assert.equal(pro.baseMemoryMib, 4096);
	assert.equal(pro.maxDiskGib, 29);
	assert.equal(pro.resourceRequest, "honored");
});

test("a credential that proves no plan keeps the hobby ceilings", () => {
	const hobbyFigures = {
		maxVcpu: 4,
		maxMemoryMib: 8192,
		maxRuntimeMs: 2_700_000,
		maxConcurrentSandboxes: 10,
	};
	const cases: [string, SandboxProvider][] = [
		[
			"no plan claim at all",
			createVercelProvider({ oidcToken: oidcTokenWith({}) }),
		],
		[
			"an unrecognized plan name",
			createVercelProvider({ oidcToken: oidcTokenWith({ plan: "startup" }) }),
		],
		[
			"a non-string plan claim",
			createVercelProvider({ oidcToken: oidcTokenWith({ plan: 3 }) }),
		],
		[
			"an explicit hobby claim",
			createVercelProvider({ oidcToken: oidcTokenWith({ plan: "hobby" }) }),
		],
		[
			// The token triple carries no claims at all, so it can never tier up.
			"the token triple",
			createVercelProvider({ token: "vt", teamId: "team_x", projectId: "prj_x" }),
		],
		["no credentials", createVercelProvider({})],
		[
			// A vck_ key is an AI Gateway key, not Sandbox auth. Even if one
			// somehow carried a plan claim, it authenticates nothing here.
			"a gateway key in the OIDC slot",
			createVercelProvider({ oidcToken: `vck_${oidcTokenWith({ plan: "pro" })}` }),
		],
		["a token that is not a JWT", createVercelProvider({ oidcToken: "not.a.jwt" })],
	];
	for (const [label, provider] of cases) {
		const limits = limitsOf(provider);
		for (const [axis, expected] of Object.entries(hobbyFigures)) {
			assert.equal(
				limits[axis as keyof typeof hobbyFigures],
				expected,
				`${label}: ${axis} must stay at the hobby figure ${expected}`,
			);
		}
	}
});

test("an enterprise claim declares its concurrency unknown, not a guess", () => {
	const enterprise = limitsOf(
		createVercelProvider({ oidcToken: oidcTokenWith({ plan: "enterprise" }) }),
	);
	assert.equal(enterprise.maxVcpu, 32);
	assert.equal(enterprise.maxMemoryMib, 65_536);
	// The pricing page's concurrency table quotes only Hobby and Pro.
	assert.equal(enterprise.maxConcurrentSandboxes, "unknown");
});

// ---------------------------------------------------------------------------
// The clamp that rides on the ceiling
// ---------------------------------------------------------------------------

type CreateParams = Record<string, unknown>;

/** Records the params create/list receive; nothing else is exercised here. */
function recordingSandboxClass(): {
	statics: unknown;
	creates: CreateParams[];
	lists: CreateParams[];
} {
	const creates: CreateParams[] = [];
	const lists: CreateParams[] = [];
	const statics = {
		async getOrCreate(params: CreateParams) {
			creates.push(params);
			return { name: String(params["name"]), vcpus: 2, memory: 4096 };
		},
		async list(params: CreateParams) {
			lists.push(params);
			// The SDK is all-or-none about credential params: 1 or 2 of the three
			// present throws, none is legal (OIDC fills them in), three is legal.
			// Copied from dist/utils/get-credentials.js getCredentialsFromParams,
			// and this is the throw the live run hit on every list() call.
			const present = ["token", "teamId", "projectId"].filter(
				(key) => typeof params[key] === "string",
			);
			if (present.length > 0 && present.length < 3) {
				const missing = ["token", "teamId", "projectId"].filter(
					(key) => typeof params[key] !== "string",
				);
				throw new Error(
					`Missing credentials parameters to access the Vercel API: ${missing.join(", ")}`,
				);
			}
			return {
				async *[Symbol.asyncIterator]() {
					yield {
						name: "teal-fantastic-rattlesnake-aKndxS",
						status: "stopped",
						createdAt: 1_785_950_000_000,
					};
				},
			};
		},
	};
	return { statics, creates, lists };
}

test("the vCPU clamp follows the proven plan, both from vcpu and from memory", async () => {
	await withCleanOidcEnv(async () => {
		const asked = async (
			oidcToken: string,
			resources: { vcpu?: number; memoryMib?: number },
		): Promise<unknown> => {
			const { statics, creates } = recordingSandboxClass();
			const provider = createVercelProvider(
				{ oidcToken },
				statics as Parameters<typeof createVercelProvider>[1],
			);
			await provider.create({ name: "am-clamp", resources });
			return (creates[0] as { resources?: unknown }).resources;
		};
		const pro = oidcTokenWith({ plan: "pro" });
		const hobby = oidcTokenWith({ plan: "hobby" });

		// A pro credential's 8-vCPU request reaches the vendor intact. Clamping it
		// to 4 would hand the harness half the machine and report success.
		assert.deepEqual(await asked(pro, { vcpu: 8 }), { vcpus: 8 });
		// Memory-only requests derive the count at 2048 MiB per vCPU: 16,384 MiB
		// is the 8-vCPU machine, which is what the live create came up as.
		assert.deepEqual(await asked(pro, { memoryMib: 16_384 }), { vcpus: 8 });
		// Over the ceiling still clamps -- to the plan's ceiling, not to hobby's.
		assert.deepEqual(await asked(pro, { vcpu: 64 }), { vcpus: 8 });
		// The same request on hobby clamps to 4.
		assert.deepEqual(await asked(hobby, { vcpu: 8 }), { vcpus: 4 });
		assert.deepEqual(await asked(hobby, { memoryMib: 16_384 }), { vcpus: 4 });
		// Asking for nothing says nothing: taking the default is not requesting it.
		assert.equal(await asked(pro, {}), undefined);
	});
});

// ---------------------------------------------------------------------------
// list(): all-or-none credential params
// ---------------------------------------------------------------------------

test("list() sends no lone projectId, so OIDC-only auth can enumerate the lane", async () => {
	await withCleanOidcEnv(async () => {
		const { statics, lists } = recordingSandboxClass();
		const provider = createVercelProvider(
			{ oidcToken: oidcTokenWith({ plan: "pro" }) },
			statics as Parameters<typeof createVercelProvider>[1],
		);
		const infos = await provider.list();
		assert.equal(lists.length, 1);
		// The bug this replaces: a projectId derived from the JWT was passed on
		// its own, which is a partial triple and threw on every call.
		for (const key of ["token", "teamId", "projectId"]) {
			assert.equal(
				lists[0][key],
				undefined,
				`list() must pass no ${key} under OIDC auth: 1 or 2 of the three is a partial triple the SDK rejects`,
			);
		}
		assert.deepEqual(infos, [
			{
				id: "teal-fantastic-rattlesnake-aKndxS",
				name: "teal-fantastic-rattlesnake-aKndxS",
				state: "sleeping",
				substrate: "vercel",
				createdAt: new Date(1_785_950_000_000).toISOString(),
			},
		]);
	});
});

// ---------------------------------------------------------------------------
// describe(): both size axes the vendor reports, and only those
// ---------------------------------------------------------------------------

/** A Sandbox.get that answers with exactly the fields the vendor sends. */
function describingSandboxClass(sandbox: Record<string, unknown>): unknown {
	return {
		async get(params: { name: string; resume?: boolean }) {
			assert.equal(
				params.resume,
				false,
				"describe() must read at resume: false or it bills a parked sandbox",
			);
			return { name: params.name, ...sandbox };
		},
	};
}

test("describe() reports the vendor's memory as MiB alongside vCPU", async () => {
	// The 8-vCPU machine as the vendor actually described it on 2026-08-05.
	const provider = createVercelProvider(
		{ token: "vt", teamId: "team_x", projectId: "prj_x" },
		describingSandboxClass({
			status: "running",
			vcpus: 8,
			memory: 16_384,
			createdAt: new Date("2026-08-05T18:35:00.000Z"),
		}) as Parameters<typeof createVercelProvider>[1],
	);
	const described = await provider.describe!("am-probe3");
	// Exactly these two keys: diskGib is NOT filled from the 32 GB plan figure,
	// because the SDK exposes no per-sandbox disk number and an axis nothing
	// reported must stay absent (web/lib/providers/mux-facade.ts then renders it
	// as unknown instead of a size no vendor stated).
	assert.deepEqual(Object.keys(described.resources ?? {}).sort(), [
		"memoryMib",
		"vcpu",
	]);
	assert.deepEqual(described.resources, { vcpu: 8, memoryMib: 16_384 });
	assert.equal(described.state, "ready");
	assert.equal(described.rawPhase, "running");
});

test("describe() omits an axis the vendor did not report", async () => {
	const provider = createVercelProvider(
		{ token: "vt", teamId: "team_x", projectId: "prj_x" },
		describingSandboxClass({ status: "stopped", vcpus: 2 }) as Parameters<
			typeof createVercelProvider
		>[1],
	);
	const described = await provider.describe!("am-no-memory");
	assert.deepEqual(described.resources, { vcpu: 2 });
	assert.equal(described.state, "sleeping");
});

test("list() with the token triple sends all three, which is also legal", async () => {
	const { statics, lists } = recordingSandboxClass();
	const provider = createVercelProvider(
		{ token: "vt", teamId: "team_x", projectId: "prj_x" },
		statics as Parameters<typeof createVercelProvider>[1],
	);
	await provider.list();
	assert.deepEqual(
		{
			token: lists[0]["token"],
			teamId: lists[0]["teamId"],
			projectId: lists[0]["projectId"],
		},
		{ token: "vt", teamId: "team_x", projectId: "prj_x" },
	);
});

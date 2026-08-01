/**
 * Drift guard for the four control-plane substrates (ROADMAP 0.2).
 *
 * Each `createXSubstrate()` declares the capability record the facade routes
 * on, and the canonical declaration lives in `src/mux/providers/<kind>.ts`.
 * The web package cannot import mux *values* (see the mux-facade header), so
 * this reads the mux sources as text -- the pattern already used by
 * `lib/mux/capabilities.test.ts` -- and fails here if the two disagree.
 *
 * Only the six required axes are asserted. The optional vendor-fact axes
 * (region, gpu, network, fork, publicPorts, limits) are deliberately not
 * declared on this side: the mux reads an absent axis as unknown and fails
 * closed, which is the honest value for a fact this layer has not verified,
 * and `lib/mux/capabilities.ts` is where they are mirrored for the UI.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createDedalusSubstrate } from "./dedalus";
import { createE2bSubstrate } from "./e2b";
import { createSpritesSubstrate } from "./sprites";
import { createVercelSubstrate } from "./vercel";
import { type MuxSubstrate } from "./mux-facade";
import { MachineProviderError } from "./types";

const MUX_PROVIDERS = join(process.cwd(), "..", "src", "mux", "providers");

const SUBSTRATES: Array<{ kind: string; substrate: MuxSubstrate; credential: string }> = [
	{ kind: "e2b", substrate: createE2bSubstrate({}), credential: "E2B_API_KEY" },
	{ kind: "sprites", substrate: createSpritesSubstrate({}), credential: "SPRITES_TOKEN" },
	{ kind: "dedalus", substrate: createDedalusSubstrate({}), credential: "DEDALUS_API_KEY" },
];

describe("substrate capability declarations match the mux adapters", () => {
	for (const { kind, substrate } of [
		...SUBSTRATES,
		// Vercel resolves credentials from the environment, so build it with an
		// explicit triple rather than {} to keep the constructor off the env.
		{
			kind: "vercel",
			substrate: createVercelSubstrate({
				token: "tok",
				teamId: "team_1",
				projectId: "prj_1",
			}),
		},
	]) {
		it(`${kind} declares what src/mux/providers/${kind}.ts declares`, () => {
			const source = readFileSync(join(MUX_PROVIDERS, `${kind}.ts`), "utf8");
			const capabilities = substrate.capabilities;
			expect(source).toMatch(new RegExp(`pty:\\s*"${capabilities.pty}"`));
			expect(source).toMatch(
				new RegExp(`persistence:\\s*"${capabilities.persistence}"`),
			);
			expect(source).toMatch(new RegExp(`reattach:\\s*${String(capabilities.reattach)}`));
			expect(source).toMatch(new RegExp(`publicUrl:\\s*${String(capabilities.publicUrl)}`));
			expect(source).toMatch(
				new RegExp(`streamingExec:\\s*${String(capabilities.streamingExec)}`),
			);
			expect(source).toMatch(
				new RegExp(`detachedWork:\\s*"${capabilities.detachedWork}"`),
			);
		});
	}
});

describe("substrate credential gates", () => {
	for (const { kind, substrate, credential } of SUBSTRATES) {
		it(`${kind} reports the missing credential by name instead of throwing`, () => {
			// Fail closed the mux way: construction never throws, ready() names
			// what is missing, and the router skips the lane.
			expect(substrate.ready()).toEqual({ ok: false, missing: [credential] });
		});

		it(`${kind} refuses to create without credentials`, async () => {
			const error = await substrate.create({ name: "x" }).catch((err: unknown) => err);
			expect(error).toBeInstanceOf(MachineProviderError);
			expect((error as MachineProviderError).kind).toBe("missing_credentials");
		});
	}

	it("dedalus declares it cannot stream, so the facade omits streamExec", () => {
		// Keeps lib/dashboard/exec-stream.ts on its log-tail fallback for this
		// substrate, which is the behavior it has always had.
		expect(createDedalusSubstrate({}).capabilities.streamingExec).toBe(false);
	});
});

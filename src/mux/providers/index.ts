/**
 * Substrate provider factory. The only place that switches on
 * SubstrateKind -- adding a fifth substrate means one new module plus
 * one entry here (postmortem rule: no scattered provider lists).
 *
 * Vendor SDKs are imported lazily inside each adapter so consumers only
 * pay for the substrates they actually route to.
 */

import type { MuxConfig } from "../config.js";
import { MuxError, type SandboxProvider, type SubstrateKind } from "../types.js";
import { createE2bProvider } from "./e2b.js";
import { createSpritesProvider } from "./sprites.js";
import { createVercelProvider } from "./vercel.js";
import { createDedalusProvider } from "./dedalus.js";

export function getProvider(
	kind: SubstrateKind,
	config: MuxConfig,
): SandboxProvider {
	switch (kind) {
		case "e2b":
			return createE2bProvider(config.providers.e2b ?? {});
		case "sprites":
			return createSpritesProvider(config.providers.sprites ?? {});
		case "vercel":
			return createVercelProvider(config.providers.vercel ?? {});
		case "dedalus":
			return createDedalusProvider(config.providers.dedalus ?? {});
		default: {
			const exhaustive: never = kind;
			throw new MuxError("fatal", `Unknown substrate: ${String(exhaustive)}`);
		}
	}
}

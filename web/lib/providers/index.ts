/**
 * Provider factory.
 *
 * `getProvider(kind, creds)` returns a `MachineProvider` bound to a
 * user's credentials. Routes call this once per request rather than
 * holding instances long-lived; provider classes are stateless so the
 * cost is just the (cheap) constructor call.
 *
 * Since the ROADMAP 0.2 deletion every one of those classes is a facade over
 * the REAL mux provider (`agent-machines/mux/providers/<kind>`, behind the
 * conformance suite in src/mux/providers): `MachineProvider` is derived from
 * it by `./mux-facade`, so the state and error vocabularies are translated in
 * one place instead of four and the vendor code exists exactly once. The
 * credential gates below stay provider-agnostic -- each kind checks only its
 * own credentials, never Dedalus's (postmortem 2026-05-18, item 3).
 */

import type {
	ProviderCredentials,
	ProviderKind,
} from "@/lib/user-config/schema";

import { DedalusProvider } from "./dedalus";
import { E2BProvider } from "./e2b";
import { SpritesProvider } from "./sprites";
import { VercelProvider } from "./vercel";
import { MachineProviderError, type MachineProvider } from "./types";

export function getProvider(
	kind: ProviderKind,
	credentials: ProviderCredentials,
): MachineProvider {
	switch (kind) {
		case "dedalus": {
			const creds = credentials.dedalus;
			if (!creds?.apiKey) {
				throw new MachineProviderError(
					"dedalus",
					"missing_credentials",
					"No Dedalus API key on file. Add one via /dashboard/setup step 1.",
				);
			}
			return new DedalusProvider(creds);
		}
		case "e2b": {
			const creds = credentials.e2b;
			if (!creds?.apiKey) {
				throw new MachineProviderError(
					"e2b",
					"missing_credentials",
					"No E2B API key on file. Add one via /dashboard/setup or get one at e2b.dev/dashboard.",
				);
			}
			return new E2BProvider(creds);
		}
		case "sprites": {
			const creds = credentials.sprites;
			if (!creds?.apiKey) {
				throw new MachineProviderError(
					"sprites",
					"missing_credentials",
					"No Sprites token on file. Add one via /dashboard/setup or get one at sprites.dev/account.",
				);
			}
			return new SpritesProvider(creds);
		}
		case "vercel": {
			const creds = credentials.vercel;
			try {
				return new VercelProvider(creds ?? null);
			} catch (err) {
				if (err instanceof MachineProviderError) throw err;
				throw new MachineProviderError(
					"vercel",
					"missing_credentials",
					"No Vercel Sandbox credentials on file. Add token + team ID + project ID via /dashboard/setup, or deploy on Vercel with OIDC.",
				);
			}
		}
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unknown provider kind: ${String(exhaustive)}`);
		}
	}
}

export type {
	MachineProvider,
	MachineState,
	ProviderCapabilities,
	ProviderMachineSummary,
} from "./types";
export { MachineProviderError } from "./types";

// The single adaptation point. Since the ROADMAP 0.2 deletion the four
// substrates ARE the mux providers (value-imported from
// "agent-machines/mux/providers/*"), so there are no per-kind substrate
// factories left to re-export -- each adapter module is a thin binding.
export {
	asMachineProviderError,
	createMuxBackedProvider,
	muxErrorKindOf,
	notSupported,
	toMachineState,
	toMuxDescription,
	toMuxErrorKind,
	toMuxMachineState,
	toProviderCapabilities,
	toProviderError,
	type MuxDescription,
	type MuxSandbox,
	type MuxSubstrate,
	type MuxSubstrateBinding,
} from "./mux-facade";

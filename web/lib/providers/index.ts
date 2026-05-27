/**
 * Provider factory.
 *
 * `getProvider(kind, creds)` returns a `MachineProvider` bound to a
 * user's credentials. Routes call this once per request rather than
 * holding instances long-lived; provider classes are stateless so the
 * cost is just the (cheap) constructor call.
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

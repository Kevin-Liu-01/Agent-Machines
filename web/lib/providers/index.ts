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
import { FlyProvider } from "./fly";
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
		case "fly": {
			const creds = credentials.fly;
			if (!creds?.apiKey) {
				throw new MachineProviderError(
					"fly",
					"missing_credentials",
					"No Fly.io API token on file. Add one via /dashboard/setup step 1.",
				);
			}
			return new FlyProvider(creds);
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

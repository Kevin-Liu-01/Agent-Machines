/**
 * Build provider credentials + instances from environment variables.
 *
 * The dashboard pulls credentials from a user's Clerk config; the CLI
 * harness instead reads them from the environment (root `.env` or
 * `web/.env.local`) so it can run unattended. This keeps the script's
 * credential plumbing in one reusable place rather than inline.
 */

import { getProvider } from "@/lib/providers";
import type { MachineProvider } from "@/lib/providers/types";
import type {
	ProviderCredentials,
	ProviderKind,
} from "@/lib/user-config/schema";

/** Assemble whatever provider credentials are present in `process.env`. */
export function credentialsFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): ProviderCredentials {
	const creds: ProviderCredentials = {};

	if (env.DEDALUS_API_KEY) {
		creds.dedalus = {
			apiKey: env.DEDALUS_API_KEY,
			baseUrl: env.DEDALUS_BASE_URL,
		};
	}
	if (env.E2B_API_KEY) {
		creds.e2b = { apiKey: env.E2B_API_KEY };
	}
	const spritesKey = env.SPRITES_API_KEY ?? env.SPRITE_TOKEN;
	if (spritesKey) {
		creds.sprites = { apiKey: spritesKey };
	}
	if (env.VERCEL_TOKEN && env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID) {
		creds.vercel = {
			token: env.VERCEL_TOKEN,
			teamId: env.VERCEL_TEAM_ID,
			projectId: env.VERCEL_PROJECT_ID,
		};
	}

	return creds;
}

export type ResolvedProvider = {
	kind: ProviderKind;
	provider: MachineProvider | null;
	error: string | null;
};

/**
 * Resolve provider instances for the requested kinds, reporting which
 * ones lack credentials instead of throwing — the caller decides whether
 * a missing provider is fatal.
 */
export function providersFromEnv(
	kinds: readonly ProviderKind[],
	env: NodeJS.ProcessEnv = process.env,
): ResolvedProvider[] {
	const creds = credentialsFromEnv(env);
	return kinds.map((kind) => {
		try {
			return { kind, provider: getProvider(kind, creds), error: null };
		} catch (err) {
			return {
				kind,
				provider: null,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	});
}

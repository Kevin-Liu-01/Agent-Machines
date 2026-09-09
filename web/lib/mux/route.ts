/**
 * Resolve the sandbox route for a user the same way the mux router does:
 * primary first, then backups in order, dropping lanes whose credentials
 * are missing (fail closed -- never route to a provider we cannot
 * authenticate against).
 *
 * The mux reads credentials from a JSON file or env; the control plane
 * reads them from the user's config. This module is the adapter between
 * those two credential sources so the dashboard and the SDK agree on
 * which lane a machine would land on.
 *
 * The order computed here is WALKED by `lib/mux/failover.ts`, which the hosted
 * provisioning route drives (ROADMAP 0.3). Until that landed this module only
 * described a route nobody followed.
 */

import { substrateCapability, type SubstrateKind } from "@/lib/mux/capabilities";
import type { ProviderKind, UserConfig } from "@/lib/user-config/schema";

export type ResolvedRoute = {
	/** Ordered, credentialed lanes. Empty when nothing is configured. */
	route: SubstrateKind[];
	/** Lanes dropped for missing credentials, with what they need. */
	skipped: Array<{ substrate: SubstrateKind; missing: string[] }>;
};

/** Default preference order when the user has not pinned one. */
export const DEFAULT_ROUTE_ORDER: readonly SubstrateKind[] = [
	"e2b",
	"sprites",
	"vercel",
	"daytona",
];

function credentialsFor(
	kind: SubstrateKind,
	config: UserConfig,
): { ok: boolean; missing: string[] } {
	const providers = config.providers;
	switch (kind) {
		case "e2b":
			return providers.e2b?.apiKey
				? { ok: true, missing: [] }
				: { ok: false, missing: ["E2B_API_KEY"] };
		case "sprites":
			return providers.sprites?.apiKey
				? { ok: true, missing: [] }
				: { ok: false, missing: ["SPRITES_TOKEN"] };
		case "vercel": {
			// A hosted route must use this account's credentials. The deployment's
			// OIDC identity belongs to the host, not every person who signs up.
			const vercel = providers.vercel;
			if (vercel?.allowDeploymentCredentials === true && process.env.VERCEL_OIDC_TOKEN?.trim()) {
				return { ok: true, missing: [] };
			}
			const missing: string[] = [];
			if (!vercel?.token?.trim()) missing.push("VERCEL_TOKEN");
			if (!vercel?.teamId?.trim()) missing.push("VERCEL_TEAM_ID");
			if (!vercel?.projectId?.trim()) missing.push("VERCEL_PROJECT_ID");
			if (missing.length === 0) return { ok: true, missing: [] };
			return { ok: false, missing };
		}
		case "daytona":
			return providers.daytona?.apiKey?.trim()
				? { ok: true, missing: [] }
				: { ok: false, missing: ["DAYTONA_API_KEY"] };
		case "dedalus":
			return { ok: false, missing: ["Provider retired"] };
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unknown substrate: ${String(exhaustive)}`);
		}
	}
}

export function resolveRoute(
	config: UserConfig,
	options: {
		primary?: SubstrateKind;
		order?: readonly SubstrateKind[];
	} = {},
): ResolvedRoute {
	const base = options.order ?? DEFAULT_ROUTE_ORDER;
	const ordered = options.primary
		? [options.primary, ...base.filter((kind) => kind !== options.primary)]
		: [...base];

	const route: SubstrateKind[] = [];
	const skipped: ResolvedRoute["skipped"] = [];
	for (const kind of ordered) {
		const readiness = credentialsFor(kind, config);
		if (readiness.ok) route.push(kind);
		else skipped.push({ substrate: kind, missing: readiness.missing });
	}
	return { route, skipped };
}

/** Substrates that can host an interactive PTY without tmux emulation. */
export function nativePtyLanes(route: SubstrateKind[]): SubstrateKind[] {
	return route.filter((kind) => substrateCapability(kind).pty === "native");
}

/** ProviderKind and SubstrateKind are the same closed set, spelled alike. */
export function toSubstrateKind(kind: ProviderKind): SubstrateKind {
	return kind;
}

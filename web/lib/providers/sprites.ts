/**
 * Sprites.dev binding (ROADMAP 0.2): the vendor half lives in the mux.
 *
 * `src/mux/providers/sprites.ts` is the one Sprites adapter now -- the
 * execFileHTTP fast path with bounded transport retries, env staged as 0600
 * sourced-and-unlinked files (instead of riding the exec URL's query string,
 * where the SDK puts argv on both the HTTP and WS paths), execBackground via a
 * detached tmux session (a WS-spawned process dies with the connection and
 * Sprites throttles detached work -- measured 2026-08-01), the unique-name
 * rule (`onNameConflict: "unique"`, tested in sprites-naming.test.ts), and the
 * no-wake describe/remove pair. This module keeps only what is
 * hosted-plane-specific: the credential rename, the provision mapping, the
 * cache scope, one deliberate state-mapping override (below), and the
 * `SpritesProvider` class shape `lib/bootstrap/runner.ts` casts to.
 *
 * VALUE-imported through the compiled package ("agent-machines/mux/providers/
 * sprites") -- see the mux-facade header for the values-vs-types rule.
 *
 * Behavior shifts the deletion carries, decided rather than inherited (delta
 * report, 2026-08-03):
 *   - wake() is now a real wake (an exec probe under WAKE_TIMEOUT_MS=180s,
 *     src/mux/providers/sprites.ts) instead of an existence check. The wake
 *     route's maxDuration is 120s; measured cold starts are 17-31s, so the
 *     budget holds in practice, but a pathologically slow wake can now time
 *     the function out where it used to no-op.
 *   - a retried exec may re-run a side-effectful command after a transport
 *     timeout (documented caveat in the mux adapter); the first transport
 *     failure also widens the budget to cover a cold boot.
 *   - new sprites are named `am-mux-<label>-<suffix>` instead of
 *     `am-<label>-<rand>`; uniqueness intent is identical.
 *   - describe of a deleted sprite returns state "destroyed" instead of
 *     throwing transient, so the fleet list stops rendering deleted sprites
 *     as perpetual probe failures.
 *   - publicUrl answers only port 8080 (the one port the sprite URL proxies);
 *     the bootstrap runner passes 8080 for sprites (runner.ts), so the
 *     gateway path is unchanged and any other port honestly reads null.
 */

import { createSpritesProvider } from "agent-machines/mux/providers/sprites";

import {
	credentialScope,
	createMuxBackedProvider,
	requireNoWake,
	toMuxDescription,
	type MuxDescription,
	type MuxSubstrateBinding,
} from "./mux-facade";
import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type MachineProvider,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

export type SpritesCreds = {
	apiKey: string;
};

/**
 * Sprite-record statuses that mean "parked but answers the next request".
 * Kept in sync with the mux's own LIVE_STATUS measurement (2026-08-01):
 * "warm" answers an exec in ~60ms, "cold" boots first -- both auto-wake.
 */
const AUTO_WAKING_PHASE = /^(?:warm|cold)$/i;

function spritesBinding(creds: SpritesCreds): MuxSubstrateBinding {
	// RENAME at the boundary: the dashboard's config schema stores the Sprites
	// credential as `apiKey` (user-config/schema.ts ProviderCredentials); the
	// mux factory takes `token` (config.ts reads SPRITES_TOKEN). Same secret,
	// two field names -- mapped here and nowhere else.
	const provider = createSpritesProvider({ token: creds.apiKey });
	requireNoWake("sprites", "describe", provider.describe);
	requireNoWake("sprites", "remove", provider.remove);
	// No park() binding: the Sprites SDK has no suspend/pause (sprites
	// auto-suspend on their own schedule) and the mux omits the member rather
	// than stubbing a false claim. The facade's sleep fallback
	// (connect + handle.sleep()) is a state read on this substrate -- the same
	// no-op the deleted adapter always performed.
	return {
		kind: "sprites",
		substrate: provider,
		cacheScope: credentialScope([creds.apiKey]),
		describe: async (machineId): Promise<MuxDescription> => {
			const described = toMuxDescription(await provider.describe!(machineId));
			// DELIBERATE OVERRIDE, kept from the deleted adapter: the mux maps
			// warm/cold to "sleeping", which is honest for a router that wakes
			// before use -- but the dashboard's exec gate is state === "ready"
			// (lib/dashboard/exec.ts isMachineRunning), and sprites auto-wake on
			// the next exec/HTTP request. Reporting an idle sprite as sleeping
			// would flip every exec route to machine_offline and send
			// lib/storage/machine-fs.ts into a wake-then-retry loop (a real
			// 180s-budget wake now) where today the exec just runs. The raw
			// vendor word still reaches the UI via rawPhase.
			if (AUTO_WAKING_PHASE.test(described.rawPhase)) {
				return { ...described, state: "ready" };
			}
			return described;
		},
		remove: (machineId) => provider.remove!(machineId),
		createOptions: (input: ProvisionInput) => ({
			name: input.name,
			env: input.env,
			// A dashboard name is a LABEL, not an identity: two machines may
			// share one and must stay two sandboxes. The mux defaults to
			// adopt-by-name (an identity, which the CLI relies on), and adopting
			// here made two machines the same sprite -- docs/MUX-RESULTS.md
			// records the live failure ("sprite not found -- a concurrent run
			// destroyed the same deterministically-named sprite").
			onNameConflict: "unique" as const,
		}),
		// This adapter has always trimmed sprites output; the mux trims nothing,
		// so the flag still decides the exact bytes existing callers see.
		trimOutput: true,
	};
}

export class SpritesProvider implements MachineProvider {
	readonly kind = "sprites" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;

	constructor(creds: SpritesCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"sprites",
				"missing_credentials",
				"Sprites token is required for the Sprites provider.",
			);
		}
		this.facade = createMuxBackedProvider(spritesBinding(creds));
		this.capabilities = this.facade.capabilities;
	}

	get hasCredentials(): boolean {
		return this.facade.hasCredentials;
	}

	provision(input: ProvisionInput): Promise<ProvisionResult> {
		return this.facade.provision(input);
	}

	state(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.state(machineId);
	}

	wake(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.wake(machineId);
	}

	sleep(machineId: string): Promise<ProviderMachineSummary> {
		return this.facade.sleep(machineId);
	}

	destroy(machineId: string): Promise<void> {
		return this.facade.destroy(machineId);
	}

	exec(machineId: string, command: string, options?: ExecOptions): Promise<ExecResult> {
		return this.facade.exec(machineId, command, options);
	}

	execBackground(machineId: string, command: string): Promise<void> {
		return this.facade.execBackground!(machineId, command);
	}

	streamExec(
		machineId: string,
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		return this.facade.streamExec!(machineId, command, options);
	}

	getPublicUrl(machineId: string, port: number): Promise<string | null> {
		return this.facade.getPublicUrl!(machineId, port);
	}
}

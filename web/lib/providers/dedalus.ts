/**
 * Dedalus binding (ROADMAP 0.2): the vendor half lives in the mux.
 *
 * `src/mux/providers/dedalus.ts` is the one Dedalus adapter now -- the raw
 * REST surface (dual-auth headers, Idempotency-Key), the adaptive exec poll
 * (60ms x1.6 capped at 1s), the HMAC-gate workarounds (wake via a no-op
 * execution, sleep swallowing exactly the "internal route signature" 401),
 * the setsid/nohup execBackground launcher that stopped detached installs
 * dying at the 30s tracked-execution timeout, previews for public URLs, and
 * the no-wake describe/remove pair. This module keeps only what is
 * hosted-plane-specific: the credential gate message, the provision mapping
 * with its fail-closed disk rule (below), the cache scope, and the
 * `DedalusProvider` class shape (`createPreview` is feature-detected by
 * `lib/bootstrap/runner.ts`).
 *
 * VALUE-imported through the compiled package ("agent-machines/mux/providers/
 * dedalus") -- see the mux-facade header for the values-vs-types rule.
 *
 * Behavior shifts the deletion carries, decided rather than inherited (delta
 * report, 2026-08-03):
 *   - create() now BLOCKS until the machine runs (waitUntilReady, 240s budget)
 *     instead of returning after the POST; the provision route's maxDuration
 *     is 300s, so the budget holds, but the wizard's poll phase mostly
 *     completes inside provision now.
 *   - exec runs through `bash -lc` with env/cwd support (login shell; PATH may
 *     differ from the old bare `bash -c`), and provision env actually applies
 *     (per-exec) where the deleted adapter dropped it.
 *   - destroy of an unknown id resolves (idempotent remove) instead of
 *     throwing fatal; describe of an unknown id returns state "destroyed".
 *   - wake() keys off the mapped state, so placement_pending/accepted return
 *     quietly instead of throwing fatal.
 *   - vcpu/memory requests are clamped to the documented Hobby ceilings
 *     (4 vCPU / 16384 MiB) by the mux instead of being forwarded raw; disk
 *     keeps the stricter web-side refusal below.
 */

import { createDedalusProvider } from "agent-machines/mux/providers/dedalus";

import {
	credentialScope,
	createMuxBackedProvider,
	notSupported,
	requireNoWake,
	toMuxDescription,
	type MuxSubstrateBinding,
} from "./mux-facade";
import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type MachineProvider,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

/**
 * Documented Hobby-plan disk ceiling (https://www.dedaluslabs.ai/pricing, read
 * 2026-08-01 by the mux adapter; matches its HOBBY_MAX_DISK_GIB and the old
 * DEFAULT_MACHINE_SPEC.storageGib).
 */
const HOBBY_MAX_STORAGE_GIB = 10;

export type DedalusCreds = {
	apiKey: string;
	baseUrl?: string;
};

function dedalusBinding(creds: DedalusCreds): MuxSubstrateBinding {
	const provider = createDedalusProvider({
		apiKey: creds.apiKey,
		baseUrl: creds.baseUrl,
	});
	requireNoWake("dedalus", "describe", provider.describe);
	requireNoWake("dedalus", "remove", provider.remove);
	// No park() binding: POST /sleep is an HMAC-gated internal lifecycle route
	// (public keys 401 "missing internal route signature"), so the mux omits
	// park() rather than stubbing a false claim. The facade's sleep fallback
	// (connect + handle.sleep()) reaches the mux handle's sleep(), which
	// carries the identical 401-swallow-and-rely-on-autosleep behavior the
	// deleted adapter had.
	return {
		kind: "dedalus",
		substrate: provider,
		// baseUrl included: the same key against two deployments addresses two
		// different machine namespaces.
		cacheScope: credentialScope([creds.apiKey, creds.baseUrl]),
		describe: async (machineId) =>
			toMuxDescription(await provider.describe!(machineId)),
		remove: (machineId) => provider.remove!(machineId),
		createOptions: (input: ProvisionInput) => {
			const storageGib = input.spec?.storageGib;
			// The contract can carry the axis now (CreateSandboxOptions
			// .resources.diskGib -- the gap the old guard named is closed), but
			// the mux CLAMPS every axis to the documented Hobby ceilings
			// (src/mux/providers/dedalus.ts provision, disk 1..10 GiB), so a
			// 20 GiB request would silently come up as 10. This adapter has
			// always refused to shrink the machine behind the user's back, so a
			// request the clamp would cut is rejected here, before any vendor
			// call.
			if (storageGib !== undefined && storageGib > HOBBY_MAX_STORAGE_GIB) {
				throw notSupported(
					"dedalus",
					`a ${storageGib} GiB disk: the Dedalus Hobby plan tops out at ${HOBBY_MAX_STORAGE_GIB} GiB, and provisioning refuses to silently shrink the request`,
				);
			}
			return {
				name: input.name,
				env: input.env,
				resources: {
					vcpu: input.spec?.vcpu,
					memoryMib: input.spec?.memoryMib,
					diskGib: storageGib,
				},
			};
		},
		// This adapter has always trimmed dedalus output. The mux handle trims
		// its own exec() too, so the facade trim is idempotent -- kept so the
		// flag, not the mux internals, stays the documented source of truth for
		// the bytes existing callers see.
		trimOutput: true,
	};
}

export class DedalusProvider implements MachineProvider {
	readonly kind = "dedalus" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;

	constructor(creds: DedalusCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"dedalus",
				"missing_credentials",
				"DEDALUS_API_KEY is required to talk to the Dedalus provider.",
			);
		}
		this.facade = createMuxBackedProvider(dedalusBinding(creds));
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

	/**
	 * Dedalus-native preview URL. `lib/bootstrap/runner.ts` feature-detects
	 * this (`"createPreview" in provider`) before falling back to exec-only
	 * gateway access, so it stays on the public surface. The implementation is
	 * the mux handle's publicUrl (the same list-then-create against
	 * /previews), reached through the facade so previews ride the same
	 * per-credential handle cache as every other call.
	 */
	createPreview(machineId: string, port: number): Promise<string | null> {
		return this.facade.getPublicUrl!(machineId, port);
	}
}

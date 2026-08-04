/**
 * E2B binding (ROADMAP 0.2): the vendor half lives in the mux.
 *
 * `src/mux/providers/e2b.ts` is the one E2B adapter now -- SDK loading
 * (including the load-bearing `e2b/dist/index.mjs` ESM entry; that file's
 * header carries the full ERR_REQUIRE_ESM account and the three guards), the
 * base64 bash wrapper, the error taxonomy, and the no-wake
 * describe/remove/park trio, all behind the conformance suite
 * (src/mux/providers/conformance.test.ts). This module keeps only what is
 * hosted-plane-specific:
 *
 *   - the credential gate with the dashboard's own message,
 *   - the ProvisionInput -> CreateSandboxOptions mapping (HOME pinned, agent
 *     env, the 1h provision lifetime),
 *   - the per-credential cache scope for the facade's connected-handle cache,
 *   - the `E2BProvider` class shape `lib/bootstrap/runner.ts` casts to.
 *
 * VALUE-imported through the compiled package ("agent-machines/mux/providers/
 * e2b"): Turbopack resolves only dist/ for values -- see the mux-facade header
 * for the two-path rule (measured 2026-08-02; the `./mux/*` export wildcard
 * crossing the slash was measured against a packed tarball 2026-08-03).
 *
 * Two deliberate behavior shifts the deletion carries, decided rather than
 * inherited (delta report, 2026-08-03):
 *   - destroy of an already-gone sandbox now resolves instead of throwing
 *     fatal (mux remove() swallows the 404 -- POSTMORTEM-2026-05-18 item 5's
 *     orphaned-quota rule), and describe of an unknown id returns
 *     state "destroyed" instead of throwing.
 *   - auth failures at runtime classify as `fatal` ("check E2B_API_KEY"
 *     hinted) rather than `missing_credentials`; the missing_credentials kind
 *     now only ever comes from the ready()/getProvider gates, which is what
 *     the setup-page copy keys off.
 */

import { createE2bProvider } from "agent-machines/mux/providers/e2b";

import {
	credentialScope,
	createMuxBackedProvider,
	requireNoWake,
	toMuxDescription,
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

/**
 * Sandbox lifetime requested at provision; bootstrap alone runs ~150s. Binding-
 * side on purpose: the mux default is 300_000 (src/mux/providers/e2b.ts), which
 * would park a machine mid-bootstrap.
 */
const PROVISION_TIMEOUT_MS = 3_600_000;

export type E2BCreds = {
	apiKey: string;
};

function e2bBinding(creds: E2BCreds): MuxSubstrateBinding {
	const provider = createE2bProvider({ apiKey: creds.apiKey });
	requireNoWake("e2b", "describe", provider.describe);
	requireNoWake("e2b", "park", provider.park);
	requireNoWake("e2b", "remove", provider.remove);
	return {
		kind: "e2b",
		substrate: provider,
		cacheScope: credentialScope([creds.apiKey]),
		describe: async (machineId) =>
			toMuxDescription(await provider.describe!(machineId)),
		park: (machineId) => provider.park!(machineId),
		remove: (machineId) => provider.remove!(machineId),
		createOptions: (input: ProvisionInput) => ({
			name: input.name ?? "agent-machine",
			timeoutMs: PROVISION_TIMEOUT_MS,
			// HOME is pinned because the bootstrap runner writes its whole tree
			// under $HOME; this is E2B's own default user home, kept explicit so
			// a sandbox image change cannot silently relocate the bootstrap.
			env: {
				HOME: "/home/user",
				AGENT_KIND: input.agentKind ?? "hermes",
				AGENT_MODEL: input.model ?? "",
				...(input.env ?? {}),
			},
			resources: { vcpu: input.spec?.vcpu, memoryMib: input.spec?.memoryMib },
		}),
		// e2b has never trimmed exec output, and the mux adapter trims nothing
		// either: byte-exact both before and after the deletion.
		trimOutput: false,
	};
}

/**
 * `MachineProvider` for E2B: a facade over the mux provider. Kept as a class
 * with the same constructor and `getPublicUrl(): Promise<string>` signature
 * because `lib/bootstrap/runner.ts` casts to this type.
 */
export class E2BProvider implements MachineProvider {
	readonly kind = "e2b" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;

	constructor(creds: E2BCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"e2b",
				"missing_credentials",
				"E2B_API_KEY is required for the E2B provider.",
			);
		}
		this.facade = createMuxBackedProvider(e2bBinding(creds));
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

	/** Never null on E2B: the host is derived from the sandbox id. */
	async getPublicUrl(machineId: string, port: number): Promise<string> {
		const url = await this.facade.getPublicUrl!(machineId, port);
		if (url === null) {
			throw new MachineProviderError(
				"e2b",
				"transient",
				`e2b returned no public URL for ${machineId}:${port}`,
			);
		}
		return url;
	}
}

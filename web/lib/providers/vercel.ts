/**
 * Vercel Sandbox binding (ROADMAP 0.2): the vendor half lives in the mux.
 *
 * `src/mux/providers/vercel.ts` is the one Vercel adapter now -- status
 * mapping, the vck_ AI-Gateway key rejection, and the no-wake
 * describe/remove/park trio proven (by VendorSpy in the conformance suite) to
 * only ever call `Sandbox.get` with `resume: false`. This module keeps only
 * what is hosted-plane-specific: the env-triple fallback, the OIDC rule
 * (below), the provision mapping, the cache scope, and the `VercelProvider`
 * class shape `lib/bootstrap/runner.ts` casts to.
 *
 * VALUE-imported through the compiled package ("agent-machines/mux/providers/
 * vercel") -- see the mux-facade header for the values-vs-types rule.
 *
 * Behavior shifts the deletion carries, decided rather than inherited (delta
 * report, 2026-08-03; note this lane has never run live on either side --
 * both adapters were written from SDK/doc reading):
 *   - sleep is a real park now: read at resume:false, stop only when a session
 *     is running. The deleted adapter RESUMED a stopped sandbox to stop it.
 *   - destroy swallows only a genuine not-found; the deleted adapter swallowed
 *     EVERY fatal-kind error, so a 403 read as a successful destroy and leaked
 *     quota.
 *   - describe is `Sandbox.get({resume:false})` only. The deleted adapter had
 *     a `Sandbox.list` name-prefix fallback when get failed; nothing recorded
 *     why it existed, so if get-by-name genuinely fails for some live
 *     sandboxes this regresses them -- flagged as an unknown, not silently
 *     preserved, because unexplained fallbacks are how defects hide.
 *   - default sizing: an unsized provision now takes the vendor default
 *     (2 vCPU) instead of an explicit 1; memory joins the derivation
 *     (2048 MiB per vCPU) and the ceiling is the documented Hobby 4, down
 *     from a speculative 8. Port 3000 is newly declared alongside 8642/18789.
 */

import { createVercelProvider } from "agent-machines/mux/providers/vercel";

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

/** Session auto-terminate window; persistence survives it via snapshots. */
const DEFAULT_SESSION_TIMEOUT_MS = 3_600_000;

export type VercelCreds = {
	token: string;
	teamId: string;
	projectId: string;
};

function readEnvCredentials(): VercelCreds | null {
	const token = process.env.VERCEL_TOKEN?.trim();
	const teamId = process.env.VERCEL_TEAM_ID?.trim();
	const projectId = process.env.VERCEL_PROJECT_ID?.trim();
	if (token && teamId && projectId) {
		return { token, teamId, projectId };
	}
	return null;
}

function hasOidcCredentials(): boolean {
	return Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
}

function vercelBinding(creds: VercelCreds | null): MuxSubstrateBinding {
	const resolved = creds ?? readEnvCredentials();
	// oidcToken comes EXCLUSIVELY from this process's own environment, never
	// from per-user config: the mux bridges a configured oidcToken into
	// process.env.VERCEL_OIDC_TOKEN at call time (authParams in
	// src/mux/providers/vercel.ts), and process env is process-GLOBAL -- on a
	// warm serverless instance serving many tenants, the first user's token
	// would win for every user. Passing only the process's own value makes the
	// bridge a no-op (the value is already there) and keeps any user-supplied
	// token out of cross-tenant reach.
	const oidcToken = process.env.VERCEL_OIDC_TOKEN;
	const provider = createVercelProvider({
		token: resolved?.token,
		teamId: resolved?.teamId,
		projectId: resolved?.projectId,
		oidcToken,
	});
	requireNoWake("vercel", "describe", provider.describe);
	requireNoWake("vercel", "park", provider.park);
	requireNoWake("vercel", "remove", provider.remove);
	return {
		kind: "vercel",
		substrate: provider,
		// All three, plus the OIDC token: a machine id is only unique within the
		// project that owns it, and OIDC vs token-triple are different identities.
		cacheScope: credentialScope([
			resolved?.token,
			resolved?.teamId,
			resolved?.projectId,
			oidcToken,
		]),
		describe: async (machineId) =>
			toMuxDescription(await provider.describe!(machineId)),
		park: (machineId) => provider.park!(machineId),
		remove: (machineId) => provider.remove!(machineId),
		createOptions: (input: ProvisionInput) => ({
			name: input.name,
			timeoutMs: DEFAULT_SESSION_TIMEOUT_MS,
			// HOME is pinned because the bootstrap runner writes its whole tree
			// under $HOME, and this is NOT the vendor's default home -- the claim
			// that it was is wrong. Measured on a live sandbox 2026-08-05: the
			// node24 runtime runs as `vercel-sandbox` (uid 1000) with
			// HOME=/home/vercel-sandbox (mode 700) and cwd=/vercel/sandbox (755);
			// both are writable and both survive a park/wake snapshot.
			//
			// The pin OVERRIDES that default on purpose: machineHomeForProvider
			// ("vercel") is /vercel/sandbox in lib/storage/machine-paths.ts, and
			// lib/bootstrap/{runner,bootstrap-repair,bootstrap-log,
			// gateway-lifecycle}.ts each hardcode the same path. If $HOME were the
			// vendor default while those stayed put, the runner would write its
			// tree to /home/vercel-sandbox while repair and the log reader looked
			// in /vercel/sandbox and found an empty directory. bindings.test.ts
			// asserts the pin and machineHomeForProvider agree, so they cannot
			// drift apart in either direction.
			env: {
				HOME: "/vercel/sandbox",
				AGENT_KIND: input.agentKind ?? "hermes",
				AGENT_MODEL: input.model ?? "",
				...(input.env ?? {}),
			},
			resources: { vcpu: input.spec?.vcpu, memoryMib: input.spec?.memoryMib },
		}),
		// vercel has never trimmed exec output, and the mux adapter trims
		// nothing either: byte-exact both before and after the deletion.
		trimOutput: false,
	};
}

export class VercelProvider implements MachineProvider {
	readonly kind = "vercel" as const;
	readonly capabilities: ProviderCapabilities;
	private readonly facade: MachineProvider;

	constructor(creds?: VercelCreds | null) {
		const resolved = creds ?? readEnvCredentials();
		if (!resolved && !hasOidcCredentials()) {
			throw new MachineProviderError(
				"vercel",
				"missing_credentials",
				"Vercel Sandbox credentials required: set token + teamId + projectId, or run on Vercel with OIDC.",
			);
		}
		this.facade = createMuxBackedProvider(vercelBinding(resolved));
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

	/**
	 * Never null on Vercel for a declared port: the domain is derived from the
	 * sandbox name. The mux returns null (instead of throwing) for a port that
	 * was not declared at create time, so the throw here now names that case.
	 */
	async getPublicUrl(machineId: string, port: number): Promise<string> {
		const url = await this.facade.getPublicUrl!(machineId, port);
		if (url === null) {
			throw new MachineProviderError(
				"vercel",
				"transient",
				`vercel returned no public URL for ${machineId}:${port} (was the port declared at create time?)`,
			);
		}
		return url;
	}
}

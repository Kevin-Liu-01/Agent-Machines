/**
 * One provider contract (ROADMAP 0.2).
 *
 * The control plane used to speak `MachineProvider` and the mux spoke
 * `SandboxProvider`, with four vendors implemented against each. This module
 * makes `MachineProvider` a *facade*: every web adapter now exposes the mux
 * substrate shape (`MuxSubstrate`, a slice of `src/mux/types.ts`
 * `SandboxProvider`) and `createMuxBackedProvider` is the single place that
 * translates it back into the `MachineProvider` the dashboard consumes.
 *
 * TWO WAYS this file reaches the mux, and the rule for choosing:
 *
 * - `../../../src/mux/types.js` -- TYPES ONLY. SWC erases these before Turbopack
 *   sees them, so the contract is checked against the real source with no
 *   bundling cost and no build order to get wrong. A *value* on this path does
 *   not build: Turbopack applies no `.js` -> `.ts` extension alias anywhere in
 *   this project (measured 2026-08-02, ROADMAP 3c -- proven by a `./helper.js`
 *   import of a same-directory `helper.ts` inside `web/` failing too), and every
 *   ESM specifier in `src/mux` carries `.js`.
 * - `agent-machines/mux/types` -- VALUES. The compiled `dist/` is the only form
 *   Turbopack resolves, so a runtime value has to come through the built
 *   package. That makes `build:sdk` a build-order dependency of `next build`;
 *   the root `build` script runs it first, which is the sequence the deploy uses.
 *
 * So: reach for the source path for types, the package for values, and never the
 * reverse. `lib/mux/failover.ts` and `lib/mux/placement-store.ts` are type-only
 * and stay that way -- a test in each asserts it.
 *
 * Vocabulary is mapped in BOTH directions with exhaustive switches. The two
 * `MachineState` unions and the two error taxonomies happen to have identical
 * members today; the switches exist so that adding a member on either side is
 * a compile error instead of a silent `unknown`/`fatal` that would break the
 * dashboard's fail-closed behavior.
 */

import { MUX_ERROR_NAME, isMuxErrorKind } from "agent-machines/mux/types";

import type {
	CreateSandboxOptions,
	MachineState as MuxMachineState,
	MuxErrorKind,
	SandboxCapabilities,
	SandboxHandle,
	SandboxProvider,
} from "../../../src/mux/types.js";
import type { MachineSpec, ProviderKind } from "@/lib/user-config/schema";

/**
 * Re-exported so the substrate adapters have one crossing point to the mux
 * contract instead of four. These are all type-only: erased before Turbopack.
 */
export type {
	CreateSandboxOptions as MuxCreateSandboxOptions,
	ExecOptions as MuxExecOptions,
	ExecResult as MuxExecResult,
	ExecStreamEvent as MuxExecStreamEvent,
	ExecStreamOptions as MuxExecStreamOptions,
	MachineState as MuxMachineState,
	MuxErrorKind,
	SandboxCapabilities as MuxSandboxCapabilities,
} from "../../../src/mux/types.js";

import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type MachineProvider,
	type MachineState,
	type ProviderCapabilities,
	type ProviderError,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

/** Web-side exec default, kept at 30s (the mux adapters default to 60-120s). */
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

/**
 * The slice of the mux `SandboxHandle` the control plane actually drives. PTY,
 * writeFile, keepAlive and list are deliberately absent: the dashboard reaches
 * terminals through tmux-over-exec (`lib/dashboard/terminal-session.ts`), so
 * declaring them here would oblige every adapter to implement capability the
 * control plane never calls.
 */
export type MuxSandbox = Pick<
	SandboxHandle,
	| "id"
	| "exec"
	| "execStream"
	| "execBackground"
	| "publicUrl"
	| "state"
	| "sleep"
	| "wake"
	| "destroy"
>;

/** The slice of the mux `SandboxProvider` the control plane actually drives. */
export type MuxSubstrate = Pick<SandboxProvider, "kind" | "capabilities" | "ready"> & {
	create(options?: CreateSandboxOptions): Promise<MuxSandbox>;
	connect(id: string): Promise<MuxSandbox>;
};

/**
 * Compile-time proof that a real `src/mux/providers/*` provider satisfies the
 * slice above, so 0.3 can substitute them without touching this facade. If
 * the mux contract drifts, this line fails `tsc` rather than failing at run
 * time in production.
 */
export type MuxProviderSatisfiesSlice = SandboxProvider extends MuxSubstrate
	? true
	: never;
export const MUX_PROVIDER_SATISFIES_SLICE: MuxProviderSatisfiesSlice = true;

/**
 * A status read that does not wake a parked machine, plus the three fields
 * `ProviderMachineSummary` needs that the mux contract cannot express.
 *
 * CONTRACT GAP (report to the src/mux owner): `SandboxProvider` can only
 * reach a machine's state through `connect(id)` + `handle.state()`, and
 * `connect` resumes a paused sandbox on e2b (`Sandbox.connect`) and vercel
 * (`Sandbox.get({ resume: true })`). The dashboard polls state on every fleet
 * render, so delegating there would silently un-sleep every parked sandbox
 * and bill for it. The mux also has no vendor phase string, no live sizing
 * and no last-error field. Until `SandboxProvider` grows a no-wake
 * `describe(id)`, each adapter supplies it here.
 */
export type MuxDescription = {
	state: MuxMachineState;
	/** Vendor phase verbatim ("warm", "wake_pending", "snapshotting", ...). */
	rawPhase: string;
	spec: MachineSpec;
	createdAt: string | null;
	lastError: string | null;
};

export type MuxSubstrateBinding = {
	readonly kind: ProviderKind;
	readonly substrate: MuxSubstrate;
	/** No-wake status read; see `MuxDescription` for why it lives here. */
	describe(machineId: string): Promise<MuxDescription>;
	/**
	 * Park / remove addressed by id. Supplied only where going through
	 * `connect(id)` would resume a parked machine first (see MuxDescription).
	 */
	park?(machineId: string): Promise<void>;
	remove?(machineId: string): Promise<void>;
	/** Map the control plane's provision request onto mux create options. */
	createOptions(input: ProvisionInput): CreateSandboxOptions;
	/**
	 * Whether exec output is whitespace-trimmed. Per-substrate because each
	 * adapter has always behaved this way (sprites and dedalus trim, e2b and
	 * vercel do not) and changing it would alter what every existing caller
	 * sees. It is no longer load-bearing for correctness: machine-fs.ts used
	 * to compare stdout to a sentinel string, which meant a missing file read
	 * as content on the untrimmed lanes; absence is now an exit code. Unifying
	 * the trim is still worth doing, but it is a behavior change, not a fix.
	 */
	readonly trimOutput: boolean;
	/**
	 * Opaque per-credential scope for the connected-handle cache. Build it with
	 * `credentialScope([...])` from whatever the provider authenticates with. See
	 * `handleCache`: without this, one warm instance can hand one tenant's
	 * authenticated handle to another.
	 */
	readonly cacheScope: string;
	readonly defaultExecTimeoutMs?: number;
	readonly defaultStreamTimeoutMs?: number;
};

/** mux state -> control-plane state. Exhaustive: a new member must be mapped. */
export function toMachineState(state: MuxMachineState): MachineState {
	switch (state) {
		case "ready":
			return "ready";
		case "starting":
			return "starting";
		case "sleeping":
			return "sleeping";
		case "destroying":
			return "destroying";
		case "destroyed":
			return "destroyed";
		case "error":
			return "error";
		case "unknown":
			return "unknown";
		default: {
			const exhaustive: never = state;
			throw new Error(`Unmapped mux machine state: ${String(exhaustive)}`);
		}
	}
}

/** control-plane state -> mux state. Exhaustive in the other direction. */
export function toMuxMachineState(state: MachineState): MuxMachineState {
	switch (state) {
		case "ready":
			return "ready";
		case "starting":
			return "starting";
		case "sleeping":
			return "sleeping";
		case "destroying":
			return "destroying";
		case "destroyed":
			return "destroyed";
		case "error":
			return "error";
		case "unknown":
			return "unknown";
		default: {
			const exhaustive: never = state;
			throw new Error(`Unmapped machine state: ${String(exhaustive)}`);
		}
	}
}

/** MuxError kind -> MachineProviderError kind. */
export function toProviderError(kind: MuxErrorKind): ProviderError {
	switch (kind) {
		case "missing_credentials":
			return "missing_credentials";
		case "not_supported":
			return "not_supported";
		case "rate_limited":
			return "rate_limited";
		case "transient":
			return "transient";
		case "fatal":
			return "fatal";
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unmapped mux error kind: ${String(exhaustive)}`);
		}
	}
}

/** MachineProviderError kind -> MuxError kind. */
export function toMuxErrorKind(kind: ProviderError): MuxErrorKind {
	switch (kind) {
		case "missing_credentials":
			return "missing_credentials";
		case "not_supported":
			return "not_supported";
		case "rate_limited":
			return "rate_limited";
		case "transient":
			return "transient";
		case "fatal":
			return "fatal";
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unmapped provider error kind: ${String(exhaustive)}`);
		}
	}
}

/**
 * Recover a MuxError's kind structurally rather than with `instanceof`.
 *
 * WHY structural, now that the class IS importable: an error that crossed a
 * package boundary can fail `instanceof` against a second copy of the class --
 * and this facade exists to receive errors from exactly that direction. Matching
 * on `name` + a known `kind` survives it. Losing the taxonomy would downgrade
 * every `missing_credentials` to `transient` and make the dashboard retry a
 * request that can never succeed.
 *
 * The name and the kind list come from the mux as VALUES
 * (`agent-machines/mux/types`), not as a hand-copy. They used to be copied here,
 * which meant a sixth kind added upstream would silently read as "not a
 * MuxError" and take the retry-forever path this function exists to prevent.
 */
export function muxErrorKindOf(error: unknown): MuxErrorKind | null {
	if (!error || typeof error !== "object") return null;
	const candidate = error as { name?: unknown; kind?: unknown };
	if (candidate.name !== MUX_ERROR_NAME) return null;
	return isMuxErrorKind(candidate.kind) ? candidate.kind : null;
}

/**
 * Wrap any thrown value as a MachineProviderError with the kind preserved.
 * Unclassifiable failures become `transient`, which is what every web adapter
 * has always done for an unrecognized vendor error -- `fatal` would stop the
 * bootstrap runner from retrying a network blip.
 */
export function asMachineProviderError(
	kind: ProviderKind,
	operation: string,
	machineId: string | null,
	error: unknown,
): MachineProviderError {
	if (error instanceof MachineProviderError) return error;
	const muxKind = muxErrorKindOf(error);
	const message = error instanceof Error ? error.message : String(error);
	const target = machineId ? ` on ${machineId}` : "";
	return new MachineProviderError(
		kind,
		muxKind ? toProviderError(muxKind) : "transient",
		`${kind} ${operation} failed${target}: ${message}`,
	);
}

/**
 * Derive the control-plane capability record from the substrate's declared mux
 * capabilities instead of restating it per adapter. All four substrates are
 * persistent machines that can be provisioned, woken, parked, destroyed and
 * exec'd against; the axes the mux declares (persistence model, streaming)
 * are what actually vary.
 */
export function toProviderCapabilities(
	capabilities: SandboxCapabilities,
): ProviderCapabilities {
	return {
		runtime:
			capabilities.persistence === "none"
				? "ephemeral-session"
				: "persistent-machine",
		canProvision: true,
		canWake: true,
		canSleep: true,
		canDestroy: true,
		canExec: true,
		hasPersistentDisk: capabilities.persistence !== "none",
		usesExternalStorage: false,
	};
}

/**
 * How long a connected sandbox handle may be reused for the SAME machine.
 *
 * This is a property of the caller, not of any substrate. A serverless route
 * builds a fresh provider per request, so a handle cached inside one -- which is
 * what `src/mux/providers/*` does, correctly, for a long-lived process -- never
 * survives to a second call here. Without a cache across providers, every exec
 * on a warm instance pays another vendor connect round trip.
 *
 * 45s because it must be shorter than the vendor's own idle-park windows: a
 * handle to a sandbox that has since parked is worse than no handle, since the
 * failure arrives mid-exec instead of at connect.
 */
const HANDLE_CACHE_MS = 45_000;

type CachedHandle = { handle: Promise<MuxSandbox>; expiresAt: number };

/**
 * Keyed by substrate, CREDENTIAL SCOPE, and machine id.
 *
 * The credential scope is not optional. One warm serverless instance serves many
 * users, and a machine id is only unique within the account that owns it -- a
 * sprite is named per organization, so two tenants can each have
 * `am-mux-reviewer`. Keyed without the scope, the second tenant's request would
 * be answered with a handle authenticated as the first. That is a cross-tenant
 * read, not a cache miss, so the scope is a required field on the binding rather
 * than something an adapter can forget to pass.
 */
const handleCache = new Map<string, CachedHandle>();

function cacheKey(kind: ProviderKind, scope: string, machineId: string): string {
	return `${kind}\u0000${scope}\u0000${machineId}`;
}

/**
 * Digest of the credentials a provider was built with, for cache scoping.
 *
 * Hashed rather than used directly so the key cannot become a way for a secret
 * to reach a log, a heap dump or an error message. Non-cryptographic is fine --
 * it separates tenants, it does not authenticate them, and the value never leaves
 * this process. What matters is that different credentials cannot collide in
 * practice, which a 64-bit FNV-1a over the full material gives us.
 */
export function credentialScope(parts: Array<string | undefined>): string {
	let hash = 0xcbf29ce484222325n;
	const material = parts.map((part) => part ?? "").join("\u0000");
	for (let index = 0; index < material.length; index += 1) {
		hash ^= BigInt(material.charCodeAt(index));
		hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
	}
	return hash.toString(36);
}

/**
 * Drop a cached handle. Called after pause, destroy, and any transport error --
 * a handle whose connection died would otherwise be handed to the next caller,
 * turning one failure into a run of them until the TTL expired.
 */
export function invalidateHandle(
	kind: ProviderKind,
	scope: string,
	machineId: string,
): void {
	handleCache.delete(cacheKey(kind, scope, machineId));
}

/** Test seam: drop every cached handle. Nothing in production calls this. */
export function clearHandleCache(): void {
	handleCache.clear();
}

function toSummary(machineId: string, described: MuxDescription): ProviderMachineSummary {
	return {
		id: machineId,
		state: toMachineState(described.state),
		rawPhase: described.rawPhase,
		spec: described.spec,
		createdAt: described.createdAt,
		lastError: described.lastError,
	};
}

/**
 * Adapt one mux substrate to the `MachineProvider` the dashboard consumes.
 *
 * `streamExec` is present only when the substrate declares
 * `streamingExec: true`. Dedalus declares `false` (its execution API exposes
 * output only after the command finishes), so the property is omitted and
 * `lib/dashboard/exec-stream.ts` keeps using its log-tail fallback -- the same
 * behavior as before this facade existed.
 */
export function createMuxBackedProvider(
	binding: MuxSubstrateBinding,
): MachineProvider {
	const { kind, substrate } = binding;
	const execTimeoutMs = binding.defaultExecTimeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
	const streamTimeoutMs =
		binding.defaultStreamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;

	function fail(
		operation: string,
		machineId: string | null,
		error: unknown,
	): MachineProviderError {
		return asMachineProviderError(kind, operation, machineId, error);
	}

	/** Every call is addressed by the machineId the caller passed. Never by a
	 * globally "active" machine -- the 2026-05-18 postmortem's routing bug. */
	async function attach(machineId: string, operation: string): Promise<MuxSandbox> {
		const key = cacheKey(kind, binding.cacheScope, machineId);
		const now = Date.now();
		const hit = handleCache.get(key);
		if (hit && hit.expiresAt > now) {
			try {
				return await hit.handle;
			} catch {
				// A cached REJECTION must not be served to the next caller: it
				// would turn one connect failure into every failure until the TTL
				// expired. Fall through and connect again.
				handleCache.delete(key);
			}
		}
		// The PROMISE is cached, not the resolved handle, so two concurrent calls
		// on a warm instance share one connect instead of racing two.
		const pending = substrate.connect(machineId);
		handleCache.set(key, { handle: pending, expiresAt: now + HANDLE_CACHE_MS });
		try {
			return await pending;
		} catch (error) {
			handleCache.delete(key);
			throw fail(operation, machineId, error);
		}
	}

	function text(value: string): string {
		return binding.trimOutput ? value.trim() : value;
	}

	const provider: MachineProvider = {
		kind,
		capabilities: toProviderCapabilities(substrate.capabilities),
		get hasCredentials(): boolean {
			return substrate.ready().ok;
		},

		async provision(input: ProvisionInput): Promise<ProvisionResult> {
			let sandbox: MuxSandbox;
			try {
				sandbox = await substrate.create(binding.createOptions(input));
			} catch (error) {
				throw fail("provision", null, error);
			}
			// The id must reach the caller even if the follow-up status read
			// fails: a provisioned machine whose id is lost is an orphan that
			// keeps burning the account's quota (postmortem 2026-05-18, item 5).
			try {
				const described = await binding.describe(sandbox.id);
				return {
					id: sandbox.id,
					state: toMachineState(described.state),
					rawPhase: described.rawPhase,
				};
			} catch {
				// Not a guess about readiness: the substrate accepted the create,
				// and the phase is genuinely unread.
				return { id: sandbox.id, state: "starting", rawPhase: "unknown" };
			}
		},

		async state(machineId: string): Promise<ProviderMachineSummary> {
			try {
				return toSummary(machineId, await binding.describe(machineId));
			} catch (error) {
				throw fail("state lookup", machineId, error);
			}
		},

		async wake(machineId: string): Promise<ProviderMachineSummary> {
			const sandbox = await attach(machineId, "wake");
			try {
				await sandbox.wake();
			} catch (error) {
				throw fail("wake", machineId, error);
			}
			return provider.state(machineId);
		},

		async sleep(machineId: string): Promise<ProviderMachineSummary> {
			try {
				if (binding.park) {
					await binding.park(machineId);
				} else {
					const sandbox = await attach(machineId, "sleep");
					await sandbox.sleep();
				}
			} catch (error) {
				throw fail("sleep", machineId, error);
			} finally {
				// Whether or not the park reported success: a handle to a sandbox
				// that may now be parked fails mid-exec instead of at connect, and
				// reconnecting is one cheap round trip.
				invalidateHandle(kind, binding.cacheScope, machineId);
			}
			return provider.state(machineId);
		},

		async destroy(machineId: string): Promise<void> {
			try {
				if (binding.remove) {
					await binding.remove(machineId);
					return;
				}
				const sandbox = await attach(machineId, "destroy");
				await sandbox.destroy();
			} catch (error) {
				throw fail("destroy", machineId, error);
			} finally {
				// In `finally` because a failed destroy is exactly when a stale
				// handle is most dangerous: the id may be gone on the vendor side
				// even though the call reported an error.
				invalidateHandle(kind, binding.cacheScope, machineId);
			}
		},

		async exec(
			machineId: string,
			command: string,
			options?: ExecOptions,
		): Promise<ExecResult> {
			const sandbox = await attach(machineId, "exec");
			try {
				const result = await sandbox.exec(command, {
					timeoutMs: options?.timeoutMs ?? execTimeoutMs,
				});
				// A non-zero exit is a result, not an error: the bootstrap runner
				// inspects exitCode/stderr to decide whether a phase can retry.
				return {
					stdout: text(result.stdout),
					stderr: text(result.stderr),
					exitCode: result.exitCode,
				};
			} catch (error) {
				throw fail("exec", machineId, error);
			}
		},

		async execBackground(machineId: string, command: string): Promise<void> {
			const sandbox = await attach(machineId, "execBackground");
			try {
				await sandbox.execBackground(command);
			} catch (error) {
				throw fail("execBackground", machineId, error);
			}
		},

		async getPublicUrl(machineId: string, port: number): Promise<string | null> {
			const sandbox = await attach(machineId, "getPublicUrl");
			try {
				return await sandbox.publicUrl(port);
			} catch (error) {
				throw fail("getPublicUrl", machineId, error);
			}
		},
	};

	if (!substrate.capabilities.streamingExec) return provider;

	provider.streamExec = async function* streamExec(
		machineId: string,
		command: string,
		options?: ExecStreamOptions,
	): AsyncGenerator<ExecStreamEvent, void, void> {
		const sandbox = await attach(machineId, "streamExec");
		try {
			const stream = sandbox.execStream(command, {
				timeoutMs: options?.timeoutMs ?? streamTimeoutMs,
				signal: options?.signal,
			});
			for await (const event of stream) {
				// Same three frames on both sides; mapped explicitly so a new
				// mux frame type cannot leak through unhandled.
				switch (event.type) {
					case "stdout":
						yield { type: "stdout", data: event.data };
						break;
					case "stderr":
						yield { type: "stderr", data: event.data };
						break;
					case "exit":
						yield { type: "exit", exitCode: event.exitCode };
						break;
					default: {
						const exhaustive: never = event;
						throw new Error(
							`Unmapped mux stream event: ${JSON.stringify(exhaustive)}`,
						);
					}
				}
			}
		} catch (error) {
			throw fail("streamExec", machineId, error);
		}
	};

	return provider;
}

/**
 * Fail closed for a capability the control plane asks for and the substrate
 * does not have. `not_supported` is the only kind the API layer turns into a
 * 501 instead of a 502 retry.
 */
export function notSupported(
	kind: ProviderKind,
	what: string,
): MachineProviderError {
	return new MachineProviderError(
		kind,
		"not_supported",
		`${kind} does not support ${what}.`,
	);
}

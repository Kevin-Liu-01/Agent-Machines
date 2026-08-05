/**
 * Vercel Sandbox substrate adapter.
 *
 * Wraps `@vercel/sandbox` (persistent Firecracker microVMs) behind the
 * SandboxProvider contract:
 *
 *   exec        -> runCommand("bash", ["-lc", <base64 wrapper>]) so quoting
 *                  never leaks into the vendor API (proven pattern from
 *                  web/lib/providers/e2b.ts).
 *   execStream  -> detached runCommand + Command.logs() async iterator,
 *                  then wait() for the exit code (native streaming).
 *   openPty     -> tmux-over-exec, because the vendor's own interactive
 *                  channel does not answer (measured below).
 *   sleep       -> sandbox.stop() (filesystem snapshot; memory is lost).
 *   wake        -> Sandbox.get({ resume: true }) resumes from snapshot.
 *   destroy     -> sandbox.delete() (terminal; the name is freed).
 *
 * THE PTY, measured live 2026-08-05 (@vercel/sandbox 2.9.2). The SDK DOES
 * expose `Sandbox.openInteractive()`, which returns
 * wss://sb-<id>.vercel.run/ws/interactive plus a 43-char opaque token, so
 * "this vendor has no PTY API" would be false. It is unusable from here
 * anyway. Eleven connection attempts: five carrying the token as a
 * subprotocol, as an `Authorization: Bearer` header, or not at all were
 * refused at the handshake (close 1006); the six that authenticated with
 * `?token=` opened, and then the channel emitted NOTHING -- no prompt on
 * connect, and no output for "\n", "\r", JSON {type: stdin|input|data},
 * or binary frames with and without a leading channel byte, waited out to
 * 12s each. The one that sent JSON {type: "start"} was closed with 1006.
 * There is no published framing for this endpoint, so the honest capability
 * is the one we can drive: tmux over exec. That is deliverable here -- same
 * date, on the node24 runtime (Amazon Linux 2023.11, no preinstalled tmux,
 * no apt-get, no apk) `sudo dnf install -y tmux` installs tmux 3.6a in
 * 13.5s, and new-session / list-sessions / send-keys all work. End to end
 * through openPty: 18.5s to first attach including that install, then a
 * 280ms keystroke round trip, and the installed binary survives park/wake
 * because the snapshot covers the rootfs (the tmux SERVER does not -- memory
 * is lost, which is what `persistence: "filesystem-snapshot"` means). See
 * the package-manager chain in ../pty/tmux.ts, which is what makes
 * `pty: "tmux"` true instead of aspirational.
 *
 * WHAT WAKES A PARKED SANDBOX, measured the same day, because this is the
 * file's central safety rule and the SDK's jsdoc is not what happens on the
 * wire. `Sandbox.get` does NOT resume by itself: with the flag omitted the
 * SDK sends no resume query param at all (dist/api-client/api-client.js:
 * `if (params.resume !== void 0) query.resume = String(params.resume)`), and
 * the API answered `resumed: false` with the session still `stopped`. What
 * resumes is (a) `resume: true`, and (b) EVERY instance method wrapped in
 * `withResume` -- runCommand, writeFiles, readFile, openInteractive -- which
 * resume a stopped session before doing their work. Every read path here
 * still passes `resume: false` explicitly, because GetSandboxParams
 * documents the default as `true` (dist/sandbox.d.ts) and a server-side
 * default that contradicts the vendor's own contract is not something to
 * depend on: the explicit flag is what keeps a describe() from billing a
 * parked sandbox if the API ever starts honoring its documentation.
 *
 * Auth is either VERCEL_OIDC_TOKEN or the token + teamId + projectId
 * triple. A `vck_`-prefixed key is a Vercel AI Gateway key and is NOT
 * Sandbox auth; ready() fails closed with a pointer to the right vars.
 * Under OIDC the SDK derives token/teamId/projectId from the JWT itself and
 * REJECTS a partial triple, which is why nothing here passes projectId on
 * its own -- see list().
 *
 * State mapping (mirrors web/lib/providers/vercel.ts):
 *   running -> ready; stopped -> sleeping;
 *   pending / stopping / snapshotting -> starting;
 *   failed / aborted -> error.
 */

import { randomUUID } from "node:crypto";

import { openTmuxPty } from "../pty/tmux.js";
import {
	MuxError,
	type CreateSandboxOptions,
	type ExecOptions,
	type ExecResult,
	type ExecStreamEvent,
	type ExecStreamOptions,
	type MachineState,
	type PtyHandle,
	type PtyOptions,
	type SandboxCapabilities,
	type SandboxDescription,
	type SandboxHandle,
	type SandboxInfo,
	type SandboxProvider,
} from "../types.js";

type VercelSandboxModule = typeof import("@vercel/sandbox");
type SandboxClass = VercelSandboxModule["Sandbox"];
type SandboxInstance = Awaited<ReturnType<SandboxClass["get"]>>;
type DetachedCommand = Awaited<ReturnType<SandboxInstance["getCommand"]>>;

export type VercelProviderCredentials = {
	token?: string;
	teamId?: string;
	projectId?: string;
	oidcToken?: string;
};

const RUNTIME = "node24";
/** Session auto-terminate window; persistence survives it via snapshots. */
const DEFAULT_SESSION_TIMEOUT_MS = 3_600_000;
/**
 * Vercel requires ports to be declared at create time. The contract has no
 * port knob, so expose the gateway ports the harnesses use (hermes 8642,
 * openclaw 18789) plus a common dev-server port.
 *
 * The SDK's own jsdoc says "Sandboxes can expose up to 4 ports"
 * (dist/sandbox.d.ts CreateSandboxParams.ports, 2.9.2) and that is wrong:
 * measured 2026-08-05, creates with 5, 6, 8, 9, 10, 12, 13 and 14 declared
 * ports all succeeded (260-1567ms). 15 -- the "Maximum open ports" the
 * pricing page publishes for every plan -- failed with an opaque HTTP 500
 * after ~15s on four attempts across three different port sets, so the
 * refusal is about the COUNT and not about one unlucky port. 14 is therefore
 * the largest number proven to work and 15 is proven not to; nothing here
 * needs more than 3.
 */
const DEFAULT_PORTS = [3000, 8642, 18789] as const;
const LIST_MAX_ENTRIES = 200;

/**
 * Declared capabilities, for a credential whose plan is NOT known.
 *
 * Sources are mixed and each value says which it is: a Vercel page with its
 * read date, the SDK source, or a live measurement of ours (this lane ran the
 * full 4x4 matrix on 2026-08-01, docs/MUX-RESULTS.md, and a substrate probe on
 * 2026-08-05 -- both under OIDC auth).
 *
 * Plan-tiered figures here are HOBBY, the lowest published tier. They are the
 * fallback, not the answer: `capabilitiesFor` below raises them when the
 * credential PROVES a higher tier, and an unprovable tier must lose the lane
 * rather than be hoped for.
 */
const CAPABILITIES: SandboxCapabilities = {
	pty: "tmux",
	persistence: "filesystem-snapshot",
	reattach: true,
	publicUrl: true,
	streamingExec: true,
	detachedWork: "reliable",
	// https://vercel.com/docs/sandbox/pricing (page last_updated 2026-06-16,
	// read 2026-08-01), Regions section: "Currently, Vercel Sandbox is only
	// available in the `iad1` region." One region and no selector, so a
	// request for iad1 is satisfiable and anything else is not.
	region: { default: "iad1", available: ["iad1"], select: "unsupported" },
	// No Vercel Sandbox page mentions accelerators: the pricing page meters
	// Active CPU, Provisioned Memory, Creations, Data Transfer and Snapshot
	// Storage only, and /docs/sandbox lists no GPU runtime (both read
	// 2026-08-01). Unknown rather than false, and either way a GPU need
	// rejects the lane.
	gpu: { available: "unknown", models: "unknown", request: "unsupported" },
	// https://vercel.com/docs/sandbox/pricing (read 2026-08-01), Network
	// section: "Data your sandbox sends to the internet ... is billable" and
	// "Data your sandbox downloads from the internet, such as packages, Git
	// repositories, artifacts, and datasets, is free" -- so egress is open out
	// of the box. No documented option restricts it, hence control
	// "unsupported".
	network: { egress: "open", control: "unsupported" },
	// https://vercel.com/docs/sandbox/concepts/snapshots (page last_updated
	// 2026-06-30, read 2026-08-01): "Forking: Spawn new sandboxes from another
	// sandbox's current state with `Sandbox.fork` (SDK) or `sandbox fork`
	// (CLI)." The vendor can fork; the mux contract exposes no fork operation,
	// so exposed stays false and the reason names us as the blocker.
	fork: { vendor: true, exposed: false },
	// Ports must be declared when the sandbox is created. vendorMax is the
	// MEASURED ceiling, not the published one: https://vercel.com/docs/sandbox/
	// pricing (read 2026-08-01) says "Maximum open ports" 15 on every plan, and
	// 15 reproducibly fails (see DEFAULT_PORTS above) while 14 works. Declaring
	// the published 15 would offer a port count the API refuses. This adapter
	// declares DEFAULT_PORTS (3 of them) and has no port knob in
	// CreateSandboxOptions, so 3 is what a run can actually get -- publicUrl()
	// returns null for anything else, verified live for port 8090 on a sandbox
	// that declared five other ports (2026-08-05).
	publicPorts: {
		model: "declared-at-create",
		vendorMax: 14,
		muxMax: DEFAULT_PORTS.length,
		fixed: [...DEFAULT_PORTS],
	},
	limits: {
		// MEASURED 2026-08-05: a create with `resources: { vcpus: 2 }` (the
		// documented default -- https://vercel.com/docs/sandbox/pricing, read
		// 2026-08-01, "The default is 2 vCPUs") reported vcpus 2 and memory
		// 4096, and the guest saw nproc 2 with MemTotal 4,386,564 kB = 4,283
		// MiB. So the vendor's memory number is MiB per MIB_PER_VCPU below --
		// not the decimal 3,814 MiB this line used to carry, which understated
		// the machine by 282 MiB and was derived from a "GB" the vendor does not
		// mean.
		baseVcpu: 2,
		baseMemoryMib: 4096,
		// Hobby fallback, from the same page's Resource limits table ("Maximum
		// vCPUs" 4, "Maximum memory" 8GB). Memory is 4 x MIB_PER_VCPU, the
		// relation measured at both 2 and 8 vCPU. capabilitiesFor() raises both
		// when the credential proves a higher tier.
		maxVcpu: 4,
		maxMemoryMib: 8192,
		// Same table: "Each sandbox is automatically provisioned 32 GB of
		// ephemeral NVMe storage", 32 GB on every plan. 32 GB is 29.8 GiB,
		// floored to 29. No disk request exists, so base equals ceiling.
		// Consistent with the guest: `df -h /` reports a 32G root on the same
		// probe.
		baseDiskGib: 29,
		maxDiskGib: 29,
		// Same page, Runtime limits: Hobby "45 minutes", Pro/Enterprise "24
		// hours". Hobby fallback here, and it is BELOW this adapter's own
		// DEFAULT_SESSION_TIMEOUT_MS of one hour. That mismatch is real only for
		// a hobby credential, which we have never held: the live runs (900_000
		// and 3_600_000 timeouts, 2026-08-05) were on a pro token where 1h is
		// far inside the ceiling. Recorded rather than silently changed, because
		// what the API does with an over-plan timeout on hobby is unmeasured.
		maxRuntimeMs: 2_700_000,
		// Same page, Concurrency limits: Hobby "10", Pro "2,000".
		maxConcurrentSandboxes: 10,
		// MEASURED HONORED 2026-08-05, end to end and through this adapter. A
		// vendor create at 2 vCPUs came up with nproc 2 / MemTotal 4,283 MiB and
		// one at 8 with nproc 8 / MemTotal 16,643 MiB, so the count is real and
		// not just accepted. Then through create() itself: `resources: {
		// memoryMib: 16_384 }` -- no vcpu axis at all -- produced a sandbox
		// reporting vcpus 8 / memory 16384 whose guest saw nproc 8, which is the
		// requestedVcpus derivation landing on the machine it promised.
		resourceRequest: "honored",
	},
};

/**
 * Memory per vCPU, as the vendor reports it and as the guest actually has it.
 *
 * The SDK says "2048 MB of memory per vCPU" (dist/sandbox.d.ts
 * CreateSandboxParams.resources) and the pricing page says "2 GB"; neither
 * states whether the wire number is decimal MB or MiB, which is why describe()
 * used to omit memory entirely. Measured 2026-08-05 it is MiB, exactly:
 * `Sandbox.memory` was 4096 at 2 vCPU and 16384 at 8 vCPU, and in both cases
 * the guest's MemTotal was HIGHER than that many MiB (4,283 and 16,643 MiB).
 * Reading the number as MiB therefore never claims memory the machine does not
 * have, which is the only property a floor check needs.
 */
const MIB_PER_VCPU = 2048;

/** The plan tiers Vercel publishes limits for. */
type VercelPlan = "hobby" | "pro" | "enterprise";

/**
 * Per-plan ceilings, selected by the `plan` claim in the OIDC JWT.
 *
 * The plan IS knowable at routing time: measured 2026-08-05, the token minted
 * by `vercel env pull` carries `plan` beside `owner_id` and `project_id`
 * (claims: aud, client_id, environment, exp, iat, iss, nbf, owner, owner_id,
 * plan, project, project_id, scope, sub, user_id). This token says "pro", and
 * the tier is real, not cosmetic: a create asking for 8 vCPUs -- twice the
 * published HOBBY maximum -- succeeded, and the machine came up with 8 vCPU and
 * 16,384 MiB.
 *
 * vCPU/runtime/concurrency figures are the pricing page's Resource, Runtime and
 * Concurrency limit tables (read 2026-08-01); memory is vCPU x MIB_PER_VCPU,
 * the relation measured above. Enterprise concurrency stays "unknown" because
 * that table quotes only Hobby (10) and Pro (2,000) -- an unknown loses a
 * concurrency constraint, which is the correct outcome for a figure nobody
 * published.
 *
 * A credential that does NOT prove a tier (the token triple carries no plan
 * claim, an OIDC token could omit it, an unrecognized plan name) keeps the
 * HOBBY figures in CAPABILITIES. Over-declaring a ceiling is what admits a
 * placement the substrate then refuses.
 */
const PLAN_LIMITS: Record<
	VercelPlan,
	{
		maxVcpu: number;
		maxRuntimeMs: number;
		maxConcurrentSandboxes: number | "unknown";
	}
> = {
	hobby: { maxVcpu: 4, maxRuntimeMs: 2_700_000, maxConcurrentSandboxes: 10 },
	pro: { maxVcpu: 8, maxRuntimeMs: 86_400_000, maxConcurrentSandboxes: 2_000 },
	enterprise: {
		maxVcpu: 32,
		maxRuntimeMs: 86_400_000,
		maxConcurrentSandboxes: "unknown",
	},
};

function isVercelPlan(value: unknown): value is VercelPlan {
	return value === "hobby" || value === "pro" || value === "enterprise";
}

/**
 * CAPABILITIES with the ceilings the credential can prove.
 *
 * Only the plan-tiered axes move; everything else is a property of the
 * substrate, not of the account.
 */
function capabilitiesFor(plan: VercelPlan | undefined): SandboxCapabilities {
	if (plan === undefined || plan === "hobby") return CAPABILITIES;
	const tier = PLAN_LIMITS[plan];
	return {
		...CAPABILITIES,
		limits: {
			...CAPABILITIES.limits!,
			maxVcpu: tier.maxVcpu,
			maxMemoryMib: tier.maxVcpu * MIB_PER_VCPU,
			maxRuntimeMs: tier.maxRuntimeMs,
			maxConcurrentSandboxes: tier.maxConcurrentSandboxes,
		},
	};
}

let sandboxClassPromise: Promise<SandboxClass> | null = null;

function loadSandboxClass(): Promise<SandboxClass> {
	if (!sandboxClassPromise) {
		sandboxClassPromise = import("@vercel/sandbox").then(
			(mod) => mod.Sandbox,
			(error: unknown) => {
				// Only a resolution failure means "not installed". This lane is
				// one bundler heuristic away from the e2b failure: measured
				// 2026-08-02, `require("@vercel/sandbox")` on a Node without
				// require(ESM) dies with ERR_REQUIRE_ESM on ESM-only
				// @workflow/serde (via dist/command.cjs), and it is safe today
				// only because both Turbopack and Node choose the `import`
				// condition. If that ever changes, the error must say so rather
				// than send the caller to reinstall a working dependency -- see
				// the loadSdk note in ./e2b.ts.
				const code =
					error && typeof error === "object" && "code" in error
						? String((error as { code?: unknown }).code)
						: "";
				if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
					throw new MuxError(
						"fatal",
						"@vercel/sandbox is not installed; npm i @vercel/sandbox",
						{ substrate: "vercel" },
					);
				}
				throw new MuxError(
					"fatal",
					`@vercel/sandbox failed to load on node ${process.versions.node}: ${
						code ? `${code}: ` : ""
					}${error instanceof Error ? error.message : String(error)}`,
					{ substrate: "vercel" },
				);
			},
		);
	}
	return sandboxClassPromise;
}

/** Base64-wrap arbitrary shell so quoting never breaks (postmortem rule). */
function bashViaBase64(command: string): string {
	const b64 = Buffer.from(command, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

function sanitizeSandboxName(raw: string): string {
	const cleaned = raw
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 63);
	return cleaned.length > 0 ? cleaned : `am-${randomUUID().slice(0, 12)}`;
}

function mapStatus(status: string | undefined): MachineState {
	switch (status) {
		case "running":
			return "ready";
		case "stopped":
			return "sleeping";
		case "pending":
		case "stopping":
		case "snapshotting":
			return "starting";
		case "failed":
		case "aborted":
			return "error";
		default:
			return "unknown";
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function httpStatus(error: unknown): number | undefined {
	if (error && typeof error === "object" && "response" in error) {
		const response = (error as { response?: { status?: unknown } }).response;
		if (response && typeof response.status === "number") {
			return response.status;
		}
	}
	return undefined;
}

/** House taxonomy: 429 -> rate_limited, 5xx/network -> transient, 4xx -> fatal. */
function classifyError(error: unknown): "rate_limited" | "transient" | "fatal" {
	const status = httpStatus(error);
	if (status !== undefined) {
		if (status === 429) return "rate_limited";
		if (status >= 500) return "transient";
		if (status >= 400) return "fatal";
	}
	const message = errorMessage(error);
	if (/\b429\b|rate.?limit/i.test(message)) return "rate_limited";
	if (/\b40[0-9]\b|unauthorized|forbidden|not.?found|invalid/i.test(message)) {
		return "fatal";
	}
	// Network-ish and everything unknown: worth retrying elsewhere.
	return "transient";
}

function isNotFound(error: unknown): boolean {
	if (httpStatus(error) === 404) return true;
	return /not[_ ]?found/i.test(errorMessage(error));
}

/**
 * The vendor's own status word, or null when the instance cannot report one.
 *
 * `Sandbox.status` proxies the CURRENT SESSION's status and throws ("No active
 * session...") when the instance holds none. The get response declares
 * `session` as required (SDK dist/api-client/api-client.d.ts getSandbox, read
 * 2026-08-01), so a throw here means the wire shape changed -- which is a
 * reason to report nothing, not to invent a phase.
 */
function rawStatus(sandbox: Pick<SandboxInstance, "status">): string | null {
	try {
		return sandbox.status;
	} catch {
		return null;
	}
}

/** ISO-8601, or nothing at all when the vendor's date is unusable. */
function isoOf(value: Date | undefined): string | undefined {
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) return undefined;
	return value.toISOString();
}

function toMuxError(error: unknown, context: string): MuxError {
	if (error instanceof MuxError) return error;
	return new MuxError(
		classifyError(error),
		`vercel ${context}: ${errorMessage(error)}`,
		{ substrate: "vercel" },
	);
}

function isGatewayKey(value: string | undefined): boolean {
	return Boolean(value && value.startsWith("vck_"));
}

/**
 * The plan tier a Vercel OIDC JWT proves, or undefined.
 *
 * The signature is NOT verified and does not need to be: the claim only picks
 * which published ceilings to declare, so the worst a wrong claim can do is
 * admit a create the API then refuses. It grants no access, and the token is
 * never logged -- only the plan name leaves this function.
 *
 * The SDK derives projectId/teamId from the same payload
 * (dist/utils/get-credentials.js), which is why nothing else here needs to.
 */
function planOf(oidcToken: string | undefined): VercelPlan | undefined {
	if (!oidcToken) return undefined;
	const parts = oidcToken.split(".");
	if (parts.length < 2 || !parts[1]) return undefined;
	try {
		const payload = JSON.parse(
			Buffer.from(
				parts[1].replace(/-/g, "+").replace(/_/g, "/"),
				"base64",
			).toString("utf8"),
		) as Record<string, unknown>;
		const plan = payload["plan"];
		return isVercelPlan(plan) ? plan : undefined;
	} catch {
		return undefined;
	}
}

/**
 * vCPUs to ask for, from either axis of a resource request.
 *
 * Memory cannot be requested independently -- the vendor takes a vCPU count and
 * hangs MIB_PER_VCPU on each one -- so a caller asking for 16 GiB is asking for
 * 8 vCPUs, and the larger of the two derived counts wins so neither axis is
 * silently ignored. Measured honored end to end 2026-08-05 (see
 * limits.resourceRequest). Undefined means "say nothing and take the default",
 * which is not the same as asking for the default.
 *
 * `ceiling` is the requesting credential's proven plan maximum, not a constant:
 * clamping a pro credential's legitimate 8-vCPU request down to the hobby 4
 * would hand the harness half the machine it asked for and report success.
 */
function requestedVcpus(
	resources: { vcpu?: number; memoryMib?: number } | undefined,
	ceiling: number,
): number | undefined {
	if (!resources) return undefined;
	const fromVcpu = resources.vcpu;
	const fromMemory =
		resources.memoryMib === undefined
			? undefined
			: Math.ceil(resources.memoryMib / MIB_PER_VCPU);
	const wanted = Math.max(fromVcpu ?? 0, fromMemory ?? 0);
	if (wanted <= 0) return undefined;
	return Math.min(Math.max(1, Math.ceil(wanted)), ceiling);
}

/**
 * Test seam: createVercelProvider takes a Sandbox-class override so a suite
 * can prove describe()/remove()/park() only ever call `get` with
 * resume: false. A positive "it returned a state" test cannot prove that --
 * the resuming path returns a state too, after waking the sandbox.
 */
export function createVercelProvider(
	creds: VercelProviderCredentials,
	sandboxClassOverride?: SandboxClass,
): SandboxProvider {
	const token = creds.token?.trim() || undefined;
	const teamId = creds.teamId?.trim() || undefined;
	const projectId = creds.projectId?.trim() || undefined;
	const oidcToken = creds.oidcToken?.trim() || undefined;

	const tripleOk = Boolean(token && teamId && projectId && !isGatewayKey(token));
	const oidcOk = Boolean(oidcToken && !isGatewayKey(oidcToken));

	// Ceilings this credential can prove. A gateway key is not Sandbox auth at
	// all, so its claims (it has none) never raise anything.
	const capabilities = capabilitiesFor(oidcOk ? planOf(oidcToken) : undefined);
	const maxVcpu = capabilities.limits?.maxVcpu;
	const vcpuCeiling = typeof maxVcpu === "number" ? maxVcpu : PLAN_LIMITS.hobby.maxVcpu;

	/** Injected only by tests; production pays the lazy vendor import. */
	const sandboxClass = (): Promise<SandboxClass> =>
		sandboxClassOverride
			? Promise.resolve(sandboxClassOverride)
			: loadSandboxClass();

	/**
	 * All-or-none credential params: the SDK throws on a partial triple.
	 * The OIDC path is resolved by the SDK from VERCEL_OIDC_TOKEN, so an
	 * explicitly configured oidcToken is bridged into the environment at
	 * call time (never at import time).
	 */
	function authParams(): {
		token?: string;
		teamId?: string;
		projectId?: string;
	} {
		if (tripleOk) {
			return { token, teamId, projectId };
		}
		if (oidcOk && oidcToken && !process.env.VERCEL_OIDC_TOKEN) {
			process.env.VERCEL_OIDC_TOKEN = oidcToken;
		}
		return {};
	}

	function ready(): { ok: boolean; missing: string[] } {
		if (tripleOk || oidcOk) return { ok: true, missing: [] };
		const missing: string[] = [];
		if (isGatewayKey(token) || isGatewayKey(oidcToken)) {
			missing.push(
				"a vck_-prefixed key was provided: that is a Vercel AI Gateway key, not Sandbox auth -- need VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID or VERCEL_OIDC_TOKEN",
			);
		}
		if (!token || isGatewayKey(token)) missing.push("VERCEL_TOKEN");
		if (!teamId) missing.push("VERCEL_TEAM_ID");
		if (!projectId) missing.push("VERCEL_PROJECT_ID");
		missing.push("VERCEL_OIDC_TOKEN (alternative to the token triple)");
		return { ok: false, missing };
	}

	function assertReady(): void {
		const readiness = ready();
		if (!readiness.ok) {
			throw new MuxError(
				"missing_credentials",
				`vercel sandbox is not credentialed: ${readiness.missing.join(", ")}`,
				{ substrate: "vercel" },
			);
		}
	}

	function makeHandle(initial: SandboxInstance): SandboxHandle {
		let sandbox = initial;
		const name = initial.name;

		async function refresh(resume: boolean): Promise<SandboxInstance> {
			const Sandbox = await sandboxClass();
			sandbox = await Sandbox.get({ ...authParams(), name, resume });
			return sandbox;
		}

		const handle: SandboxHandle = {
			id: name,
			substrate: "vercel",
			capabilities,

			async exec(
				command: string,
				options: ExecOptions = {},
			): Promise<ExecResult> {
				const startedAt = Date.now();
				try {
					// Non-detached: the SDK waits and auto-resumes stopped
					// sessions before running.
					const finished = await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", bashViaBase64(command)],
						env: options.env,
						cwd: options.cwd,
						timeoutMs: options.timeoutMs,
					});
					return {
						stdout: await finished.stdout(),
						stderr: await finished.stderr(),
						exitCode: finished.exitCode,
						durationMs: Date.now() - startedAt,
					};
				} catch (error) {
					// Defensive: some SDK paths surface failed commands as
					// errors that still carry the exit code and output.
					if (error && typeof error === "object" && "exitCode" in error) {
						const cmdError = error as {
							exitCode: number;
							stdout?: () => Promise<string>;
							stderr?: () => Promise<string>;
						};
						return {
							stdout: cmdError.stdout ? await cmdError.stdout() : "",
							stderr: cmdError.stderr ? await cmdError.stderr() : "",
							exitCode: cmdError.exitCode,
							durationMs: Date.now() - startedAt,
						};
					}
					throw toMuxError(error, `exec failed on ${name}`);
				}
			},

			async *execStream(
				command: string,
				options: ExecStreamOptions = {},
			): AsyncGenerator<ExecStreamEvent, void, void> {
				let cmd: DetachedCommand;
				try {
					// timeoutMs is enforced by the sandbox at exec time, so
					// it applies to detached commands too.
					cmd = await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", bashViaBase64(command)],
						env: options.env,
						cwd: options.cwd,
						timeoutMs: options.timeoutMs,
						detached: true,
					});
				} catch (error) {
					throw toMuxError(error, `execStream failed on ${name}`);
				}
				try {
					for await (const log of cmd.logs({ signal: options.signal })) {
						if (log.stream === "stdout") {
							yield { type: "stdout", data: log.data };
						} else {
							yield { type: "stderr", data: log.data };
						}
					}
					const finished = await cmd.wait({ signal: options.signal });
					yield { type: "exit", exitCode: finished.exitCode };
				} catch (error) {
					if (options.signal?.aborted) {
						// Caller cancelled (e.g. tmux tail teardown): reap the
						// remote process and end the stream quietly.
						await cmd.kill().catch(() => {});
						return;
					}
					throw toMuxError(error, `execStream failed on ${name}`);
				}
			},

			async execBackground(command: string): Promise<void> {
				try {
					await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", bashViaBase64(command)],
						detached: true,
					});
				} catch (error) {
					throw toMuxError(error, `execBackground failed on ${name}`);
				}
			},

			async openPty(options: PtyOptions = {}): Promise<PtyHandle> {
				// The vendor's interactive WebSocket opens and then says
				// nothing (header, measured 2026-08-05), so interactive
				// sessions are hosted in tmux on the sandbox. tmux is not
				// preinstalled on this runtime and is installed on first use
				// by the dnf branch in ../pty/tmux.ts.
				return openTmuxPty(handle, options);
			},

			async writeFile(
				path: string,
				content: string | Uint8Array,
			): Promise<void> {
				try {
					await sandbox.writeFiles([{ path, content }]);
				} catch (error) {
					throw toMuxError(error, `writeFile failed for ${name}:${path}`);
				}
			},

			async publicUrl(port: number): Promise<string | null> {
				try {
					// Synchronous route lookup; throws when the port was not
					// declared at create time.
					return sandbox.domain(port);
				} catch {
					return null;
				}
			},

			async state(): Promise<MachineState> {
				try {
					const fresh = await refresh(false);
					return mapStatus(fresh.status);
				} catch (error) {
					if (isNotFound(error)) return "destroyed";
					return "unknown";
				}
			},

			async sleep(): Promise<void> {
				try {
					// stop() snapshots the filesystem and parks the sandbox;
					// memory state is lost by design.
					await sandbox.stop();
				} catch (error) {
					throw toMuxError(error, `sleep (stop) failed for ${name}`);
				}
			},

			async wake(): Promise<void> {
				try {
					// Sandbox.get with resume auto-restores from snapshot.
					await refresh(true);
				} catch (error) {
					throw toMuxError(error, `wake failed for ${name}`);
				}
			},

			async destroy(): Promise<void> {
				try {
					const Sandbox = await sandboxClass();
					const target = await Sandbox.get({
						...authParams(),
						name,
						resume: false,
					});
					await target.delete();
				} catch (error) {
					if (isNotFound(error)) return;
					throw toMuxError(error, `destroy failed for ${name}`);
				}
			},
		};

		return handle;
	}

	return {
		kind: "vercel",
		capabilities,

		ready,

		async create(options: CreateSandboxOptions = {}): Promise<SandboxHandle> {
			assertReady();
			const Sandbox = await sandboxClass();
			const name = sanitizeSandboxName(
				options.name ?? `am-${randomUUID().slice(0, 12)}`,
			);
			try {
				// getOrCreate makes named creates idempotent (reattaches to a
				// live sandbox, recreates when the snapshot is gone).
				// A dropped size request is worse than a refused one: the sandbox
				// comes up small and the harness starves at run time with no hint
				// that the request was ignored. Vercel hangs MIB_PER_VCPU on each
				// vCPU, so memory is expressed by asking for the vCPUs that carry
				// it, and the count is clamped to the ceiling this credential's
				// plan proves.
				const vcpus = requestedVcpus(options.resources, vcpuCeiling);
				const sandbox = await Sandbox.getOrCreate({
					...authParams(),
					name,
					runtime: RUNTIME,
					persistent: true,
					ports: [...DEFAULT_PORTS],
					timeout: options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
					env: options.env,
					...(vcpus === undefined ? {} : { resources: { vcpus } }),
					tags: { "agent-machines": "true" },
				});
				return makeHandle(sandbox);
			} catch (error) {
				throw toMuxError(error, `create failed for ${name}`);
			}
		},

		async connect(id: string): Promise<SandboxHandle> {
			assertReady();
			const Sandbox = await sandboxClass();
			try {
				// The SDK addresses sandboxes by name; handle ids are names.
				// resume: true auto-wakes a stopped sandbox from snapshot. That is
				// why reading, destroying and parking have their own members below
				// -- none of them wants a running session, and this call starts one.
				const sandbox = await Sandbox.get({
					...authParams(),
					name: id,
					resume: true,
				});
				return makeHandle(sandbox);
			} catch (error) {
				throw toMuxError(error, `connect failed for ${id}`);
			}
		},

		/**
		 * `Sandbox.get` with resume: false -- the record and its current session
		 * exactly as they are, with no snapshot restore.
		 */
		async describe(id: string): Promise<SandboxDescription> {
			assertReady();
			const Sandbox = await sandboxClass();
			try {
				const sandbox = await Sandbox.get({
					...authParams(),
					name: id,
					resume: false,
				});
				const phase = rawStatus(sandbox);
				const description: SandboxDescription = {
					state: phase === null ? "unknown" : mapStatus(phase),
					rawPhase: phase,
				};
				const createdAt = isoOf(sandbox.createdAt);
				if (createdAt) description.createdAt = createdAt;
				// Both axes the vendor reports. `Sandbox.memory` is documented as
				// "Memory allocated in MB" (SDK dist/sandbox.d.ts) with no statement
				// of decimal-vs-binary, which is why this used to omit it; measured
				// 2026-08-05 the number is MiB and the guest always has at least
				// that much (see MIB_PER_VCPU), so reporting it can only understate
				// the machine. It was reported on every sandbox read that day, at
				// both 2 and 8 vCPU. diskGib stays absent: the vendor publishes
				// 32 GB of ephemeral storage per sandbox but the SDK exposes no
				// per-sandbox disk figure, and an axis nothing reported must stay
				// absent rather than be filled from the plan table.
				if (typeof sandbox.vcpus === "number") {
					description.resources = { vcpu: sandbox.vcpus };
				}
				if (typeof sandbox.memory === "number") {
					description.resources = {
						...description.resources,
						memoryMib: sandbox.memory,
					};
				}
				return description;
			} catch (error) {
				if (isNotFound(error)) return { state: "destroyed", rawPhase: null };
				throw toMuxError(error, `describe failed for ${id}`);
			}
		},

		/**
		 * Destroy without a resume: get with resume: false, then delete().
		 *
		 * `delete()` is one of the few instance methods the SDK does NOT wrap in
		 * `withResume` (dist/sandbox.js), so a stopped sandbox is deleted while
		 * stopped. Going through connect() instead resumed first, which made a
		 * sandbox whose snapshot could not resume impossible to destroy at all --
		 * POSTMORTEM-2026-05-18 item 5.
		 */
		async remove(id: string): Promise<void> {
			assertReady();
			const Sandbox = await sandboxClass();
			try {
				const target = await Sandbox.get({
					...authParams(),
					name: id,
					resume: false,
				});
				await target.delete();
			} catch (error) {
				if (isNotFound(error)) return;
				throw toMuxError(error, `remove failed for ${id}`);
			}
		},

		/**
		 * Park without a resume: read at resume: false, then stop() only if a
		 * session is actually running.
		 *
		 * `stop()` is also outside `withResume`, so it can never restart the VM;
		 * it does throw "No active session to stop." when there is nothing
		 * running, which is why the phase is read first. A sandbox already parked
		 * needs no call at all -- and a 404 is not swallowed, because parking is
		 * a request about a machine that exists.
		 */
		async park(id: string): Promise<void> {
			assertReady();
			const Sandbox = await sandboxClass();
			try {
				const sandbox = await Sandbox.get({
					...authParams(),
					name: id,
					resume: false,
				});
				const phase = rawStatus(sandbox);
				if (phase === null || mapStatus(phase) !== "ready") return;
				await sandbox.stop();
			} catch (error) {
				throw toMuxError(error, `park failed for ${id}`);
			}
		},

		/**
		 * Every sandbox in the project, newest first.
		 *
		 * Pass NO credential fields of our own beyond authParams(): they are
		 * all-or-none. The SDK's getCredentials rejects a partial triple
		 * (dist/utils/get-credentials.js: "Missing credentials parameters to
		 * access the Vercel API: token, teamId" when 1 or 2 of the three are
		 * present), and this method used to add a projectId derived from the JWT
		 * on top of the empty OIDC params -- which made exactly that partial
		 * triple and threw on every call. Measured 2026-08-05: with the derived
		 * projectId, list() throws under OIDC auth; with nothing passed, it
		 * returns the project's sandboxes, because getCredentials pulls token,
		 * teamId AND projectId out of the JWT itself. An operator on OIDC-only
		 * auth could not enumerate this lane at all before that, so "prove
		 * nothing is left billing" had no answer here.
		 */
		async list(): Promise<SandboxInfo[]> {
			assertReady();
			const Sandbox = await sandboxClass();
			try {
				const paginator = await Sandbox.list({
					...authParams(),
					sortBy: "createdAt",
					sortOrder: "desc",
					limit: 50,
				});
				const infos: SandboxInfo[] = [];
				for await (const entry of paginator) {
					infos.push({
						id: entry.name,
						name: entry.name,
						state: mapStatus(entry.status),
						substrate: "vercel",
						createdAt: new Date(entry.createdAt).toISOString(),
					});
					if (infos.length >= LIST_MAX_ENTRIES) break;
				}
				return infos;
			} catch (error) {
				throw toMuxError(error, "list failed");
			}
		},
	};
}

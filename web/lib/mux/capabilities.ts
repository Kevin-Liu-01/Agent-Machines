/**
 * Substrate and harness capability matrix for the UI.
 *
 * The canonical definitions live in the multiplexer package
 * (`src/mux/providers/*` declare `capabilities`, `src/mux/harnesses/*`
 * declare `requiredUpstream`). The web app is a separate package and
 * cannot import across the boundary, so this mirror exists -- and
 * `capabilities.test.ts` reads the mux sources to assert every value
 * here still matches, so drift fails the test suite instead of shipping.
 *
 * Two conventions, both load-bearing:
 *
 *   - `null` means UNKNOWN: the vendor publishes no such figure and we have
 *     not measured one. Render it as "unknown", never as zero, "none" or a
 *     guess. The router treats the same value as a rejection, so a lane shown
 *     as unknown on an axis is a lane that will be skipped when a run needs
 *     that axis.
 *   - A capability the vendor HAS is not a capability a run GETS. Where the
 *     substrate exposes a knob the mux does not forward, the request field
 *     says `"ignored"`; that is why E2B can block internet egress while this
 *     table still reports egress control as unavailable through us.
 *
 * Latency figures come from docs/MUX-RESULTS.md (measured, never invented);
 * vercel and dedalus have no measured cell because we hold no credentials for
 * them, so their rows are documentation only.
 */

export type SubstrateKind = "e2b" | "sprites" | "vercel" | "dedalus";
export type HarnessKind = "claude-code" | "codex" | "openclaw" | "hermes";
export type PtySupport = "native" | "tmux" | "none";
export type PersistenceModel =
	| "memory-snapshot"
	| "filesystem-snapshot"
	| "always-on"
	| "none";

/** Mirrors `RequestSupport` in src/mux/types.ts. */
export type RequestSupport = "honored" | "ignored" | "unsupported" | "unknown";
export type EgressPolicy = "open" | "blocked" | "allowlist";
export type PublicPortModel = "any-port" | "declared-at-create" | "single-fixed";

export type SubstrateLimits = {
	baseVcpu: number | null;
	baseMemoryMib: number | null;
	baseDiskGib: number | null;
	maxVcpu: number | null;
	maxMemoryMib: number | null;
	maxDiskGib: number | null;
	maxRuntimeMs: number | null;
	maxConcurrentSandboxes: number | null;
	resourceRequest: RequestSupport;
};

export type SubstrateCapability = {
	kind: SubstrateKind;
	label: string;
	pty: PtySupport;
	persistence: PersistenceModel;
	reattach: boolean;
	publicUrl: boolean;
	streamingExec: boolean;
	/** Does work detached from the client run at full speed? */
	detachedWork: "reliable" | "throttled";
	region: {
		default: string | null;
		available: readonly string[] | null;
		select: RequestSupport;
	};
	gpu: { available: boolean | null; request: RequestSupport };
	/** Outbound posture of a fresh sandbox, and whether the mux can change it. */
	egress: EgressPolicy | null;
	networkControl: RequestSupport;
	/** Fork = a second live sandbox from this one's state. */
	fork: { vendor: boolean | null; exposed: boolean };
	publicPorts: {
		model: PublicPortModel | null;
		/** Public ports a run can get THROUGH THE MUX, not the vendor ceiling. */
		muxMax: number | null;
		fixed: readonly number[] | null;
	};
	limits: SubstrateLimits;
	/** Env vars the router requires before it will route here. */
	credentials: string[];
	measured: { createMs: number | null; execMs: number | null };
};

export type HarnessCapability = {
	kind: HarnessKind;
	label: string;
	requiredUpstream: "anthropic" | "openai" | "any";
	/** How the CLI reports progress on stdout. */
	wireFormat: string;
	/** Heavy installs should be pre-baked into a sandbox template. */
	heavyInstall: boolean;
};

export const SUBSTRATE_CAPABILITIES: readonly SubstrateCapability[] = [
	{
		kind: "e2b",
		label: "E2B",
		pty: "native",
		persistence: "memory-snapshot",
		reattach: true,
		publicUrl: true,
		streamingExec: true,
		detachedWork: "reliable",
		region: { default: null, available: null, select: "unsupported" },
		gpu: { available: null, request: "unsupported" },
		egress: "open",
		networkControl: "ignored",
		fork: { vendor: true, exposed: false },
		publicPorts: { model: "any-port", muxMax: null, fixed: null },
		limits: {
			baseVcpu: 2,
			baseMemoryMib: 478,
			baseDiskGib: 9,
			maxVcpu: 8,
			maxMemoryMib: 8192,
			maxDiskGib: 9,
			maxRuntimeMs: 3600000,
			maxConcurrentSandboxes: 20,
			resourceRequest: "unknown",
		},
		credentials: ["E2B_API_KEY"],
		measured: { createMs: 265, execMs: 122 },
	},
	{
		kind: "sprites",
		label: "Sprites",
		pty: "native",
		persistence: "always-on",
		reattach: true,
		publicUrl: true,
		streamingExec: true,
		detachedWork: "throttled",
		region: { default: null, available: null, select: "unsupported" },
		gpu: { available: null, request: "unsupported" },
		egress: "open",
		networkControl: "unsupported",
		fork: { vendor: false, exposed: false },
		publicPorts: { model: "single-fixed", muxMax: 1, fixed: [8080] },
		limits: {
			baseVcpu: null,
			baseMemoryMib: null,
			baseDiskGib: 93,
			maxVcpu: null,
			maxMemoryMib: 7629,
			maxDiskGib: 93,
			maxRuntimeMs: null,
			maxConcurrentSandboxes: null,
			resourceRequest: "ignored",
		},
		credentials: ["SPRITES_TOKEN"],
		measured: { createMs: 401, execMs: 87 },
	},
	{
		kind: "vercel",
		label: "Vercel Sandbox",
		pty: "tmux",
		persistence: "filesystem-snapshot",
		reattach: true,
		publicUrl: true,
		streamingExec: true,
		detachedWork: "reliable",
		region: { default: "iad1", available: ["iad1"], select: "unsupported" },
		gpu: { available: null, request: "unsupported" },
		egress: "open",
		networkControl: "unsupported",
		fork: { vendor: true, exposed: false },
		publicPorts: {
			model: "declared-at-create",
			muxMax: 3,
			fixed: [3000, 8642, 18789],
		},
		limits: {
			baseVcpu: 2,
			baseMemoryMib: 3814,
			baseDiskGib: 29,
			maxVcpu: 4,
			maxMemoryMib: 7629,
			maxDiskGib: 29,
			maxRuntimeMs: 2700000,
			maxConcurrentSandboxes: 10,
			resourceRequest: "unknown",
		},
		credentials: ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID"],
		measured: { createMs: null, execMs: 290 },
	},
	{
		kind: "dedalus",
		label: "Dedalus",
		pty: "tmux",
		persistence: "always-on",
		reattach: true,
		publicUrl: true,
		streamingExec: false,
		detachedWork: "reliable",
		region: { default: null, available: null, select: "unknown" },
		gpu: { available: true, request: "ignored" },
		egress: null,
		networkControl: "unsupported",
		fork: { vendor: null, exposed: false },
		publicPorts: { model: null, muxMax: null, fixed: null },
		limits: {
			baseVcpu: null,
			baseMemoryMib: null,
			baseDiskGib: null,
			maxVcpu: 4,
			maxMemoryMib: 16384,
			maxDiskGib: 10,
			maxRuntimeMs: null,
			maxConcurrentSandboxes: 5,
			resourceRequest: "unknown",
		},
		credentials: ["DEDALUS_API_KEY"],
		measured: { createMs: null, execMs: 866 },
	},
];

export const HARNESS_CAPABILITIES: readonly HarnessCapability[] = [
	{
		kind: "claude-code",
		label: "Claude Code",
		requiredUpstream: "anthropic",
		wireFormat: "stream-json NDJSON",
		heavyInstall: false,
	},
	{
		kind: "codex",
		label: "Codex CLI",
		requiredUpstream: "openai",
		wireFormat: "exec --json JSONL",
		heavyInstall: false,
	},
	{
		kind: "openclaw",
		label: "OpenClaw",
		requiredUpstream: "any",
		wireFormat: "JSON envelope",
		heavyInstall: false,
	},
	{
		kind: "hermes",
		label: "Hermes",
		requiredUpstream: "any",
		wireFormat: "plain text",
		heavyInstall: true,
	},
];

export function substrateCapability(kind: SubstrateKind): SubstrateCapability {
	const found = SUBSTRATE_CAPABILITIES.find((item) => item.kind === kind);
	if (!found) throw new Error(`Unknown substrate: ${kind}`);
	return found;
}

export function harnessCapability(kind: HarnessKind): HarnessCapability {
	const found = HARNESS_CAPABILITIES.find((item) => item.kind === kind);
	if (!found) throw new Error(`Unknown harness: ${kind}`);
	return found;
}

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
 * Latency figures come from docs/MUX-RESULTS.md (measured, never
 * invented). `null` means not yet measured on that lane -- render it as
 * "not measured", never as zero or a guess.
 */

export type SubstrateKind = "e2b" | "sprites" | "vercel" | "dedalus";
export type HarnessKind = "claude-code" | "codex" | "openclaw" | "hermes";
export type PtySupport = "native" | "tmux" | "none";
export type PersistenceModel =
	| "memory-snapshot"
	| "filesystem-snapshot"
	| "always-on"
	| "none";

export type SubstrateCapability = {
	kind: SubstrateKind;
	label: string;
	pty: PtySupport;
	persistence: PersistenceModel;
	reattach: boolean;
	publicUrl: boolean;
	streamingExec: boolean;
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

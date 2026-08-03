/**
 * State move: the file-state contract behind `mux.migrate()`.
 *
 * One gzipped tar, built on the SOURCE sandbox from an explicit ALLOWLIST,
 * every path relative to $HOME (`tar -C "$HOME"` in both directions). HOME
 * differs per substrate -- /home/user on e2b, /home/sprite on sprites,
 * /vercel/sandbox on vercel, /home/machine on dedalus -- so an absolute path
 * baked into the payload would land the state in a directory the target's
 * harness never reads. This is the same convention loadout.ts already ships
 * under.
 *
 * Never `tar $HOME`. The harness toolchains under $HOME are 250+ MB of
 * reinstallable, ARCHITECTURE-SPECIFIC binaries (hermes's uv tree measured
 * 249 MB on 2026-08-01, src/mux/harnesses/hermes.ts): copying them from an
 * x64 sandbox to an arm64 one produces a machine that looks installed and
 * cannot run. They are re-derived by each adapter's idempotent
 * installCommand() instead, which detects the arch per sandbox.
 *
 * The three lists -- what MOVES, what is RE-DERIVED, what is LOST -- live
 * here as constants so the SDK, the CLI and the hosted plane quote ONE
 * wording (the same rationale as explainLane in selection.ts: three surfaces
 * inventing three phrasings is how a contract stops being answerable). The
 * MigrateReport the router returns is generated from these lists, not prose
 * someone retypes.
 *
 * Transport, both directions fail closed on a digest:
 *
 *   OUT -- SandboxHandle has writeFile but NO readFile, so the only way to
 *   read bytes out of a sandbox is exec stdout. The tar is read out in
 *   256 KiB raw chunks (`dd bs=65536 count=4 | base64 | tr -d '\n'`):
 *   conservative, because no per-substrate exec-stdout ceiling has been
 *   measured, and newline-stripped base64 is immune to the output trimming
 *   sprites and dedalus apply to exec results (the behavior that killed
 *   bare stdout sentinels and forced machine-fs's exit-code protocol). The
 *   reassembled bytes must hash to the source's own sha256sum or the
 *   migration aborts before anything consumed them.
 *
 *   IN -- one SandboxHandle.writeFile of the base64 payload (the loadout.ts
 *   precedent: ~706 KB proven in one call on all four adapters 2026-08-01;
 *   dedalus chunks internally at 131,072 B), sha256 re-checked ON TARGET,
 *   then a FOREGROUND `tar -C "$HOME" -xzf` -- foreground because sprites
 *   throttles detached work (measured 2026-08-01: 17s foreground vs >15min
 *   detached; see SandboxCapabilities.detachedWork).
 *
 * Nothing here imports the router: the whole substrate surface is a
 * two-method slice of SandboxHandle, so every function is testable against
 * an in-memory fake.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { MuxError, type HarnessKind, type SandboxHandle, type SubstrateKind } from "./types.js";

// ---------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------

/** Read side: exec only (the export leg never writes to the source). */
export type MoveSource = Pick<SandboxHandle, "exec">;
/** Write side: the restore leg stages one file and runs one script. */
export type MoveTarget = Pick<SandboxHandle, "exec" | "writeFile">;

// ---------------------------------------------------------------------------
// The contract: what moves, what re-derives, what is lost
// ---------------------------------------------------------------------------

export type StateMovePlan = {
	/** $HOME-relative paths shipped in the tar, deterministic order. */
	include: string[];
	/** tar --exclude patterns: credential material inside included trees. */
	exclude: string[];
};

/** Where the migration marker lands, $HOME-relative. Inside the allowlist so
 * it rides the same tar it verifies. */
export const MIGRATION_MARKER_PATH = ".agent-machines/.migration-marker";

/**
 * State every harness accretes, independent of which one is running:
 * the four memory docs (the machine copy is authoritative over any bundle --
 * web/lib/memory/on-machine.ts reads-and-diffs on that premise), the WHOLE
 * skills tree (custom/ and agent-authored skills are machine-only and
 * agent-authored entries are not guaranteed to live under custom/; the
 * bundled subset riding along is ~1.5 MB and the reload script prunes
 * against its own manifest, so over-shipping is safe where under-shipping
 * loses work), the loadout manifest that makes those prune decisions
 * reproducible, terminal state, and the hosted app data ("these survive
 * sleep/wake" is the promise web/lib/storage/machine-fs.ts documents --
 * they must survive a migration too; harmless empty on the pure mux plane).
 */
const COMMON_INCLUDE = [
	".agent-machines/SOUL.md",
	".agent-machines/AGENTS.md",
	".agent-machines/MEMORY.md",
	".agent-machines/USER.md",
	".agent-machines/skills",
	".agent-machines/.loadout",
	".agent-machines/state",
	".agent-machines/chats",
	".agent-machines/artifacts",
	".agent-machines/crons",
	".agent-machines/mcps",
	".agent-machines/sessions",
	MIGRATION_MARKER_PATH,
];

/**
 * Credential files are excluded by pattern even where the include list
 * already avoids them: an include tree can grow a credential file after this
 * list was written (a `.env` dropped into skills/), and shipping one through
 * the control plane is the failure this belt-and-suspenders exists to
 * prevent. A basename pattern in GNU tar matches at any depth.
 */
const COMMON_EXCLUDE = [".env", ".agent-env"];

const HARNESS_INCLUDE: Record<HarnessKind, string[]> = {
	// ~/.claude holds resumable sessions, user skills and MCP config;
	// ~/.claude.json is the user-scope MCP registry (both locations VERIFIED
	// 2026-08-01 via the CLI's own --debug-file, loadout.ts header). Session
	// ids keep resuming (--resume) only because these move.
	"claude-code": [".claude", ".claude.json"],
	// ~/.codex: config.toml (VERIFIED 2026-08-01, loadout.ts header) and the
	// session rollouts `codex exec resume <id>` replays.
	codex: [".codex"],
	// workspace/, per-agent sessions, memory dbs, config.json. The config
	// location is this repo's assumption, not the vendor's (loadout.ts:87-91)
	// -- carried in MOVE_NOTES rather than silently promised.
	openclaw: [".openclaw"],
	// The hosted plane pins HERMES_HOME=$HOME/.agent-machines
	// (web/lib/bootstrap/runner.ts), so hermes runtime state lives beside the
	// common tree. The venv is NOT here: 249 MB, reinstallable, arch-specific.
	hermes: [".agent-machines/config.yaml", ".agent-machines/state.db"],
};

const HARNESS_EXCLUDE: Record<HarnessKind, string[]> = {
	// Login state, not workspace state: re-derived by the adapter's auth
	// injection. Copying it would round-trip a credential through the
	// control plane, which nothing in this product ever does.
	"claude-code": [".claude/.credentials.json"],
	// Written by `codex login --with-api-key`; same rule.
	codex: [".codex/auth.json"],
	openclaw: [],
	hermes: [],
};

/** The exact allowlist `migrate` tars for one harness. */
export function MOVE_ALLOWLIST(agent: HarnessKind): StateMovePlan {
	return {
		include: [...COMMON_INCLUDE, ...HARNESS_INCLUDE[agent]],
		exclude: [...COMMON_EXCLUDE, ...HARNESS_EXCLUDE[agent]],
	};
}

const COMMON_REDERIVED = [
	"harness toolchain (~/.agent-machines/node, ~/.agent-machines/pkgs, ~/.agent-machines/uv, ~/.local/bin, ~/.local/share/uv): reinstalled by the adapter's idempotent, arch-detecting installCommand() -- copying binaries risks an x64/arm64 mismatch",
	"credential material (.env, .agent-env, upstream model keys): re-injected from config at run time, never round-tripped through the control plane",
	"combined entry docs (~/.claude/CLAUDE.md, ~/CLAUDE.md, ~/.codex/AGENTS.md, ~/AGENTS.md, openclaw workspace docs): regenerated from the four moved canonical docs",
];

const HARNESS_REDERIVED: Record<HarnessKind, string[]> = {
	"claude-code": [
		".claude/.credentials.json: login state, re-derived by the harness's auth injection",
	],
	codex: [".codex/auth.json: login state, re-derived by `codex login --with-api-key`"],
	openclaw: [],
	hermes: [
		"hermes venv/uv tree (~249 MB measured 2026-08-01): reinstalled on the target, arch-specific",
	],
};

/** What migrate re-derives instead of copying, for one harness. */
export function REDERIVED(agent: HarnessKind): string[] {
	return [...COMMON_REDERIVED, ...HARNESS_REDERIVED[agent]];
}

/**
 * Declared losses on EVERY migration. Stated in the report, never implied:
 * a migration that quietly dropped a running tmux session would be read as
 * a migration that hung.
 */
export const LOST_ALWAYS = [
	"running processes: tmux sessions and console scrollback, gateway uptime, in-flight agent runs",
	"/tmp contents",
	"apt/system packages installed ad hoc (anything outside $HOME is not inventoried)",
	"create-time env vars: the placement remembers only {substrate, sandboxId, agent}; re-supply them via migrate options.env",
] as const;

/**
 * The loss list for a migration leaving `from`. e2b persists through a
 * memory snapshot, and no file copy captures RAM state -- fork/clone is
 * `exposed: false` on every adapter -- so leaving e2b loses whatever only
 * lived in memory, and the report says so.
 */
export function lostState(from: SubstrateKind): string[] {
	const lost: string[] = [...LOST_ALWAYS];
	if (from === "e2b") {
		lost.push(
			"e2b RAM state: the substrate persists via memory snapshot and no file copy captures it (fork is not exposed through the mux)",
		);
	}
	return lost;
}

/**
 * Named unknowns that ride the report instead of being silent promises
 * (docs/ROADMAP.md's honesty rule: an unverified vendor layout is a caveat,
 * not a claim).
 */
export function MOVE_NOTES(agent: HarnessKind): string[] {
	const notes: string[] = [];
	if (agent === "openclaw") {
		notes.push(
			"~/.openclaw/config.json is this repo's assumption for openclaw's config location, not vendor documentation (loadout.ts:87-91)",
		);
	}
	if (agent === "hermes") {
		notes.push(
			"hermes state.db moves verbatim; absolute paths inside it are NOT rewritten for the new $HOME (whether it stores any is unverified)",
		);
	}
	return notes;
}

// ---------------------------------------------------------------------------
// Transport limits
// ---------------------------------------------------------------------------

/**
 * Fail closed above this rather than stream for an hour over an unmeasured
 * channel. No per-substrate exec-stdout ceiling has been measured, so the
 * only honest large-workspace story today is "refused, with the offenders
 * named" -- 512 MiB is ~2,048 chunk execs, already the practical edge.
 */
export const MAX_STATE_TAR_BYTES = 512 * 1024 * 1024;

/**
 * 256 KiB of raw tar per exec (dd bs=65536 count=4). Conservative on
 * purpose: src/lib/upload.ts caps argv payloads at 64 KiB citing ARG_MAX,
 * and while stdout is not argv, nothing has measured where each vendor
 * truncates it -- a chunk small enough to be boring beats a fast one that
 * silently loses its tail on one substrate.
 */
export const EXPORT_CHUNK_RAW_BYTES = 262_144;
const DD_BLOCK_SIZE = 65_536;
const DD_BLOCKS_PER_CHUNK = EXPORT_CHUNK_RAW_BYTES / DD_BLOCK_SIZE;

const PROBE_TIMEOUT_MS = 30_000;
const CHUNK_TIMEOUT_MS = 120_000;
/** Building or extracting the tar on a cold, throttled sandbox is slow;
 * a truncated extraction is a half-restored machine, so the budget is
 * generous. */
export const DEFAULT_TAR_TIMEOUT_MS = 600_000;

function shq(value: string): string {
	// Allowlist paths and marker payloads are ours (no single quotes), but
	// quoting is still done properly so a future path cannot inject.
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tail(text: string, limit = 500): string {
	return text.trim().slice(-limit);
}

// ---------------------------------------------------------------------------
// Presence probe
// ---------------------------------------------------------------------------

export type PresenceReport = {
	present: string[];
	skipped: Array<{ path: string; reason: string }>;
};

/** One exec that answers, per allowlist entry, whether it exists on the
 * source. Prefix-tagged lines rather than a trailing sentinel: sprites and
 * dedalus trim exec output, and a per-line prefix survives trimming where a
 * bare trailing marker did not. */
export function buildPresenceProbe(include: readonly string[]): string {
	const list = include.map(shq).join(" ");
	return `for p in ${list}; do if [ -e "$HOME/$p" ]; then echo "AM_MOVE P $p"; else echo "AM_MOVE A $p"; fi; done`;
}

/**
 * Which allowlist entries actually exist on the source. Entries absent are
 * REPORTED (report.state.skipped), never silently dropped -- a caller reading
 * "migrated ok" must be able to see that, say, no chats/ directory ever
 * existed rather than assume it moved.
 */
export async function probeIncludes(
	handle: MoveSource,
	include: readonly string[],
): Promise<PresenceReport> {
	const result = await handle.exec(buildPresenceProbe(include), {
		timeoutMs: PROBE_TIMEOUT_MS,
	});
	if (result.exitCode !== 0) {
		throw new MuxError(
			"transient",
			`state export presence probe failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`,
		);
	}
	const verdicts = new Map<string, "P" | "A">();
	for (const line of result.stdout.split("\n")) {
		const match = /^AM_MOVE ([PA]) (.+)$/.exec(line.trim());
		if (match) verdicts.set(match[2], match[1] as "P" | "A");
	}
	const present: string[] = [];
	const skipped: Array<{ path: string; reason: string }> = [];
	for (const path of include) {
		const verdict = verdicts.get(path);
		if (verdict === "P") present.push(path);
		else if (verdict === "A") skipped.push({ path, reason: "not present on the source" });
		// Fail closed on a verdict the probe never printed: treating a
		// swallowed line as "present" would put a path in the tar command
		// that tar then errors on, or worse, in `moved` without evidence.
		else skipped.push({ path, reason: "presence probe returned no verdict for this path" });
	}
	return { present, skipped };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The tar command run on the source. `--ignore-failed-read` covers the race
 * where a file vanishes between the presence probe and this command; the
 * probe (not this flag) is what reports absences, so nothing is silently
 * dropped. Refuses an empty include list: `tar` with no operands refuses to
 * create an empty archive, and an empty allowlist means the caller skipped
 * the probe.
 */
export function buildExportCommand(plan: StateMovePlan, tarPath: string): string {
	if (plan.include.length === 0) {
		throw new MuxError(
			"fatal",
			"state export has no paths to ship; probe the allowlist first (an empty tar would be reported as a successful move)",
		);
	}
	const excludes = plan.exclude.map((pattern) => `--exclude=${shq(pattern)}`).join(" ");
	const includes = plan.include.map(shq).join(" ");
	return `tar -C "$HOME" -czf ${shq(tarPath)} --ignore-failed-read ${excludes} ${includes}`;
}

export type ExportedTar = {
	bytes: Buffer;
	/** The digest computed ON THE SOURCE, which the target re-verifies. */
	sha256: string;
};

/**
 * Read a tar OUT of a sandbox over exec stdout, sized and digest-verified.
 *
 * Sequence: `stat -c %s` for the size (and the 512 MiB fail-closed guard),
 * `sha256sum` on the source, then the chunk loop, then a local digest that
 * must equal the source's -- a mismatch aborts as `transient` naming BOTH
 * digests, before anything consumed the bytes. Chunk reads strip newlines
 * from the base64 so the sprites/dedalus output trimming cannot corrupt a
 * chunk boundary.
 */
export async function exportTar(
	handle: MoveSource,
	tarPath: string,
	options: { include?: readonly string[]; chunkTimeoutMs?: number } = {},
): Promise<ExportedTar> {
	const stat = await handle.exec(`stat -c %s ${shq(tarPath)}`, { timeoutMs: PROBE_TIMEOUT_MS });
	const size = Number.parseInt(stat.stdout.trim(), 10);
	if (stat.exitCode !== 0 || !Number.isFinite(size) || size < 0) {
		throw new MuxError(
			"transient",
			`state export could not size the tar at ${tarPath} (exit ${stat.exitCode}): ${tail(stat.stderr || stat.stdout)}`,
		);
	}
	if (size > MAX_STATE_TAR_BYTES) {
		// Name the offenders, not just the number: the actionable fix is
		// pruning a directory, and `du` says which one.
		let offenders = "";
		if (options.include && options.include.length > 0) {
			const du = await handle
				.exec(
					`du -sh ${options.include.map((p) => `"$HOME/"${shq(p)}`).join(" ")} 2>/dev/null | sort -rh | head -8`,
					{ timeoutMs: PROBE_TIMEOUT_MS },
				)
				.catch(() => null);
			if (du?.stdout.trim()) offenders = ` Largest entries:\n${du.stdout.trim()}`;
		}
		throw new MuxError(
			"fatal",
			`state tar is ${size} bytes, over the ${MAX_STATE_TAR_BYTES}-byte limit; per-substrate exec-stdout ceilings are unmeasured, so larger workspaces fail closed rather than stream over an unproven channel.${offenders}`,
		);
	}

	const digest = await handle.exec(`sha256sum ${shq(tarPath)}`, { timeoutMs: PROBE_TIMEOUT_MS });
	const sourceSha = /^[0-9a-f]{64}/.exec(digest.stdout.trim())?.[0];
	if (digest.exitCode !== 0 || !sourceSha) {
		throw new MuxError(
			"transient",
			`state export could not hash the tar on the source (exit ${digest.exitCode}): ${tail(digest.stderr || digest.stdout)}`,
		);
	}

	const chunkTimeoutMs = options.chunkTimeoutMs ?? CHUNK_TIMEOUT_MS;
	const chunks: Buffer[] = [];
	const chunkCount = Math.ceil(size / EXPORT_CHUNK_RAW_BYTES);
	for (let index = 0; index < chunkCount; index += 1) {
		const skip = index * DD_BLOCKS_PER_CHUNK;
		const read = await handle.exec(
			`dd if=${shq(tarPath)} bs=${DD_BLOCK_SIZE} skip=${skip} count=${DD_BLOCKS_PER_CHUNK} 2>/dev/null | base64 | tr -d "\\n"`,
			{ timeoutMs: chunkTimeoutMs },
		);
		if (read.exitCode !== 0) {
			throw new MuxError(
				"transient",
				`state export chunk ${index + 1}/${chunkCount} failed (exit ${read.exitCode}): ${tail(read.stderr || read.stdout)}`,
			);
		}
		chunks.push(Buffer.from(read.stdout.trim(), "base64"));
	}
	const bytes = Buffer.concat(chunks);
	if (bytes.length !== size) {
		throw new MuxError(
			"transient",
			`state export reassembled ${bytes.length} bytes but the source tar is ${size}; a chunk was truncated in transit`,
		);
	}
	const localSha = createHash("sha256").update(bytes).digest("hex");
	if (localSha !== sourceSha) {
		throw new MuxError(
			"transient",
			`state export digest mismatch: source sha256 ${sourceSha}, reassembled sha256 ${localSha}; aborting before anything consumed the tar`,
		);
	}
	return { bytes, sha256: sourceSha };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/** The source's $HOME, marker-delimited so output trimming cannot eat it. */
export async function readHome(handle: MoveSource): Promise<string | undefined> {
	const result = await handle
		.exec(`echo "AM_MOVE_HOME:$HOME:"`, { timeoutMs: PROBE_TIMEOUT_MS })
		.catch(() => null);
	const match = result ? /AM_MOVE_HOME:([^:\n]+):/.exec(result.stdout) : null;
	return match?.[1];
}

export type RestoreOptions = {
	/** The SOURCE digest; the target recomputes and must match, or the
	 * restore aborts before extraction. */
	sha256: string;
	/** The machine's agent, rewritten into terminal-agent.json so a tmux
	 * restore does not relaunch a stale harness. */
	agent: HarnessKind;
	/** The source's $HOME. When it differs from the target's, the known
	 * TEXT configs that embed it are rewritten. Omitted = no rewrite (the
	 * fixup is skipped, never guessed). */
	oldHome?: string;
	timeoutMs?: number;
};

/**
 * Land an exported tar on the target: one writeFile, one FOREGROUND exec.
 *
 * The digest re-check happens ON THE TARGET (exit 65) because writeFile is a
 * vendor SDK whose treatment of large payloads is theirs, not ours -- the
 * local copy matching the source proves nothing about what landed. The
 * extraction runs in the foreground on every substrate because sprites
 * throttles detached work (measured 2026-08-01: 17s foreground vs >15min
 * detached), and completion is proven by BOTH the exit code and a sentinel
 * line -- a substrate was measured returning exit 0 for a killed process
 * (loadout.ts, docs/MUX-RESULTS.md), and either signal alone can lie.
 *
 * Post-extraction fixups, inside the same script so a half-fixed machine
 * cannot be reported as restored: terminal-agent.json's desiredAgentKind is
 * rewritten to the machine's agent (web's tmux restore relaunches the
 * REMEMBERED agent, which goes stale across a move), and the three known
 * text configs that embed absolute paths (.codex/config.toml, .claude.json,
 * .agent-machines/config.yaml) get oldHome -> newHome rewritten when the
 * homes differ. sed-to-temp-then-mv, not `sed -i`: BSD and GNU sed disagree
 * about -i's argument (the loadout.ts awk rationale). hermes state.db is
 * deliberately left alone -- rewriting bytes inside a SQLite file corrupts
 * it -- and MOVE_NOTES names that gap.
 */
export async function restoreTar(
	handle: MoveTarget,
	bytes: Buffer,
	options: RestoreOptions,
): Promise<void> {
	const payload = bytes.toString("base64");
	const stamp = options.sha256.slice(0, 16);
	const payloadPath = `/tmp/am-migrate-${stamp}.b64`;
	const tarPath = `/tmp/am-migrate-${stamp}.tgz`;
	await handle.writeFile(payloadPath, payload);

	const fixups: string[] = [
		`state_file="$HOME/.agent-machines/state/terminal-agent.json"`,
		`if [ -f "$state_file" ]; then`,
		`  sed 's/"desiredAgentKind"[[:space:]]*:[[:space:]]*"[^"]*"/"desiredAgentKind":"${options.agent}"/' "$state_file" > "$state_file.am-migrate" && mv "$state_file.am-migrate" "$state_file"`,
		`fi`,
	];
	if (options.oldHome) {
		fixups.push(
			`if [ "$HOME" != ${shq(options.oldHome)} ]; then`,
			`  for f in "$HOME/.codex/config.toml" "$HOME/.claude.json" "$HOME/.agent-machines/config.yaml"; do`,
			`    [ -f "$f" ] || continue`,
			`    sed "s|${options.oldHome}|$HOME|g" "$f" > "$f.am-migrate" && mv "$f.am-migrate" "$f"`,
			`  done`,
			`fi`,
		);
	}

	const script = [
		"set -e",
		`base64 -d < ${shq(payloadPath)} > ${shq(tarPath)}`,
		`actual=$(sha256sum ${shq(tarPath)} | cut -d" " -f1)`,
		`[ "$actual" = "${options.sha256}" ] || { echo "AM_MOVE_SHA_MISMATCH $actual" >&2; rm -f ${shq(payloadPath)} ${shq(tarPath)}; exit 65; }`,
		`tar -C "$HOME" -xzf ${shq(tarPath)}`,
		`rm -f ${shq(payloadPath)} ${shq(tarPath)}`,
		...fixups,
		`echo AM_MOVE_RESTORED`,
	].join("\n");

	const result = await handle.exec(script, {
		timeoutMs: options.timeoutMs ?? DEFAULT_TAR_TIMEOUT_MS,
	});
	if (result.exitCode === 65) {
		const actual = /AM_MOVE_SHA_MISMATCH ([0-9a-f]+)/.exec(result.stderr)?.[1] ?? "unreadable";
		throw new MuxError(
			"transient",
			`state restore digest mismatch on the target: expected sha256 ${options.sha256}, decoded sha256 ${actual}; nothing was extracted`,
		);
	}
	if (result.exitCode !== 0 || !result.stdout.includes("AM_MOVE_RESTORED")) {
		throw new MuxError(
			"transient",
			`state restore failed on the target (exit ${result.exitCode}${
				result.stdout.includes("AM_MOVE_RESTORED") ? "" : ", completion sentinel missing"
			}): ${tail(result.stderr || result.stdout)}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

export type MigrationMarker = {
	name: string;
	fromSubstrate: SubstrateKind;
	fromSandboxId: string;
	/** Fresh per migration; equality on the target is the proof the LOAD
	 * landed, not merely that some old marker file exists. */
	nonce: string;
	at: string;
};

/**
 * Written on the SOURCE before the tar (the only source mutation before
 * commit -- additive and harmless), so it rides the archive and can be read
 * back on the target. Base64 through the shell: marker fields are
 * caller-chosen text, and base64 is immune to both quoting and the
 * sprites/dedalus output trimming.
 */
export async function writeMarker(handle: MoveSource, marker: MigrationMarker): Promise<void> {
	const payload = Buffer.from(JSON.stringify(marker), "utf8").toString("base64");
	const result = await handle.exec(
		`mkdir -p "$HOME/.agent-machines" && printf '%s' '${payload}' | base64 -d > "$HOME/${MIGRATION_MARKER_PATH}"`,
		{ timeoutMs: PROBE_TIMEOUT_MS },
	);
	if (result.exitCode !== 0) {
		throw new MuxError(
			"transient",
			`could not write the migration marker on the source (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`,
		);
	}
}

export type MarkerVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Read the marker back on the TARGET and compare field-by-field. Parsed JSON
 * rather than raw bytes on purpose: sprites and dedalus trim trailing
 * whitespace from exec output, so a byte comparison would fail on a healthy
 * restore; the nonce equality is what actually proves this tar, from this
 * migration, landed.
 */
export async function verifyMarker(
	handle: MoveSource,
	expected: MigrationMarker,
): Promise<MarkerVerdict> {
	const result = await handle.exec(`cat "$HOME/${MIGRATION_MARKER_PATH}"`, {
		timeoutMs: PROBE_TIMEOUT_MS,
	});
	if (result.exitCode !== 0) {
		return { ok: false, reason: "marker file is missing on the target; the restored tar did not carry it" };
	}
	let parsed: Partial<MigrationMarker>;
	try {
		parsed = JSON.parse(result.stdout.trim()) as Partial<MigrationMarker>;
	} catch {
		return { ok: false, reason: "marker file on the target is not parseable JSON" };
	}
	for (const key of ["name", "fromSubstrate", "fromSandboxId", "nonce", "at"] as const) {
		if (parsed[key] !== expected[key]) {
			return {
				ok: false,
				reason: `marker field "${key}" reads ${JSON.stringify(parsed[key])} but this migration wrote ${JSON.stringify(expected[key])} (a stale marker from an earlier migration, or the restore landed elsewhere)`,
			};
		}
	}
	return { ok: true };
}

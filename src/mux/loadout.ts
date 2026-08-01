/**
 * Loadout installer: put memory, skills and MCP servers on a machine.
 *
 * Roadmap pillar 15 states the gap this closes: "Bundles install only through
 * the control-plane provider layer; the mux has no memory/loadout concept, so
 * an `agent-machines` SDK user gets a bare harness." This module is the SDK
 * side of that, and it deliberately reproduces the layout the hosted path
 * already writes rather than inventing a second one:
 *
 *   web/lib/memory/install.ts   -- the four persona docs under
 *                                  $HOME/.agent-machines, plus a combined doc
 *                                  at the per-runtime entrypoint.
 *   web/lib/bootstrap/reload-script.ts
 *                               -- knowledge/skills/ rsynced to
 *                                  $RUNTIME/skills/<slug>/SKILL.md.
 *   web/lib/dashboard/skills/custom-skill.ts
 *                               -- user skills at skills/custom/<slug>/SKILL.md.
 *
 * Substrate-agnostic by construction: the only thing it touches is a
 * `LoadoutTarget`, a two-method slice of SandboxHandle (type-only import), so
 * nothing here depends on the router or on any vendor SDK.
 *
 * Three properties the tests pin, because each one has a failure mode worse
 * than not installing at all:
 *
 *   Fail closed. An id that is not in the registry throws, naming the id. A
 *   silently skipped ability is worse than an error: the agent then behaves as
 *   if it has a tool it does not have.
 *
 *   Idempotent. Re-installing the same loadout leaves byte-identical files,
 *   and installing a SMALLER loadout removes the skills that left it -- pruned
 *   against the manifest we wrote last time, so a user's own skills and
 *   anything another tool put in the tree survive.
 *
 *   Bounded. 161 skills is 1.5 MB of SKILL.md. Written one exec per file that
 *   is 161 round trips; here it is ONE writeFile plus ONE exec regardless of
 *   loadout size, because the whole tree ships as a single gzipped tar written
 *   as base64 text (the pattern in src/lib/upload.ts, and the reason
 *   node-runtime.ts picks .tar.gz over .xz: tar never needs xz support).
 *   Measured on the bundled set: 1,523,725 raw -> 529 KB gzip -> 706 KB
 *   base64. SandboxHandle.writeFile is binary/large-safe on every adapter
 *   (e2b files.write, sprites fs.writeFile, vercel writeFiles, and dedalus
 *   chunks base64 itself), so the payload never rides an argv.
 *
 * ---------------------------------------------------------------------------
 * Where each harness reads its loadout, and how each location was established
 * ---------------------------------------------------------------------------
 *
 * claude-code -- VERIFIED 2026-08-01 against the installed CLI (2.x) by
 *   running it with an isolated HOME and reading its own --debug-file:
 *     - user skills: $HOME/.claude/skills/<slug>/SKILL.md ("Loading skills
 *       from: ... user=<HOME>/.claude/skills", "Loaded 1 unique skills ...
 *       user: 1"). A symlink there is followed, so the canonical tree is
 *       linked rather than copied twice.
 *     - user MCP servers: $HOME/.claude.json, top-level `mcpServers`
 *       (`claude mcp add --scope user` reported "File modified:
 *       <HOME>/.claude.json" and wrote {type,command,args,env}).
 *     - AND THE MUX RUN PATH SEES NEITHER. `claudeCodeHarness.runCommand`
 *       passes --bare, under which the same debug log says "[reduced mode]
 *       Skipping skill dir discovery" (0 skill dir commands) and the
 *       user-scope server never appears, while the identical run without
 *       --bare loads both. --bare also disables CLAUDE.md auto-discovery per
 *       `claude --help`. So files alone are not enough for this harness:
 *       the run must also carry --mcp-config, --plugin-dir and
 *       --append-system-prompt-file, all three of which WERE observed to work
 *       under --bare. They are returned as `runArgs` (see LoadoutPlan) rather
 *       than written anywhere, because the caller owns the run.
 *     - END TO END: a tree this module actually produced, driven by the exact
 *       flag set claudeCodeHarness.runCommand builds (--bare -p --output-format
 *       stream-json --verbose --dangerously-skip-permissions) plus those
 *       runArgs, logged "Loaded inline plugin from path: .agent-machines",
 *       "Total plugin skills loaded: 1" and `MCP server "probe-mcp": Starting
 *       connection`. So the plan is not merely well-formed; the CLI reads it.
 *
 * codex -- VERIFIED 2026-08-01 against codex-cli 0.146.0, the exact version
 *   src/mux/harnesses/codex.ts pins, run with an isolated CODEX_HOME:
 *   `codex mcp add probe --env API_KEY=xxx -- npx -y some-mcp` wrote
 *   $CODEX_HOME/config.toml containing `[mcp_servers.probe]` with `command`,
 *   `args`, and a `[mcp_servers.probe.env]` sub-table, and re-running it
 *   produced the same file. The mux sets no CODEX_HOME, so the default
 *   $HOME/.codex/config.toml is the target and no run argument is needed.
 *   `codex exec --json` against that config then reported
 *   `mcp_servers="probe" ... mcp_server_count=1` and reached
 *   `session_init.mcp_manager_init ... stdio_server_launcher`, so the run path
 *   this adapter drives does start what the file declares.
 *
 * openclaw -- OMITTED. No MCP config location for openclaw 2026.7.1-2 could be
 *   verified here: the CLI is not installed, and this repo's own reference to
 *   $HOME/.openclaw/config.json (web/lib/agents/machine-introspection.ts:137)
 *   is our code, not the vendor's. Naming a server for openclaw therefore
 *   fails closed rather than writing a file the agent may never read.
 *
 * hermes -- OMITTED. The hosted path writes `mcp_servers` into
 *   $HERMES_HOME/config.yaml (web/lib/bootstrap/reload-script.ts), but it also
 *   EXPORTS HERMES_HOME; src/mux/harnesses/hermes.ts does not, so which config
 *   a mux-installed hermes reads is unknown. Naming a server for hermes fails
 *   closed until hermes.ts pins HERMES_HOME.
 *
 * Skills for codex, openclaw and hermes land in the canonical
 * $HOME/.agent-machines/skills tree, which is what the hosted reload script
 * produces and what those runtimes' own skill listings read there. Only
 * claude-code needed a harness-specific mirror.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { MuxError, type HarnessKind, type SandboxHandle } from "./types.js";

// ---------------------------------------------------------------------------
// On-machine layout constants (mirrors of the hosted path)
// ---------------------------------------------------------------------------

/**
 * Everything is written relative to $HOME and the archive is extracted with
 * `tar -C "$HOME"`, so no absolute path is ever baked into the payload and the
 * whole layout is assertable in a unit test without a machine.
 */
export const RUNTIME_ROOT = ".agent-machines";

/** Bundled skills, the target web/lib/bootstrap/reload-script.ts rsyncs to. */
export const SKILLS_DIR = `${RUNTIME_ROOT}/skills`;

/** User skills, the path web/lib/dashboard/skills/custom-skill.ts writes. */
export const CUSTOM_SKILLS_DIR = `${SKILLS_DIR}/custom`;

/** Private working area: manifest, apply script, harness config fragments. */
export const LOADOUT_DIR = `${RUNTIME_ROOT}/.loadout`;

/** The four persona docs, in the order web/lib/memory/install.ts writes them. */
export const MEMORY_DOC_FILES = [
	["soul", "SOUL.md"],
	["agentDocs", "AGENTS.md"],
	["memory", "MEMORY.md"],
	["user", "USER.md"],
] as const;

export type MemoryDocKey = (typeof MEMORY_DOC_FILES)[number][0];
export type MemoryDocs = Record<MemoryDocKey, string>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * One installable skill.
 *
 * `content` is the whole SKILL.md, written verbatim: this module never
 * rewrites frontmatter, because a skill whose text differs from the registry's
 * is a different skill and the operator did not ask for one.
 */
export type SkillEntry = {
	readonly slug: string;
	readonly content: string;
	/** User-authored skills go under skills/custom/, as the dashboard does. */
	readonly custom?: boolean;
};

/**
 * One installable MCP server.
 *
 * `launch` is null when the registry knows OF a server but not how to START
 * it, and `unlaunchableReason` says why. That distinction is the whole point:
 * a bundle naming such a server must fail with the reason rather than quietly
 * produce a config with no command in it.
 */
export type McpServerEntry = {
	readonly id: string;
	/** Key the harness config uses. Defaults to `id`. */
	readonly name?: string;
	readonly launch: McpLaunch | null;
	readonly unlaunchableReason?: string;
};

export type McpLaunch =
	| {
			readonly transport: "stdio";
			readonly command: string;
			readonly args?: readonly string[];
			readonly env?: Readonly<Record<string, string>>;
	  }
	| { readonly transport: "http"; readonly url: string };

export type LoadoutRegistry = {
	readonly skills: readonly SkillEntry[];
	readonly mcpServers: readonly McpServerEntry[];
};

/** What a caller asks for. Ids are resolved against the registry, never guessed. */
export type DeclaredLoadout = {
	readonly docs?: Partial<MemoryDocs>;
	readonly skillIds?: readonly string[];
	readonly mcpServerIds?: readonly string[];
};

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type LoadoutFile = {
	/** Relative to $HOME. */
	readonly path: string;
	readonly content: string;
	/** Set only for the apply script; everything else is data. */
	readonly executable?: boolean;
};

/** `ln -sfn target link`, both relative to $HOME. */
export type LoadoutLink = { readonly link: string; readonly target: string };

export type LoadoutCost = {
	/** Sum of file contents before packing. */
	readonly rawBytes: number;
	/** The gzipped tar. */
	readonly archiveBytes: number;
	/** What actually crosses the wire (base64 of the archive). */
	readonly payloadBytes: number;
	readonly fileCount: number;
	/** Round trips the install costs, whatever the loadout size. */
	readonly writes: number;
	readonly execs: number;
};

export type LoadoutPlan = {
	readonly harness: HarnessKind;
	readonly files: readonly LoadoutFile[];
	readonly links: readonly LoadoutLink[];
	/**
	 * Arguments a run MUST carry for this harness to see what was installed.
	 * Empty for harnesses that read their config unprompted. Pass them through
	 * `HarnessRunOptions.extraArgs`; the claude-code adapter appends extraArgs
	 * verbatim on both the headless and the interactive path.
	 */
	readonly runArgs: readonly string[];
	/** Skill slugs installed, in install order. */
	readonly skillSlugs: readonly string[];
	/** MCP server names configured, in config order. */
	readonly mcpServerNames: readonly string[];
	/** Honest gaps for THIS harness, surfaced rather than hidden. */
	readonly notes: readonly string[];
	readonly cost: LoadoutCost;
};

// ---------------------------------------------------------------------------
// Harness capability table
// ---------------------------------------------------------------------------

type McpWriter = (servers: readonly ResolvedServer[]) => {
	files: LoadoutFile[];
	/** POSIX sh, run after extraction. Empty when files alone suffice. */
	apply: string[];
	runArgs: string[];
};

type ResolvedServer = { name: string; launch: McpLaunch };

type HarnessSpec = {
	/** Extra places the combined persona doc must land, relative to $HOME. */
	readonly combinedDocPaths: readonly string[];
	/** Where this harness reads skills from, when not the canonical tree. */
	readonly skillLink: LoadoutLink | null;
	/** Null when no MCP location for this harness could be verified. */
	readonly mcp: McpWriter | null;
	/** Why `mcp` is null, quoted verbatim into the fail-closed error. */
	readonly mcpGap?: string;
	/** Arguments every run needs, independent of MCP servers. */
	readonly baseRunArgs: (plan: { hasDocs: boolean; hasSkills: boolean }) => string[];
	readonly notes: readonly string[];
};

/** JSON with a stable key order, so two installs of one loadout are identical. */
function stableJson(value: unknown): string {
	return `${JSON.stringify(value, null, "\t")}\n`;
}

/**
 * TOML string literal. Basic strings are the only form codex writes, and the
 * only characters that need escaping inside one are backslash and quote plus
 * the control characters; anything else is passed through unchanged.
 */
function tomlString(value: string): string {
	const escaped = value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
	return `"${escaped}"`;
}

/**
 * A TOML bare key where the name allows it, quoted otherwise. codex accepts
 * both; quoting everything would make our output differ from `codex mcp add`'s
 * for no reason, which makes a diff against a hand-managed file noisy.
 */
function tomlKey(value: string): string {
	return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

/** Region markers for the codex config: see codexMcpWriter. */
export const CODEX_REGION_BEGIN = "# >>> agent-machines loadout >>>";
export const CODEX_REGION_END = "# <<< agent-machines loadout <<<";

const CLAUDE_MCP_FILE = `${LOADOUT_DIR}/claude-mcp.json`;
const CLAUDE_SYSTEM_FILE = `${LOADOUT_DIR}/claude-system.md`;
const CODEX_REGION_FILE = `${LOADOUT_DIR}/codex-mcp.toml`;

/**
 * claude-code: a file we own outright, handed to the run with --mcp-config.
 *
 * Deliberately NOT a merge into $HOME/.claude.json. That file is claude's own
 * state (userID, migrationVersion, per-project history), so touching it needs
 * a JSON parser on the sandbox and risks clobbering state we did not write --
 * and it would still be invisible to the mux's run path, which passes --bare.
 * --mcp-config was measured to work under --bare, is byte-stable, and prunes
 * itself: rewriting the file IS the removal of whatever was in it before.
 */
const claudeMcpWriter: McpWriter = (servers) => {
	const mcpServers: Record<string, unknown> = {};
	for (const server of servers) {
		mcpServers[server.name] =
			server.launch.transport === "stdio"
				? {
						type: "stdio",
						command: server.launch.command,
						args: [...(server.launch.args ?? [])],
						env: { ...(server.launch.env ?? {}) },
					}
				: { type: "http", url: server.launch.url };
	}
	return {
		files: [{ path: CLAUDE_MCP_FILE, content: stableJson({ mcpServers }) }],
		apply: [],
		runArgs: ["--mcp-config", `"$HOME/${CLAUDE_MCP_FILE}"`],
	};
};

/**
 * codex: a marker-delimited region appended to $HOME/.codex/config.toml.
 *
 * codex owns that file and writes unrelated tables into it (`model`,
 * `[profiles.*]`, `[plugins.*]` -- all observed in a real installation), so
 * replacing it wholesale would destroy configuration the operator set. TOML
 * tables are order-independent and a table header at end-of-file always closes
 * whatever preceded it, so appending is safe; the markers make the append
 * idempotent, since the next install deletes the old region before writing the
 * new one. Comments survive a hand edit outside the region, which a TOML
 * parser round-trip would not have guaranteed -- and no TOML parser is
 * available on a sandbox anyway.
 */
const codexMcpWriter: McpWriter = (servers) => {
	const lines: string[] = [CODEX_REGION_BEGIN];
	for (const server of servers) {
		lines.push(`[mcp_servers.${tomlKey(server.name)}]`);
		if (server.launch.transport === "http") {
			lines.push(`url = ${tomlString(server.launch.url)}`);
			lines.push("");
			continue;
		}
		lines.push(`command = ${tomlString(server.launch.command)}`);
		const args = server.launch.args ?? [];
		lines.push(`args = [${args.map(tomlString).join(", ")}]`);
		const env = server.launch.env ?? {};
		const envKeys = Object.keys(env).sort();
		if (envKeys.length > 0) {
			lines.push("");
			lines.push(`[mcp_servers.${tomlKey(server.name)}.env]`);
			for (const key of envKeys) lines.push(`${tomlKey(key)} = ${tomlString(env[key])}`);
		}
		lines.push("");
	}
	lines.push(CODEX_REGION_END);
	return {
		files: [{ path: CODEX_REGION_FILE, content: `${lines.join("\n")}\n` }],
		apply: [
			'mkdir -p "$HOME/.codex"',
			'touch "$HOME/.codex/config.toml"',
			// awk, not sed -i: BSD and GNU sed disagree about -i's argument, and
			// a sandbox image may ship either. Dropping the old region before
			// appending the new one is what makes a re-install a no-op instead
			// of a file that grows a duplicate table every time.
			`awk 'BEGIN{skip=0} $0=="${CODEX_REGION_BEGIN}"{skip=1} skip==0{print} $0=="${CODEX_REGION_END}"{skip=0}' "$HOME/.codex/config.toml" > "$HOME/${LOADOUT_DIR}/codex-config.trimmed"`,
			`cat "$HOME/${CODEX_REGION_FILE}" >> "$HOME/${LOADOUT_DIR}/codex-config.trimmed"`,
			`mv "$HOME/${LOADOUT_DIR}/codex-config.trimmed" "$HOME/.codex/config.toml"`,
		],
		runArgs: [],
	};
};

const HARNESS_SPECS: Record<HarnessKind, HarnessSpec> = {
	"claude-code": {
		// web/lib/memory/install.ts writes both of these for claude-code.
		combinedDocPaths: [".claude/CLAUDE.md", "CLAUDE.md"],
		// Verified: claude follows a symlink at ~/.claude/skills, so the
		// canonical tree is the only copy of 1.5 MB of SKILL.md on the machine.
		skillLink: { link: ".claude/skills", target: `../${SKILLS_DIR}` },
		mcp: claudeMcpWriter,
		baseRunArgs: ({ hasDocs, hasSkills }) => {
			const args: string[] = [];
			// --bare skips skill-dir discovery and CLAUDE.md entirely (measured);
			// --plugin-dir and --append-system-prompt-file are the two levers
			// that were observed to still work under it.
			if (hasSkills) args.push("--plugin-dir", `"$HOME/${RUNTIME_ROOT}"`);
			if (hasDocs) args.push("--append-system-prompt-file", `"$HOME/${CLAUDE_SYSTEM_FILE}"`);
			return args;
		},
		notes: [
			"claude-code: the mux run path passes --bare, which skips skill-dir discovery, CLAUDE.md auto-discovery and user-scope MCP servers (measured 2026-08-01 from the CLI's own --debug-file). Pass LoadoutPlan.runArgs as HarnessRunOptions.extraArgs or the installed loadout is invisible to a headless run.",
		],
	},
	codex: {
		combinedDocPaths: [".codex/AGENTS.md", "AGENTS.md"],
		// Codex reads AGENTS.md, not a skills directory; no mirror to make.
		skillLink: null,
		mcp: codexMcpWriter,
		baseRunArgs: () => [],
		notes: [
			"codex: skills land in the canonical ~/.agent-machines/skills tree, and a codex run reads the combined AGENTS.md rather than that tree. codex 0.146.0 does have a skills root of its own -- it seeded $CODEX_HOME/skills/.system/<slug>/SKILL.md on first run and advertises a SkillSearch feature -- but a user skill at $CODEX_HOME/skills/<slug>/SKILL.md was never observed being LOADED here, so nothing is mirrored there yet. Reference a skill by path from AGENTS.md until that is settled.",
		],
	},
	openclaw: {
		combinedDocPaths: [".openclaw/workspace/SOUL.md", ".openclaw/workspace/AGENTS.md"],
		skillLink: null,
		mcp: null,
		mcpGap:
			"no MCP config location for openclaw 2026.7.1-2 has been verified (the CLI was not available to probe, and this repo's ~/.openclaw/config.json reference is our own code, not vendor documentation)",
		baseRunArgs: () => [],
		notes: [
			"openclaw: MCP servers are not installable through this module; see LoadoutPlan gaps. Persona docs follow web/lib/memory/install.ts (workspace SOUL.md + AGENTS.md, which are NOT the combined doc).",
		],
	},
	hermes: {
		// Hermes reads the canonical root; install.ts writes nothing extra.
		combinedDocPaths: [],
		skillLink: null,
		mcp: null,
		mcpGap:
			"the hosted path writes mcp_servers into $HERMES_HOME/config.yaml and exports HERMES_HOME, but src/mux/harnesses/hermes.ts exports no HERMES_HOME, so the config a mux-installed hermes reads is unknown",
		baseRunArgs: () => [],
		notes: [
			"hermes: reads the canonical ~/.agent-machines docs directly, so no combined doc is written (matching web/lib/memory/install.ts).",
		],
	},
};

/** Harnesses whose MCP config location this module can honestly write. */
export function harnessesWithMcpSupport(): HarnessKind[] {
	return (Object.keys(HARNESS_SPECS) as HarnessKind[]).filter(
		(kind) => HARNESS_SPECS[kind].mcp !== null,
	);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Combined persona doc for runtimes that read one entrypoint file.
 *
 * Byte-for-byte the same assembly as `combinedDoc` in
 * web/lib/memory/install.ts, headings included: the two paths must not put
 * different text on a machine for the same bundle, and a test compares them.
 */
export function combinedDoc(docs: MemoryDocs): string {
	const parts: string[] = [];
	if (docs.soul.trim()) parts.push(`# Persona & voice\n\n${docs.soul.trim()}`);
	if (docs.agentDocs.trim()) {
		parts.push(`# Operating rules & agent docs\n\n${docs.agentDocs.trim()}`);
	}
	if (docs.memory.trim()) parts.push(`# Working memory\n\n${docs.memory.trim()}`);
	if (docs.user.trim()) parts.push(`# Operator profile\n\n${docs.user.trim()}`);
	return parts.join("\n\n");
}

function normalizeDocs(docs: Partial<MemoryDocs> | undefined): MemoryDocs {
	return {
		soul: docs?.soul ?? "",
		agentDocs: docs?.agentDocs ?? "",
		memory: docs?.memory ?? "",
		user: docs?.user ?? "",
	};
}

/**
 * Resolve declared ids against the registry, or throw naming the first id that
 * does not resolve. Duplicate ids collapse; order follows the declaration so a
 * plan is reproducible.
 */
function resolveSkills(
	skillIds: readonly string[],
	registry: LoadoutRegistry,
): SkillEntry[] {
	const bySlug = new Map(registry.skills.map((skill) => [skill.slug, skill]));
	const out: SkillEntry[] = [];
	const seen = new Set<string>();
	for (const id of skillIds) {
		if (seen.has(id)) continue;
		seen.add(id);
		const skill = bySlug.get(id);
		if (!skill) {
			throw new MuxError(
				"fatal",
				`loadout names skill "${id}", which is not in the registry (${registry.skills.length} skills known). Installing the rest would hand the agent a loadout it does not have.`,
			);
		}
		out.push(skill);
	}
	return out;
}

function resolveServers(
	serverIds: readonly string[],
	registry: LoadoutRegistry,
	harness: HarnessKind,
): ResolvedServer[] {
	const spec = HARNESS_SPECS[harness];
	const byId = new Map(registry.mcpServers.map((server) => [server.id, server]));
	const out: ResolvedServer[] = [];
	const seen = new Set<string>();
	for (const id of serverIds) {
		if (seen.has(id)) continue;
		seen.add(id);
		const server = byId.get(id);
		if (!server) {
			throw new MuxError(
				"fatal",
				`loadout names MCP server "${id}", which is not in the registry (${registry.mcpServers.length} servers known). Installing the rest would hand the agent a tool it does not have.`,
			);
		}
		if (!server.launch) {
			throw new MuxError(
				"fatal",
				`loadout names MCP server "${id}", which the registry cannot launch: ${
					server.unlaunchableReason ?? "no command or url is recorded for it"
				}.`,
			);
		}
		if (!spec.mcp) {
			throw new MuxError(
				"not_supported",
				`loadout names MCP server "${id}" for harness "${harness}", but ${spec.mcpGap}. Remove the server from the loadout or run it on ${harnessesWithMcpSupport().join(" or ")}.`,
				{ harness },
			);
		}
		out.push({ name: server.name ?? server.id, launch: server.launch });
	}
	return out;
}

/** Reject a slug that would escape the skills directory. */
function assertSafeSlug(slug: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || slug === "." || slug === "..") {
		throw new MuxError(
			"fatal",
			`skill slug "${slug}" is not a safe directory name; a slug becomes a path under ~/${SKILLS_DIR}.`,
		);
	}
}

/**
 * The manifest is what makes a shrinking loadout safe. It records exactly the
 * skill directories THIS module created, so the next install can delete the
 * ones that left the loadout without touching a user's own skills or anything
 * another tool wrote into the same tree.
 */
const MANIFEST_FILE = `${LOADOUT_DIR}/manifest.json`;
const NEXT_MANIFEST_FILE = `${LOADOUT_DIR}/manifest.next.json`;
const APPLY_FILE = `${LOADOUT_DIR}/apply.sh`;

type Manifest = {
	readonly version: 1;
	readonly harness: HarnessKind;
	readonly skills: readonly string[];
};

export function planLoadout(
	harness: HarnessKind,
	loadout: DeclaredLoadout,
	registry: LoadoutRegistry,
): LoadoutPlan {
	const spec = HARNESS_SPECS[harness];
	const docs = normalizeDocs(loadout.docs);
	const skills = resolveSkills(loadout.skillIds ?? [], registry);
	const servers = resolveServers(loadout.mcpServerIds ?? [], registry, harness);

	const files: LoadoutFile[] = [];
	const notes: string[] = [...spec.notes];

	// 1. The four canonical persona docs, exactly where install.ts puts them.
	const hasDocs = MEMORY_DOC_FILES.some(([key]) => docs[key].trim().length > 0);
	for (const [key, file] of MEMORY_DOC_FILES) {
		files.push({ path: `${RUNTIME_ROOT}/${file}`, content: docs[key] });
	}

	// 2. The per-runtime entrypoint. openclaw is the one runtime that gets the
	//    raw soul/agentDocs rather than the combined doc; install.ts does the
	//    same, and diverging would put different text on the machine.
	const combined = combinedDoc(docs);
	if (harness === "openclaw") {
		files.push({ path: ".openclaw/workspace/SOUL.md", content: docs.soul });
		files.push({ path: ".openclaw/workspace/AGENTS.md", content: docs.agentDocs });
	} else {
		for (const path of spec.combinedDocPaths) files.push({ path, content: combined });
	}
	if (hasDocs && harness === "claude-code") {
		files.push({ path: CLAUDE_SYSTEM_FILE, content: combined });
	}

	// 3. Skills.
	for (const skill of skills) {
		assertSafeSlug(skill.slug);
		const dir = skill.custom ? CUSTOM_SKILLS_DIR : SKILLS_DIR;
		files.push({ path: `${dir}/${skill.slug}/SKILL.md`, content: skill.content });
	}

	// 4. MCP config, where the location is known.
	const mcp = servers.length > 0 && spec.mcp ? spec.mcp(servers) : null;
	if (mcp) files.push(...mcp.files);
	if (!spec.mcp) {
		notes.push(
			`${harness}: no MCP server can be configured -- ${spec.mcpGap ?? "location unverified"}.`,
		);
	}

	// 5. Manifest + apply script. The manifest ships under a staging name so
	//    the apply script can diff the previous install before replacing it.
	const skillPaths = skills.map((skill) =>
		skill.custom ? `${CUSTOM_SKILLS_DIR}/${skill.slug}` : `${SKILLS_DIR}/${skill.slug}`,
	);
	const manifest: Manifest = { version: 1, harness, skills: skillPaths };
	files.push({ path: NEXT_MANIFEST_FILE, content: stableJson(manifest) });
	files.push({
		path: APPLY_FILE,
		content: buildApplyScript(spec, mcp?.apply ?? []),
		executable: true,
	});

	const links = spec.skillLink && skills.length > 0 ? [spec.skillLink] : [];
	const runArgs = [
		...spec.baseRunArgs({ hasDocs, hasSkills: skills.length > 0 }),
		...(mcp?.runArgs ?? []),
	];

	const archive = gzipSync(buildTar(files), { level: 9 });
	const rawBytes = files.reduce(
		(total, file) => total + Buffer.byteLength(file.content, "utf8"),
		0,
	);

	return {
		harness,
		files,
		links,
		runArgs,
		skillSlugs: skills.map((skill) => skill.slug),
		mcpServerNames: servers.map((server) => server.name),
		notes,
		cost: {
			rawBytes,
			archiveBytes: archive.length,
			payloadBytes: base64Length(archive.length),
			fileCount: files.length,
			writes: 1,
			execs: 1,
		},
	};
}

function base64Length(bytes: number): number {
	return Math.ceil(bytes / 3) * 4;
}

/**
 * The script that runs once, after extraction.
 *
 * POSIX sh with `set -e`, no bashisms and no interpreter beyond the shell:
 * every substrate image in the matrix has sh, and requiring node or python
 * here would make the loadout install depend on the harness install having
 * already run.
 */
function buildApplyScript(spec: HarnessSpec, mcpApply: readonly string[]): string {
	const lines = [
		"#!/bin/sh",
		"set -e",
		`cd "$HOME"`,
		"",
		"# Remove skill directories a previous install created that this one no",
		"# longer declares. Scoped to the previous manifest on purpose: a skill",
		"# the operator wrote by hand is not ours to delete.",
		`if [ -f "${MANIFEST_FILE}" ]; then`,
		`  grep -o '"${SKILLS_DIR}/[^"]*"' "${MANIFEST_FILE}" 2>/dev/null | tr -d '"' | while IFS= read -r old; do`,
		`    grep -q "\\"$old\\"" "${NEXT_MANIFEST_FILE}" || rm -rf "$old"`,
		"  done",
		"fi",
		`mv "${NEXT_MANIFEST_FILE}" "${MANIFEST_FILE}"`,
		"",
	];
	if (spec.skillLink) {
		lines.push(
			"# Point the harness's own skills directory at the canonical tree",
			"# rather than shipping 1.5 MB of SKILL.md twice. -n so a re-install",
			"# replaces the link instead of writing inside the directory it names.",
			`mkdir -p "$(dirname "${spec.skillLink.link}")"`,
			// A real directory there is someone else's skills, and silently
			// leaving it would mean the harness reads THOSE while we report a
			// successful install -- the exact "agent thinks it has an ability it
			// lacks" failure. Refuse instead.
			`if [ -e "${spec.skillLink.link}" ] && [ ! -L "${spec.skillLink.link}" ]; then echo "loadout: ~/${spec.skillLink.link} already exists and is not a symlink; move it aside so the loadout skills can be linked there" >&2; exit 1; fi`,
			`ln -sfn "${spec.skillLink.target}" "${spec.skillLink.link}"`,
			"",
		);
	}
	if (mcpApply.length > 0) {
		lines.push("# MCP server configuration.", ...mcpApply, "");
	}
	lines.push('echo "AM_LOADOUT_INSTALLED"');
	return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

const TAR_BLOCK = 512;

/**
 * Minimal POSIX ustar writer.
 *
 * Hand-rolled rather than shelling out to `tar` (what src/lib/upload.ts does):
 * the mux ships as a published npm package, so the packing side has to work
 * wherever node runs and must not depend on a tar binary or on a dependency
 * this package does not already have.
 */
export function buildTar(files: readonly LoadoutFile[]): Buffer {
	const blocks: Buffer[] = [];
	const dirs = new Set<string>();
	for (const file of files) {
		const parts = file.path.split("/");
		for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join("/"));
	}
	// Sorted so every install of one loadout produces the same archive bytes,
	// and parents always precede children.
	for (const dir of [...dirs].sort()) {
		blocks.push(tarHeader(`${dir}/`, 0, "5", 0o755));
	}
	for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
		const body = Buffer.from(file.content, "utf8");
		blocks.push(tarHeader(file.path, body.length, "0", file.executable ? 0o755 : 0o644));
		blocks.push(body);
		const pad = (TAR_BLOCK - (body.length % TAR_BLOCK)) % TAR_BLOCK;
		if (pad > 0) blocks.push(Buffer.alloc(pad));
	}
	// Two zero blocks terminate the archive; a third pads to the 10 KiB record
	// size GNU tar warns about when it is missing.
	blocks.push(Buffer.alloc(TAR_BLOCK * 2));
	return Buffer.concat(blocks);
}

function tarHeader(path: string, size: number, typeFlag: string, mode: number): Buffer {
	if (Buffer.byteLength(path, "utf8") > 100) {
		// ustar can split a long name across prefix+name, but no path this
		// module builds comes close, and a silently truncated path would write
		// a skill to the wrong place. Fail instead.
		throw new MuxError("fatal", `loadout path is too long for a ustar header: ${path}`);
	}
	const header = Buffer.alloc(TAR_BLOCK);
	header.write(path, 0, 100, "utf8");
	header.write(octal(mode, 7), 100, 8, "ascii");
	header.write(octal(0, 7), 108, 8, "ascii");
	header.write(octal(0, 7), 116, 8, "ascii");
	header.write(octal(size, 11), 124, 12, "ascii");
	// Fixed mtime: a timestamp would make two archives of one loadout differ,
	// and nothing on the machine reads it.
	header.write(octal(0, 11), 136, 12, "ascii");
	header.write("        ", 148, 8, "ascii");
	header.write(typeFlag, 156, 1, "ascii");
	header.write("ustar\0", 257, 6, "ascii");
	header.write("00", 263, 2, "ascii");
	let checksum = 0;
	for (const byte of header) checksum += byte;
	header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
	return header;
}

function octal(value: number, width: number): string {
	return `${value.toString(8).padStart(width, "0")}\0`;
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * The whole substrate surface this module needs: write a file, run a command.
 * A real SandboxHandle satisfies it structurally, and so does a two-method
 * fake, which is what keeps these tests off the network.
 */
export type LoadoutTarget = Pick<SandboxHandle, "exec" | "writeFile">;

export type InstallLoadoutOptions = {
	/**
	 * Budget for the single unpack+apply exec. The default is generous because
	 * gunzipping 1.5 MB across 300-odd files on a cold sandbox is slower than
	 * it sounds, and a truncated extraction is a half-installed loadout.
	 */
	readonly timeoutMs?: number;
};

export type LoadoutInstallResult = {
	readonly plan: LoadoutPlan;
	/** Where the payload was staged, so a caller can clean up after a failure. */
	readonly payloadPath: string;
};

export const DEFAULT_INSTALL_TIMEOUT_MS = 180_000;

/**
 * Materialize a loadout on a machine. One writeFile, one exec.
 *
 * Safe to re-run: the archive overwrites what it wrote last time with the same
 * bytes, the apply script prunes only skills a previous manifest claimed, and
 * both MCP writers replace their own output rather than appending to it.
 */
export async function installLoadout(
	target: LoadoutTarget,
	harness: HarnessKind,
	loadout: DeclaredLoadout,
	registry: LoadoutRegistry,
	options: InstallLoadoutOptions = {},
): Promise<LoadoutInstallResult> {
	const plan = planLoadout(harness, loadout, registry);
	const archive = gzipSync(buildTar(plan.files), { level: 9 });
	const payload = archive.toString("base64");
	// Digest, not a timestamp: two concurrent installs of the SAME loadout then
	// stage the same file, and a retry after a half-written payload overwrites
	// it instead of leaking a new one per attempt.
	const digest = createHash("sha256").update(archive).digest("hex").slice(0, 16);
	const payloadPath = `/tmp/am-loadout-${digest}.b64`;

	await target.writeFile(payloadPath, payload);

	const script = [
		"set -e",
		`mkdir -p "$HOME/${LOADOUT_DIR}"`,
		// `base64 -d` reading a file, not a pipeline from printf: the payload is
		// already on disk, so nothing here is bounded by ARG_MAX.
		`base64 -d < "${payloadPath}" | tar -xzf - -C "$HOME"`,
		`sh "$HOME/${APPLY_FILE}"`,
		`rm -f "${payloadPath}"`,
	].join("\n");

	const result = await target.exec(script, {
		timeoutMs: options.timeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS,
	});
	if (result.exitCode !== 0) {
		throw new MuxError(
			"transient",
			`loadout install failed (exit ${result.exitCode}): ${
				result.stderr.trim().slice(0, 500) || result.stdout.trim().slice(0, 500) || "no output"
			}`,
			{ harness },
		);
	}
	if (!result.stdout.includes("AM_LOADOUT_INSTALLED")) {
		// The sentinel is the only proof the apply script ran to the end. A
		// substrate that returns 0 for a killed process (measured on hermes,
		// docs/MUX-RESULTS.md) would otherwise report a loadout that is not
		// there.
		throw new MuxError(
			"transient",
			`loadout install did not reach its completion sentinel; the machine may hold a partial loadout. Tail: ${result.stdout
				.trim()
				.slice(-300)}`,
			{ harness },
		);
	}
	return { plan, payloadPath };
}

// ---------------------------------------------------------------------------
// Registry loaders
// ---------------------------------------------------------------------------

/**
 * Read `<root>/<slug>/SKILL.md` into a registry's skill list.
 *
 * The repo's own knowledge/skills/ is exactly this shape, and so is the tree
 * this module writes -- so a machine's installed loadout can be re-read and
 * compared against what it was supposed to get. `custom/` is recognized as the
 * user-skill namespace the dashboard uses rather than as a skill named
 * "custom".
 */
export function loadSkillsFromDirectory(root: string): SkillEntry[] {
	const out: SkillEntry[] = [];
	for (const name of readdirSync(root).sort()) {
		const path = join(root, name);
		if (!statSync(path).isDirectory()) continue;
		if (name === "custom") {
			for (const slug of readdirSync(path).sort()) {
				const file = join(path, slug, "SKILL.md");
				const content = readIfFile(file);
				if (content !== null) out.push({ slug, content, custom: true });
			}
			continue;
		}
		const content = readIfFile(join(path, "SKILL.md"));
		if (content !== null) out.push({ slug: name, content });
	}
	return out;
}

function readIfFile(path: string): string | null {
	try {
		return statSync(path).isFile() ? readFileSync(path, "utf8") : null;
	} catch {
		return null;
	}
}

/** The shape web/data/mcps-catalog.json publishes. */
export type McpCatalog = {
	readonly servers: ReadonlyArray<{
		readonly id: string;
		readonly name?: string;
		readonly transport?: string;
		readonly command?: string;
		readonly args?: readonly string[];
		readonly env?: Readonly<Record<string, string>>;
		readonly url?: string;
		readonly installCommand?: string;
	}>;
};

export type ParseCatalogOptions = {
	/**
	 * Substitutions for the `{{VM_...}}` placeholders the catalog embeds in
	 * commands and env values. An entry with an unresolved placeholder is left
	 * unlaunchable rather than shipped with a literal `{{VM_NODE_BIN}}` in it.
	 */
	readonly vars?: Readonly<Record<string, string>>;
	/**
	 * Treat a catalog entry's `installCommand` as its stdio launch line.
	 *
	 * OFF by default, and it must stay a decision the caller makes out loud:
	 * 29 of the 39 catalog entries carry only an installCommand, the field is
	 * named for installing rather than running, and nothing in this repo has
	 * ever executed one as a server. Turning it on is a claim about those 29
	 * servers that no measurement here supports.
	 */
	readonly installCommandIsLaunch?: boolean;
};

/**
 * Convert the published catalog into a registry, marking every entry this code
 * cannot honestly launch instead of dropping it. A dropped entry would read as
 * "unknown id" later, which sends the operator hunting for a typo; an entry
 * carrying its own reason says what is actually wrong.
 */
export function mcpServersFromCatalog(
	catalog: McpCatalog,
	options: ParseCatalogOptions = {},
): McpServerEntry[] {
	const vars = options.vars ?? {};
	return catalog.servers.map((server) => {
		const base = { id: server.id, name: server.name ?? server.id };
		if (server.transport === "native") {
			return {
				...base,
				launch: null,
				unlaunchableReason: `catalog entry declares transport "native" (its tools are built into the runtime, so there is no server to start)`,
			};
		}
		if (server.url) return { ...base, launch: { transport: "http", url: server.url } as const };
		let command = server.command;
		let args = server.args ? [...server.args] : [];
		if (!command && server.installCommand) {
			if (!options.installCommandIsLaunch) {
				return {
					...base,
					launch: null,
					unlaunchableReason: `catalog entry has no command/args, only installCommand "${server.installCommand}", which is not proven to be its stdio launch line. Pass installCommandIsLaunch: true to accept it as one`,
				};
			}
			const tokens = server.installCommand.split(/\s+/).filter(Boolean);
			command = tokens[0];
			args = tokens.slice(1);
		}
		if (!command) {
			return {
				...base,
				launch: null,
				unlaunchableReason: "catalog entry records neither a command nor a url",
			};
		}
		const expanded = expandAll([command, ...args], vars);
		const env = expandEnv(server.env ?? {}, vars);
		if (expanded === null || env === null) {
			return {
				...base,
				launch: null,
				unlaunchableReason: `catalog entry contains an unresolved {{VM_...}} placeholder; supply it through ParseCatalogOptions.vars`,
			};
		}
		return {
			...base,
			launch: { transport: "stdio", command: expanded[0], args: expanded.slice(1), env },
		};
	});
}

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;

function expand(value: string, vars: Readonly<Record<string, string>>): string | null {
	let unresolved = false;
	const out = value.replace(PLACEHOLDER, (match, key: string) => {
		const replacement = vars[key];
		if (replacement === undefined) {
			unresolved = true;
			return match;
		}
		return replacement;
	});
	return unresolved ? null : out;
}

function expandAll(
	values: readonly string[],
	vars: Readonly<Record<string, string>>,
): string[] | null {
	const out: string[] = [];
	for (const value of values) {
		const expanded = expand(value, vars);
		if (expanded === null) return null;
		out.push(expanded);
	}
	return out;
}

function expandEnv(
	env: Readonly<Record<string, string>>,
	vars: Readonly<Record<string, string>>,
): Record<string, string> | null {
	const out: Record<string, string> = {};
	for (const key of Object.keys(env).sort()) {
		const expanded = expand(env[key], vars);
		if (expanded === null) return null;
		out[key] = expanded;
	}
	return out;
}

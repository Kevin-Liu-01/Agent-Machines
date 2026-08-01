/**
 * Tests for src/mux/loadout.ts.
 *
 * Run: npx tsx --test src/mux/loadout.test.ts
 *
 * Four of these run the generated payload FOR REAL: the archive is unpacked
 * with the system tar into a temp directory standing in for $HOME and the
 * apply script is run with /bin/sh. A unit test that only asserted the plan's
 * shape would have passed with the awk region replacement broken, the prune
 * loop inverted, or a tar header off by one byte -- all of which are exactly
 * the failures that turn "re-running is idempotent" into a lie.
 *
 * The layout comparison reads web/lib/memory/install.ts and
 * web/lib/dashboard/skills/custom-skill.ts as TEXT rather than importing them.
 * They resolve `@/...` path aliases that the root tsconfig does not define, so
 * importing them would pull web into the src type program; reading the source
 * still fails loudly when the hosted path moves a file, which is the drift the
 * test exists to catch.
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import {
	CODEX_REGION_BEGIN,
	CODEX_REGION_END,
	CUSTOM_SKILLS_DIR,
	RUNTIME_ROOT,
	SKILLS_DIR,
	buildTar,
	combinedDoc,
	harnessesWithMcpSupport,
	installLoadout,
	loadSkillsFromDirectory,
	mcpServersFromCatalog,
	planLoadout,
	type DeclaredLoadout,
	type LoadoutRegistry,
	type LoadoutTarget,
	type McpCatalog,
} from "./loadout.js";
import { MuxError, type ExecResult, type HarnessKind } from "./types.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DOCS = {
	soul: "You are a focused engineering agent.",
	agentDocs: "1. Empirical over theoretical.",
	memory: "The repo uses tabs.",
	user: "Operator prefers terse output.",
};

function registry(): LoadoutRegistry {
	return {
		skills: [
			{ slug: "alpha", content: "---\nname: alpha\n---\nalpha body\n" },
			{ slug: "beta", content: "---\nname: beta\n---\nbeta body\n" },
			{ slug: "mine", content: "---\nname: mine\n---\nmine body\n", custom: true },
		],
		mcpServers: [
			{
				id: "playwright",
				launch: {
					transport: "stdio",
					command: "npx",
					args: ["-y", "@playwright/mcp"],
					env: { PLAYWRIGHT_BROWSERS_PATH: "/home/user/.cache/ms-playwright" },
				},
			},
			{ id: "docs", launch: { transport: "http", url: "https://example.invalid/mcp" } },
			{
				id: "hermes-builtins",
				launch: null,
				unlaunchableReason: 'catalog entry declares transport "native"',
			},
		],
	};
}

const FULL: DeclaredLoadout = {
	docs: DOCS,
	skillIds: ["alpha", "beta", "mine"],
	mcpServerIds: ["playwright", "docs"],
};

/**
 * The same bundle minus MCP servers, for the two harnesses whose MCP location
 * is unverified. They reject a named server by design, so a docs+skills plan is
 * the only plan they have.
 */
const DOCS_AND_SKILLS: DeclaredLoadout = { docs: DOCS, skillIds: ["alpha", "beta", "mine"] };

/** A LoadoutTarget that records everything instead of touching a substrate. */
type FakeTarget = LoadoutTarget & {
	writes: { path: string; content: string }[];
	execs: string[];
	exitCode: number;
	stdout: string;
};

function fakeTarget(overrides: Partial<Pick<FakeTarget, "exitCode" | "stdout">> = {}): FakeTarget {
	const target: FakeTarget = {
		writes: [],
		execs: [],
		exitCode: overrides.exitCode ?? 0,
		stdout: overrides.stdout ?? "AM_LOADOUT_INSTALLED\n",
		async writeFile(path: string, content: string | Uint8Array): Promise<void> {
			target.writes.push({
				path,
				content: typeof content === "string" ? content : Buffer.from(content).toString("utf8"),
			});
		},
		async exec(command: string): Promise<ExecResult> {
			target.execs.push(command);
			return {
				stdout: target.stdout,
				stderr: "",
				exitCode: target.exitCode,
				durationMs: 1,
			};
		},
	};
	return target;
}

function pathsOf(harness: HarnessKind, loadout: DeclaredLoadout): string[] {
	return planLoadout(harness, loadout, registry())
		.files.map((file) => file.path)
		.sort();
}

function contentAt(harness: HarnessKind, loadout: DeclaredLoadout, path: string): string {
	const file = planLoadout(harness, loadout, registry()).files.find((f) => f.path === path);
	assert.ok(file, `plan has no file at ${path}`);
	return file.content;
}

// ---------------------------------------------------------------------------
// A real machine, standing in for a sandbox
// ---------------------------------------------------------------------------

/**
 * Unpack a plan into `home` and run its apply script, the way installLoadout
 * does on a sandbox. Returns the apply script's stdout so the completion
 * sentinel can be asserted.
 */
function materialize(home: string, harness: HarnessKind, loadout: DeclaredLoadout): string {
	const plan = planLoadout(harness, loadout, registry());
	const archive = gzipSync(buildTar(plan.files));
	const payload = join(home, "payload.tgz");
	writeFileSync(payload, archive);
	execFileSync("tar", ["-xzf", payload, "-C", home]);
	rmSync(payload);
	return execFileSync("sh", [join(home, RUNTIME_ROOT, ".loadout", "apply.sh")], {
		env: { ...process.env, HOME: home },
		encoding: "utf8",
	});
}

function withHome(body: (home: string) => void): void {
	const home = mkdtempSync(join(tmpdir(), "am-loadout-home-"));
	try {
		body(home);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

/** Every regular file under `dir`, relative and sorted, with its bytes. */
function snapshot(dir: string, base = dir): Map<string, string> {
	const out = new Map<string, string>();
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name < b.name ? -1 : 1,
	)) {
		const full = join(dir, entry.name);
		const rel = full.slice(base.length + 1);
		if (entry.isSymbolicLink()) {
			out.set(`${rel} -> symlink`, lstatSync(full).isSymbolicLink() ? "link" : "?");
			continue;
		}
		if (entry.isDirectory()) {
			for (const [key, value] of snapshot(full, base)) out.set(key, value);
			continue;
		}
		out.set(rel, readFileSync(full, "utf8"));
	}
	return out;
}

// ---------------------------------------------------------------------------
// Fail closed
// ---------------------------------------------------------------------------

test("unknown skill id fails closed and names the id", () => {
	assert.throws(
		() => planLoadout("claude-code", { skillIds: ["alpha", "no-such-skill"] }, registry()),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /no-such-skill/);
			assert.match(error.message, /not in the registry/);
			return true;
		},
	);
});

test("unknown MCP server id fails closed and names the id", () => {
	assert.throws(
		() => planLoadout("claude-code", { mcpServerIds: ["playwright", "ghost"] }, registry()),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /"ghost"/);
			return true;
		},
	);
});

test("a registered but unlaunchable server fails closed with the reason", () => {
	assert.throws(
		() => planLoadout("claude-code", { mcpServerIds: ["hermes-builtins"] }, registry()),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.match(error.message, /hermes-builtins/);
			assert.match(error.message, /native/);
			return true;
		},
	);
});

test("an MCP server on a harness with no verified config location fails closed", () => {
	for (const harness of ["openclaw", "hermes"] as const) {
		assert.throws(
			() => planLoadout(harness, { mcpServerIds: ["playwright"] }, registry()),
			(error: unknown) => {
				assert.ok(error instanceof MuxError);
				assert.equal(error.kind, "not_supported");
				assert.equal(error.harness, harness);
				assert.match(error.message, /playwright/);
				// The message must say WHY, not just "unsupported".
				assert.match(error.message, harness === "openclaw" ? /verified/ : /HERMES_HOME/);
				return true;
			},
		);
	}
	assert.deepEqual(harnessesWithMcpSupport().sort(), ["claude-code", "codex"]);
});

test("a skill slug that would escape the skills directory is rejected", () => {
	const evil: LoadoutRegistry = {
		skills: [{ slug: "../../.ssh/authorized_keys", content: "x" }],
		mcpServers: [],
	};
	assert.throws(
		() => planLoadout("claude-code", { skillIds: ["../../.ssh/authorized_keys"] }, evil),
		(error: unknown) => error instanceof MuxError && /safe directory name/.test(error.message),
	);
});

test("a non-zero exec and a missing sentinel both surface as MuxErrors", async () => {
	await assert.rejects(
		() => installLoadout(fakeTarget({ exitCode: 2 }), "claude-code", FULL, registry()),
		(error: unknown) => error instanceof MuxError && /exit 2/.test(error.message),
	);
	await assert.rejects(
		() => installLoadout(fakeTarget({ stdout: "partial\n" }), "claude-code", FULL, registry()),
		(error: unknown) => error instanceof MuxError && /sentinel/.test(error.message),
	);
});

// ---------------------------------------------------------------------------
// The layout the hosted path produces
// ---------------------------------------------------------------------------

/**
 * The four canonical docs, and the per-runtime entrypoints, must match
 * web/lib/memory/install.ts. The assertion is derived from that file's source
 * so that moving a path there fails here.
 */
test("canonical doc paths match web/lib/memory/install.ts", () => {
	const source = readFileSync(join(REPO_ROOT, "web", "lib", "memory", "install.ts"), "utf8");
	assert.match(source, /const ROOT = "\$HOME\/\.agent-machines";/);

	// The DOCS table: [key, filename] pairs.
	const docTable = [...source.matchAll(/\["(\w+)", "([A-Z]+\.md)"\]/g)].map((m) => [m[1], m[2]]);
	assert.deepEqual(docTable, [
		["soul", "SOUL.md"],
		["agentDocs", "AGENTS.md"],
		["memory", "MEMORY.md"],
		["user", "USER.md"],
	]);

	const mine = new Set(pathsOf("hermes", DOCS_AND_SKILLS));
	for (const [, file] of docTable) {
		assert.ok(mine.has(`${RUNTIME_ROOT}/${file}`), `missing ${file} under the canonical root`);
	}
	// hermes reads the canonical docs only -- install.ts writes no entrypoint
	// for it, and neither may we.
	assert.match(source, /\/\/ hermes reads the canonical ~\/\.agent-machines docs/);
	for (const path of mine) {
		assert.ok(
			path.startsWith(`${RUNTIME_ROOT}/`),
			`hermes plan wrote ${path} outside the canonical root`,
		);
	}
});

test("per-runtime entrypoints match the branches in web/lib/memory/install.ts", () => {
	const source = readFileSync(join(REPO_ROOT, "web", "lib", "memory", "install.ts"), "utf8");
	/** Every "$HOME/..." literal inside one agentKind branch. */
	const branch = (kind: string): string[] => {
		const start = source.indexOf(`agentKind === "${kind}"`);
		assert.ok(start > 0, `install.ts has no branch for ${kind}`);
		const rest = source.slice(start);
		const end = rest.indexOf("} else if");
		const body = end > 0 ? rest.slice(0, end) : rest.slice(0, rest.indexOf("\n\t}"));
		return [...body.matchAll(/"\$HOME\/([^"]+)"/g)]
			.map((m) => m[1])
			.filter((p) => p.endsWith(".md"))
			.sort();
	};

	for (const kind of ["claude-code", "codex", "openclaw"] as const) {
		const expected = branch(kind);
		assert.ok(expected.length > 0, `no doc paths found in the ${kind} branch`);
		const mine = pathsOf(kind, kind === "openclaw" ? DOCS_AND_SKILLS : FULL);
		for (const path of expected) {
			assert.ok(mine.includes(path), `${kind} plan is missing ${path} (install.ts writes it)`);
		}
	}

	// And the contents agree: claude-code/codex get the combined doc, openclaw
	// gets the raw soul and agent docs, exactly as install.ts splits them.
	const combined = combinedDoc(DOCS);
	assert.equal(contentAt("claude-code", FULL, "CLAUDE.md"), combined);
	assert.equal(contentAt("claude-code", FULL, ".claude/CLAUDE.md"), combined);
	assert.equal(contentAt("codex", FULL, "AGENTS.md"), combined);
	assert.equal(contentAt("openclaw", DOCS_AND_SKILLS, ".openclaw/workspace/SOUL.md"), DOCS.soul);
	assert.equal(contentAt("openclaw", DOCS_AND_SKILLS, ".openclaw/workspace/AGENTS.md"), DOCS.agentDocs);
});

test("combinedDoc reproduces install.ts headings and order", () => {
	const source = readFileSync(join(REPO_ROOT, "web", "lib", "memory", "install.ts"), "utf8");
	const headings = [...source.matchAll(/# ([A-Z][^\\`\n]*?)\\n\\n\$\{d\./g)].map((m) => m[1]);
	assert.deepEqual(headings, [
		"Persona & voice",
		"Operating rules & agent docs",
		"Working memory",
		"Operator profile",
	]);
	const produced = combinedDoc(DOCS);
	let cursor = -1;
	for (const heading of headings) {
		const at = produced.indexOf(`# ${heading}`);
		assert.ok(at > cursor, `heading "${heading}" is missing or out of order`);
		cursor = at;
	}
	// An empty section is omitted rather than left as a bare heading, which is
	// what install.ts's `if (d.x.trim())` guards do.
	assert.equal(combinedDoc({ soul: "s", agentDocs: "", memory: "", user: "" }), "# Persona & voice\n\ns");
});

test("skill paths match the hosted skills tree", () => {
	// reload-script.ts rsyncs knowledge/skills into "$RUNTIME/skills"; the
	// runtime root is ~/.agent-machines everywhere in the hosted path.
	const reload = readFileSync(join(REPO_ROOT, "web", "lib", "bootstrap", "reload-script.ts"), "utf8");
	assert.match(reload, /rsync -a --delete "\$REPO_DIR\/knowledge\/skills\/" "\$RUNTIME\/skills\/"/);
	const introspection = readFileSync(
		join(REPO_ROOT, "web", "lib", "agents", "machine-introspection.ts"),
		"utf8",
	);
	assert.match(introspection, /runtime="\$\{HOME\}\/\.agent-machines"/);
	assert.match(introspection, /-d "\$runtime\/skills"/);

	// custom-skill.ts owns the user-skill namespace.
	const custom = readFileSync(
		join(REPO_ROOT, "web", "lib", "dashboard", "skills", "custom-skill.ts"),
		"utf8",
	);
	assert.match(custom, /\$HOME\/\.agent-machines\/skills\/custom\/\$\{slug\}/);

	const mine = pathsOf("hermes", DOCS_AND_SKILLS);
	assert.ok(mine.includes(`${SKILLS_DIR}/alpha/SKILL.md`));
	assert.ok(mine.includes(`${SKILLS_DIR}/beta/SKILL.md`));
	assert.ok(mine.includes(`${CUSTOM_SKILLS_DIR}/mine/SKILL.md`));
	assert.equal(SKILLS_DIR, `${RUNTIME_ROOT}/skills`);
	assert.equal(CUSTOM_SKILLS_DIR, `${RUNTIME_ROOT}/skills/custom`);
	// Verbatim: the registry's SKILL.md is what lands, frontmatter untouched.
	assert.equal(contentAt("hermes", DOCS_AND_SKILLS, `${SKILLS_DIR}/alpha/SKILL.md`), "---\nname: alpha\n---\nalpha body\n");
});

// ---------------------------------------------------------------------------
// Per-harness MCP config
// ---------------------------------------------------------------------------

test("claude-code MCP config lands in a file the run is told to read", () => {
	const plan = planLoadout("claude-code", FULL, registry());
	const configPath = `${RUNTIME_ROOT}/.loadout/claude-mcp.json`;
	const file = plan.files.find((f) => f.path === configPath);
	assert.ok(file, "no claude-mcp.json in the plan");
	const parsed = JSON.parse(file.content) as {
		mcpServers: Record<string, { type: string; command?: string; args?: string[]; url?: string }>;
	};
	// The shape `claude mcp add --scope user` writes into ~/.claude.json, which
	// is the same shape --mcp-config accepts.
	assert.deepEqual(parsed.mcpServers.playwright, {
		type: "stdio",
		command: "npx",
		args: ["-y", "@playwright/mcp"],
		env: { PLAYWRIGHT_BROWSERS_PATH: "/home/user/.cache/ms-playwright" },
	});
	assert.deepEqual(parsed.mcpServers.docs, { type: "http", url: "https://example.invalid/mcp" });

	// A file alone is invisible to the mux run path, which passes --bare, so
	// the plan must hand the caller the arguments that make it visible.
	const args = plan.runArgs.join(" ");
	assert.match(args, /--mcp-config "\$HOME\/\.agent-machines\/\.loadout\/claude-mcp\.json"/);
	assert.match(args, /--plugin-dir "\$HOME\/\.agent-machines"/);
	assert.match(args, /--append-system-prompt-file "\$HOME\/\.agent-machines\/\.loadout\/claude-system\.md"/);
	assert.ok(
		plan.notes.some((note) => note.includes("--bare")),
		"the --bare caveat must be reported, not buried",
	);
});

test("claude-code runArgs only claim what the plan actually installed", () => {
	const bare = planLoadout("claude-code", {}, registry());
	assert.deepEqual(bare.runArgs, []);
	const skillsOnly = planLoadout("claude-code", { skillIds: ["alpha"] }, registry());
	assert.deepEqual(skillsOnly.runArgs, ["--plugin-dir", '"$HOME/.agent-machines"']);
});

test("codex MCP config is a TOML region in ~/.codex/config.toml", () => {
	withHome((home) => {
		mkdirSync(join(home, ".codex"), { recursive: true });
		// Pre-existing operator configuration that must survive.
		writeFileSync(
			join(home, ".codex", "config.toml"),
			'model = "gpt-5.3-codex"\n\n[profiles.work]\napproval_policy = "never"\n',
		);
		const out = materialize(home, "codex", FULL);
		assert.match(out, /AM_LOADOUT_INSTALLED/);

		const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
		assert.match(config, /model = "gpt-5\.3-codex"/);
		assert.match(config, /\[profiles\.work\]/);
		// The exact table shape codex-cli 0.146.0 writes for `codex mcp add`.
		assert.match(config, /\[mcp_servers\.playwright\]\ncommand = "npx"\nargs = \["-y", "@playwright\/mcp"\]/);
		assert.match(config, /\[mcp_servers\.playwright\.env\]\nPLAYWRIGHT_BROWSERS_PATH = "\/home\/user\/\.cache\/ms-playwright"/);
		assert.match(config, /\[mcp_servers\.docs\]\nurl = "https:\/\/example\.invalid\/mcp"/);
		// codex needs no run argument: it reads ~/.codex/config.toml itself.
		assert.deepEqual(planLoadout("codex", FULL, registry()).runArgs, []);
	});
});

test("re-applying the codex region does not duplicate it", () => {
	withHome((home) => {
		materialize(home, "codex", FULL);
		const once = readFileSync(join(home, ".codex", "config.toml"), "utf8");
		materialize(home, "codex", FULL);
		const twice = readFileSync(join(home, ".codex", "config.toml"), "utf8");
		assert.equal(twice, once, "a second install rewrote the config differently");
		assert.equal(twice.split(CODEX_REGION_BEGIN).length - 1, 1);
		assert.equal(twice.split(CODEX_REGION_END).length - 1, 1);
		assert.equal(twice.split("[mcp_servers.playwright]").length - 1, 1);
	});
});

test("dropping a codex MCP server removes it from the config", () => {
	withHome((home) => {
		materialize(home, "codex", FULL);
		materialize(home, "codex", { docs: DOCS, skillIds: ["alpha"], mcpServerIds: ["docs"] });
		const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
		assert.doesNotMatch(config, /\[mcp_servers\.playwright\]/);
		assert.match(config, /\[mcp_servers\.docs\]/);
	});
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

test("the archive is byte-identical for the same loadout", () => {
	const first = buildTar(planLoadout("claude-code", FULL, registry()).files);
	const second = buildTar(planLoadout("claude-code", FULL, registry()).files);
	assert.ok(first.equals(second), "two plans for one loadout produced different archives");
});

test("installing twice writes the same payload and the same commands", async () => {
	const target = fakeTarget();
	await installLoadout(target, "claude-code", FULL, registry());
	await installLoadout(target, "claude-code", FULL, registry());
	assert.equal(target.writes.length, 2);
	assert.equal(target.writes[0].path, target.writes[1].path, "payload path is not stable");
	assert.equal(target.writes[0].content, target.writes[1].content);
	assert.equal(target.execs[0], target.execs[1]);
});

test("re-installing on a real filesystem leaves an identical tree", () => {
	withHome((home) => {
		assert.match(materialize(home, "claude-code", FULL), /AM_LOADOUT_INSTALLED/);
		const first = snapshot(home);
		assert.match(materialize(home, "claude-code", FULL), /AM_LOADOUT_INSTALLED/);
		const second = snapshot(home);
		assert.deepEqual([...second.keys()].sort(), [...first.keys()].sort());
		for (const [path, content] of second) assert.equal(content, first.get(path), path);
		// The staging manifest must never be left behind: a stale one would be
		// diffed against on the next install and prune the wrong skills.
		assert.equal(existsSync(join(home, RUNTIME_ROOT, ".loadout", "manifest.next.json")), false);
	});
});

test("shrinking a loadout removes the skills that left it, and nothing else", () => {
	withHome((home) => {
		materialize(home, "claude-code", FULL);
		// A skill the operator wrote by hand, which we never installed.
		const handmade = join(home, SKILLS_DIR, "handmade");
		mkdirSync(handmade, { recursive: true });
		writeFileSync(join(handmade, "SKILL.md"), "mine, not the loadout's\n");

		materialize(home, "claude-code", { docs: DOCS, skillIds: ["alpha"] });

		assert.ok(existsSync(join(home, SKILLS_DIR, "alpha", "SKILL.md")), "alpha was pruned");
		assert.equal(existsSync(join(home, SKILLS_DIR, "beta")), false, "beta was not pruned");
		assert.equal(existsSync(join(home, CUSTOM_SKILLS_DIR, "mine")), false, "custom skill not pruned");
		assert.ok(existsSync(join(handmade, "SKILL.md")), "a hand-written skill was deleted");
	});
});

test("claude-code links its own skills directory at the canonical tree", () => {
	withHome((home) => {
		materialize(home, "claude-code", FULL);
		const link = join(home, ".claude", "skills");
		assert.ok(lstatSync(link).isSymbolicLink(), "~/.claude/skills is not a symlink");
		assert.ok(existsSync(join(link, "alpha", "SKILL.md")), "the link does not reach the skills");
		// Re-running must replace the link, not write through it.
		materialize(home, "claude-code", FULL);
		assert.ok(lstatSync(link).isSymbolicLink());
	});
});

test("a real directory at ~/.claude/skills fails the install instead of being ignored", () => {
	withHome((home) => {
		mkdirSync(join(home, ".claude", "skills", "someone-elses"), { recursive: true });
		assert.throws(
			() => materialize(home, "claude-code", FULL),
			(error: unknown) => /already exists and is not a symlink/.test(String(error)),
		);
	});
});

// ---------------------------------------------------------------------------
// Bounded cost
// ---------------------------------------------------------------------------

test("the whole bundled skill set costs one write and one exec", async () => {
	const skills = readdirSync(join(REPO_ROOT, "knowledge", "skills"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({
			slug: entry.name,
			content: readFileSync(join(REPO_ROOT, "knowledge", "skills", entry.name, "SKILL.md"), "utf8"),
		}));
	assert.ok(skills.length >= 160, `expected the bundled set, found ${skills.length}`);

	const target = fakeTarget();
	const result = await installLoadout(
		target,
		"claude-code",
		{ docs: DOCS, skillIds: skills.map((s) => s.slug) },
		{ skills, mcpServers: [] },
	);
	assert.equal(target.writes.length, 1);
	assert.equal(target.execs.length, 1);
	assert.equal(result.plan.cost.writes, 1);
	assert.equal(result.plan.cost.execs, 1);
	assert.equal(result.plan.skillSlugs.length, skills.length);
	// The compression claim in the module header, held to within a wide band so
	// editing a skill does not fail the suite.
	assert.ok(result.plan.cost.rawBytes > 1_000_000, `raw ${result.plan.cost.rawBytes}`);
	assert.ok(
		result.plan.cost.payloadBytes < result.plan.cost.rawBytes / 2,
		`payload ${result.plan.cost.payloadBytes} vs raw ${result.plan.cost.rawBytes}`,
	);
	assert.equal(target.writes[0].content.length, result.plan.cost.payloadBytes);
});

test("the exec stages, unpacks, applies and cleans up in one command", async () => {
	const target = fakeTarget();
	const result = await installLoadout(target, "hermes", DOCS_AND_SKILLS, registry());
	const command = target.execs[0];
	assert.match(command, /base64 -d < "\/tmp\/am-loadout-[0-9a-f]{16}\.b64" \| tar -xzf - -C "\$HOME"/);
	assert.match(command, /sh "\$HOME\/\.agent-machines\/\.loadout\/apply\.sh"/);
	assert.match(command, new RegExp(`rm -f "${result.payloadPath}"`));
	assert.equal(target.writes[0].path, result.payloadPath);
});

// ---------------------------------------------------------------------------
// Catalog parsing
// ---------------------------------------------------------------------------

test("the published catalog parses with every unlaunchable entry marked, not dropped", () => {
	const catalog = JSON.parse(
		readFileSync(join(REPO_ROOT, "web", "data", "mcps-catalog.json"), "utf8"),
	) as McpCatalog;
	const parsed = mcpServersFromCatalog(catalog);
	assert.equal(parsed.length, catalog.servers.length, "a catalog entry was silently dropped");

	const byId = new Map(parsed.map((entry) => [entry.id, entry]));
	// Explicit command + args: launchable as published.
	assert.deepEqual(byId.get("playwright")?.launch, {
		transport: "stdio",
		command: "npx",
		args: ["-y", "@playwright/mcp"],
		env: {},
	});
	// Native tools: nothing to start.
	assert.equal(byId.get("hermes-builtins")?.launch, null);
	assert.match(String(byId.get("hermes-builtins")?.unlaunchableReason), /native/);
	// {{VM_...}} placeholders: unresolved without vars.
	assert.equal(byId.get("cursor")?.launch, null);
	assert.match(String(byId.get("cursor")?.unlaunchableReason), /placeholder/);
	// installCommand is NOT assumed to be a launch line.
	assert.equal(byId.get("vercel")?.launch, null);
	assert.match(String(byId.get("vercel")?.unlaunchableReason), /installCommand/);
});

test("installCommand becomes a launch line only when the caller says so", () => {
	const catalog: McpCatalog = {
		servers: [{ id: "vercel", transport: "stdio", installCommand: "npx -y @vercel/mcp-server" }],
	};
	assert.equal(mcpServersFromCatalog(catalog)[0].launch, null);
	assert.deepEqual(mcpServersFromCatalog(catalog, { installCommandIsLaunch: true })[0].launch, {
		transport: "stdio",
		command: "npx",
		args: ["-y", "@vercel/mcp-server"],
		env: {},
	});
});

test("loadSkillsFromDirectory reads the repo's own skills tree and round-trips ours", () => {
	const bundled = loadSkillsFromDirectory(join(REPO_ROOT, "knowledge", "skills"));
	assert.ok(bundled.length >= 160, `expected the bundled set, found ${bundled.length}`);
	assert.ok(
		bundled.every((skill) => skill.content.length > 0 && skill.custom === undefined),
		"a bundled skill came back empty or flagged custom",
	);

	// The tree this module writes is the same shape the loader reads, so an
	// installed loadout can be read back and compared with what was declared.
	withHome((home) => {
		materialize(home, "hermes", DOCS_AND_SKILLS);
		const installed = loadSkillsFromDirectory(join(home, SKILLS_DIR));
		assert.deepEqual(
			installed.map((skill) => [skill.slug, skill.custom === true]),
			[
				["alpha", false],
				["beta", false],
				["mine", true],
			],
		);
		assert.equal(
			installed.find((skill) => skill.slug === "mine")?.content,
			"---\nname: mine\n---\nmine body\n",
		);
	});
});

test("catalog placeholders resolve from vars", () => {
	const catalog: McpCatalog = {
		servers: [
			{
				id: "cursor",
				transport: "stdio",
				command: "node",
				args: ["{{VM_BRIDGE_DIR}}/dist/server.js"],
				env: { PATH: "{{VM_NODE_BIN}}:/usr/bin" },
			},
		],
	};
	const resolved = mcpServersFromCatalog(catalog, {
		vars: { VM_BRIDGE_DIR: "/home/user/bridge", VM_NODE_BIN: "/home/user/node/bin" },
	});
	assert.deepEqual(resolved[0].launch, {
		transport: "stdio",
		command: "node",
		args: ["/home/user/bridge/dist/server.js"],
		env: { PATH: "/home/user/node/bin:/usr/bin" },
	});
});

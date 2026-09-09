/** Execute the actual archive/restore commands against isolated filesystems. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { MOVE_ALLOWLIST, buildExportCommand, exportTar, probeIncludes, restoreTar, type MoveTarget } from "./statemove.js";
import { prepareLiveBaseline, restoreStableLiveDelta } from "./live-migration.js";

function fixture(t: test.TestContext) {
	const root = mkdtempSync(join(tmpdir(), "am-state-files-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const source = join(root, "source");
	const target = join(root, "target");
	const staging = join(root, "staging");
	for (const path of [source, target, staging]) mkdirSync(path);
	const file = (home: string, path: string, content: string) => {
		const full = join(home, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
		return full;
	};
	const box = (home: string): MoveTarget => {
		const localize = (command: string) => {
			const temporaryPaths = command.replaceAll("/tmp/am-migrate-", `${staging}/am-migrate-`).replaceAll("/tmp/am-live-", `${staging}/am-live-`);
			// Providers run GNU stat. macOS test fixtures use its equivalent
			// size probe; tar, chunking, hashing, and restore are executed.
			return process.platform === "darwin" ? temporaryPaths.replaceAll("stat -c %s ", "stat -f %z ") : temporaryPaths;
		};
		return {
			async exec(command) {
				const result = spawnSync("/bin/bash", ["-c", localize(command)], {
					encoding: "utf8", env: { ...process.env, HOME: home, COPYFILE_DISABLE: "1" }, timeout: 10_000, maxBuffer: 8 * 1024 * 1024,
				});
				return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status ?? 1, durationMs: 1 };
			},
			async writeFile(path, content) {
				const targetPath = localize(path);
				mkdirSync(dirname(targetPath), { recursive: true });
				writeFileSync(targetPath, content);
			},
		};
	};
	return { root, source, target, staging, file, box };
}

test("real state export/restore preserves working repositories, Git state, outputs, runtime state, and hosted cron history", async (t) => {
	const { root, source, target, file, box } = fixture(t);
	const workspace = join(source, "agent-machines");
	file(source, "agent-machines/package.json", '{"name":"migrated-job","dependencies":{"example":"1.0.0"}}');
	file(source, "agent-machines/pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
	file(source, "agent-machines/src/index.ts", "export const ready = true;\n");
	file(source, "agent-machines/.gitignore", ".env*\nnode_modules/\n");
	const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } }).trimEnd();
	git(workspace, "init", "-q");
	git(workspace, "add", ".");
	git(workspace, "-c", "user.name=Migration Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
	const head = git(workspace, "rev-parse", "HEAD");
	file(source, "agent-machines/src/index.ts", "export const ready = 'uncommitted';\n");
	file(source, "agent-machines/staged.ts", "export const staged = true;\n");
	git(workspace, "add", "staged.ts");
	git(workspace, "config", "remote.origin.url", "https://user:fake-migration-secret@example.invalid/repo.git");
	const required = {
		"agent-machines/launch-proof.txt": "agent-machines-launch-proof\n",
		"agent-machines/console-proof.txt": "console-ready-20260909\n",
		"agent-machines/dist/job-report.md": "A generated job output, not a dependency.\n",
		"work/research/notes.md": "A second supported workspace.\n",
		".agent-machines/MEMORY.md": "Keep the project context.\n",
		".agent-machines/.knowledge-manifest.json": '{"skills/base/SKILL.md":"' + "a".repeat(64) + '"}',
		".agent-machines/cron/daily/run.log": "Completed scheduled job.\n",
		".agent-machines/crons/daily.json": '{"schedule":"0 9 * * *"}',
		".agent-machines/state/terminal-agent.json": '{"desiredAgentKind":"claude-code"}',
		".claude/projects/work/session.jsonl": '{"type":"user","message":{"content":"Saved conversation"}}\n',
	};
	for (const [path, content] of Object.entries(required)) file(source, path, content);
	const excluded = [
		"agent-machines/.env", "agent-machines/.env.production", "agent-machines/nested/.env.local",
		"agent-machines/.npmrc", "agent-machines/nested/.netrc", "agent-machines/private.pem",
		"agent-machines/node_modules/pkg/index.js", "agent-machines/nested/node_modules/pkg/index.js",
		"agent-machines/.venv/bin/python", "work/node_modules/dep/index.js", "work/.yarn/cache/package.zip",
		".claude/.credentials.json", ".agent-machines/skills/private/.env.test",
		".agent-machines/state/migration/gate", ".agent-machines/state/migration/runs/source-pid",
	];
	for (const path of excluded) file(source, path, "fake-migration-secret");
	file(source, "unlisted-workspace/private.txt", "Outside the explicit roots.\n");
	symlinkSync(join(source, "unlisted-workspace"), join(workspace, "external-link"));
	const plan = MOVE_ALLOWLIST("claude-code");
	const presence = await probeIncludes(box(source), plan.include);
	const archive = join(root, "state.tgz");
	const built = await box(source).exec(buildExportCommand({ include: presence.present, exclude: plan.exclude }, archive));
	assert.equal(built.exitCode, 0, built.stderr);
	const exported = await exportTar(box(source), archive);
	await restoreTar(box(target), exported.bytes, { sha256: exported.sha256, agent: "claude-code", oldHome: source });
	for (const [path, content] of Object.entries(required)) assert.equal(readFileSync(join(target, path), "utf8"), content, path);
	for (const path of [...excluded, "agent-machines/.git/config", "unlisted-workspace/private.txt"]) assert.equal(existsSync(join(target, path)), false, `Excluded: ${path}`);
	const restoredRepo = join(target, "agent-machines");
	assert.equal(git(restoredRepo, "rev-parse", "HEAD"), head);
	assert.match(git(restoredRepo, "status", "--porcelain"), / M src\/index\.ts/);
	assert.match(git(restoredRepo, "status", "--porcelain"), /A  staged\.ts/);
	assert.equal(git(restoredRepo, "remote"), "");
	assert.equal(readFileSync(join(source, "agent-machines/launch-proof.txt"), "utf8"), required["agent-machines/launch-proof.txt"], "Export must preserve the source");
});

test("archive creation fails if a confirmed workspace file disappears after the presence probe", async (t) => {
	const { root, source, file, box } = fixture(t);
	const path = file(source, "work/important.txt", "Unarchived work");
	const present = await probeIncludes(box(source), ["work/important.txt"]);
	rmSync(path);
	const result = await box(source).exec(buildExportCommand({ include: present.present, exclude: [] }, join(root, "incomplete.tgz")));
	assert.notEqual(result.exitCode, 0, "A digest of a partial tar must not turn a missing file into a verified move");
});

test("live baseline accepts credential globs and prunes nested dependency and credential entries", async (t) => {
	const { source, staging, file, box } = fixture(t);
	file(source, "work/report.md", "Keep this");
	file(source, "work/.env.production", "Exclude this");
	file(source, "work/nested/node_modules/pkg/deep/file.js", "Do not inventory dependencies");
	file(source, "work/nested/.git/config", "Do not inventory authenticated remotes");
	const plan = { include: ["work"], exclude: [".env.*", "node_modules", ".git/config"] };
	await prepareLiveBaseline(box(source), "fixture", plan);
	const entries = readFileSync(join(staging, "am-live-fixture.baseline"), "utf8").split("\0").filter(Boolean);
	assert.ok(entries.includes("work/report.md"));
	assert.ok(!entries.some((path) => /node_modules|\.env\.|\.git\/config/.test(path)), entries.join("\n"));
});

test("live inventory errors cannot be hidden by a successful downstream sort", async (t) => {
	const { source, file, box } = fixture(t);
	file(source, "work/report.md", "Keep this");
	await assert.rejects(() => prepareLiveBaseline({
		exec: (command) => box(source).exec(`find() { return 17; }\n${command}`),
	}, "read-failure", { include: ["work"], exclude: [".env.*"] }), /could not record the live-migration baseline/);
});

test("live deletion replay refuses nested excluded dependency paths before deleting a target file", async (t) => {
	const { target, file } = fixture(t);
	const protectedPath = file(target, "work/node_modules/pkg/private.key", "target credential");
	file(target, ".agent-machines/deletions", "work/node_modules/pkg/private.key\0");
	await assert.rejects(() => restoreStableLiveDelta({
		writeFile: async () => {},
		exec: async (command) => {
			if (command.includes("AM_MOVE_RESTORED")) return { exitCode: 0, stdout: "AM_MOVE_RESTORED", stderr: "", durationMs: 1 };
			const result = spawnSync("/bin/bash", ["-c", command], { env: { ...process.env, HOME: target }, encoding: "utf8" });
			return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, durationMs: 1 };
		},
	}, { exported: { bytes: Buffer.from("test"), sha256: "0".repeat(64) }, bytes: 4, stabilityAttempts: 1, deleteManifest: ".agent-machines/deletions" }, {
		sha256: "0".repeat(64), agent: "claude-code", include: ["work"], exclude: ["node_modules", "*.key"],
	}), /AM_LIVE_EXCLUDED_DELETE/);
	assert.equal(readFileSync(protectedPath, "utf8"), "target credential");
});

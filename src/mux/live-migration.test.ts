import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

import {
	acquireExternalRunLease,
	beginMigrationDrain,
	cancelMigrationDrain,
	exportStableLiveDelta,
	guardedRunCommand,
	prepareLiveBaseline,
	restoreStableLiveDelta,
	waitForMigrationDrain,
} from "./live-migration.js";
import type { MoveSource, MoveTarget } from "./statemove.js";

const ok = (stdout = "") => ({ stdout, stderr: "", exitCode: 0, durationMs: 1 });

test("guardedRunCommand atomically leases before starting and rejects a closed gate", () => {
	const command = guardedRunCommand("echo work", {
		leaseId: "run-1",
		timeoutMs: 1_000,
	});
	assert.match(command, /mkdir "\$am_migration_lock"/);
	assert.match(command, /if \[ -s "\$am_migration_gate" \]/);
	assert.match(command, /am_migration_gate_expires/);
	assert.match(command, /AM_MIGRATION_DRAINING/);
	assert.match(command, /runs\/run-1/);
	assert.match(command, /trap am_release_migration_lease EXIT/);
	assert.ok(command.indexOf("runs/run-1") < command.indexOf("echo work"));
});

test("external requests use the same gate and return a releasable lease id", async () => {
	const commands: string[] = [];
	const source: MoveSource = {
		async exec(command) {
			commands.push(command);
			return ok("AM_MIGRATION_LEASED\n");
		},
	};
	const lease = await acquireExternalRunLease(source, { leaseId: "gateway-1" });
	assert.equal(lease, "gateway-1");
	assert.match(commands[0], /runs\/gateway-1/);
	assert.match(commands[0], /AM_MIGRATION_DRAINING/);
});

test("cancel reports a gate that could not be re-opened", async () => {
	const source: MoveSource = {
		async exec() {
			return { stdout: "", stderr: "worker unavailable", exitCode: 1, durationMs: 1 };
		},
	};
	await assert.rejects(() => cancelMigrationDrain(source, "move-1"), /could not re-open/);
});

test("drain closes the gate, reports active work, then waits for it", async () => {
	let reads = 0;
	const commands: string[] = [];
	const source: MoveSource = {
		async exec(command) {
			commands.push(command);
			if (command.includes("AM_MIGRATION_DRAINED")) return ok("AM_MIGRATION_DRAINED 2\n");
			if (command.includes("AM_MIGRATION_ACTIVE")) {
				reads += 1;
				return ok(`AM_MIGRATION_ACTIVE ${reads === 1 ? 1 : 0}\n`);
			}
			return ok();
		},
	};
	const started = await beginMigrationDrain(source, "move-1");
	assert.equal(started.activeRuns, 2);
	assert.match(commands[0], /printf '%s\\n%s\\n' 'move-1'/);
	const drained = await waitForMigrationDrain(source, started, {
		timeoutMs: 1_000,
		pollMs: 1,
	});
	assert.equal(drained.activeRuns, 2);
	assert.equal(reads, 2);
});

test("a live baseline and stable delta use one allowlist and a digest-checked tar", async () => {
	const tar = Buffer.from("delta");
	const sha = createHash("sha256").update(tar).digest("hex");
	const commands: string[] = [];
	const source: MoveSource = {
		async exec(command) {
			commands.push(command);
			if (command.includes("AM_LIVE_BASELINE_READY")) return ok("AM_LIVE_BASELINE_READY\n");
			if (command.includes("| sha256sum")) return ok(`${"a".repeat(64)}  -\n`);
			if (command.includes("AM_LIVE_DELTA_READY")) return ok("AM_LIVE_DELTA_READY\n");
			if (command.startsWith("stat -c %s")) return ok(`${tar.length}\n`);
			if (command.startsWith("sha256sum ")) return ok(`${sha}  delta.tgz\n`);
			if (command.startsWith("dd if=")) return ok(tar.toString("base64"));
			return ok();
		},
	};
	const plan = {
		include: [".agent-machines/state", ".codex"],
		exclude: [".env", ".codex/auth.json"],
	};
	const baseline = await prepareLiveBaseline(source, "move-1", plan);
	const delta = await exportStableLiveDelta(source, baseline);
	assert.deepEqual(delta.exported.bytes, tar);
	assert.equal(delta.stabilityAttempts, 1);
	const build = commands.find((command) => command.includes("AM_LIVE_DELTA_READY"));
	assert.match(String(build), /comm -z -23.*sort -zr/);
	assert.match(String(build), /--no-recursion/);
	assert.match(String(build), /--exclude='\.codex\/auth\.json'/);
	assert.match(String(build), /! -name '\.env'/);
	assert.match(String(build), /! -path '\.codex\/auth\.json'/);
	assert.match(String(build), /\\\( -newer/);
	const syntax = spawnSync("bash", ["-n", "-c", String(build)], {
		encoding: "utf8",
	});
	assert.equal(syntax.status, 0, syntax.stderr);
});

test("delta restore extracts first, then replays only allowlisted deletions", async () => {
	const tar = Buffer.from("delta");
	const sha = createHash("sha256").update(tar).digest("hex");
	const commands: string[] = [];
	const target: MoveTarget = {
		async writeFile() {},
		async exec(command) {
			commands.push(command);
			if (command.includes("AM_MOVE_RESTORED")) return ok("AM_MOVE_RESTORED\n");
			if (command.includes("AM_LIVE_DELTA_APPLIED")) return ok("AM_LIVE_DELTA_APPLIED\n");
			return ok();
		},
	};
	await restoreStableLiveDelta(
		target,
		{
			exported: { bytes: tar, sha256: sha },
			deleteManifest: ".agent-machines/.migration-deletions-move-1",
			bytes: tar.length,
			stabilityAttempts: 1,
		},
		{
			sha256: sha,
			agent: "codex",
			include: [".agent-machines/state", ".codex"],
			exclude: [".env", ".codex/auth.json"],
		},
	);
	assert.equal(commands.length, 2);
	assert.match(commands[1], /\.agent-machines\/state\|\.agent-machines\/state\/\*/);
	assert.match(commands[1], /AM_LIVE_UNSAFE_DELETE/);
	assert.match(commands[1], /AM_LIVE_EXCLUDED_DELETE/);
	assert.match(commands[1], /\.codex\/auth\.json/);
	assert.match(commands[1], /AM_LIVE_UNSAFE_PARENT/);
	assert.match(commands[1], /rmdir --ignore-fail-on-non-empty/);
	assert.doesNotMatch(commands[1], /rm -rf -- "\$HOME\/\$am_path"/);
});

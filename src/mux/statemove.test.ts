/**
 * Unit tests for the state-move contract (src/mux/statemove.ts).
 *
 * Everything here runs against in-memory fakes of the two-method
 * SandboxHandle slice -- no network, no sandbox. The properties pinned are
 * the ones whose failure modes are worse than not migrating at all:
 *
 *   - the allowlist never ships a toolchain or a credential (a copied
 *     x64 binary on an arm64 box looks installed and cannot run; a copied
 *     credential is a secret round-tripped through the control plane);
 *   - a truncated or corrupted transfer ABORTS on a digest instead of
 *     restoring garbage;
 *   - workspaces past the unmeasured-stdout limit fail closed BEFORE any
 *     chunk crosses the wire;
 *   - the marker round-trips, and a stale marker from an earlier migration
 *     is distinguishable from this one's (the nonce).
 *
 * Run: npx tsx --test src/mux/statemove.test.ts
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";

import { HARNESS_KINDS } from "./config.js";
import {
	EXPORT_CHUNK_RAW_BYTES,
	LOST_ALWAYS,
	MAX_STATE_TAR_BYTES,
	MIGRATION_MARKER_PATH,
	MOVE_ALLOWLIST,
	REDERIVED,
	buildExportCommand,
	buildPresenceProbe,
	exportTar,
	lostState,
	probeIncludes,
	readHome,
	restoreTar,
	verifyMarker,
	writeMarker,
	type MigrationMarker,
} from "./statemove.js";
import { MuxError, type ExecOptions, type ExecResult } from "./types.js";

function sha256(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function ok(stdout = ""): ExecResult {
	return { stdout, stderr: "", exitCode: 0, durationMs: 1 };
}

function fail(exitCode: number, stderr = ""): ExecResult {
	return { stdout: "", stderr, exitCode, durationMs: 1 };
}

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

test("no harness's allowlist ships a toolchain, a credential file, or an absolute path", () => {
	for (const agent of HARNESS_KINDS) {
		const plan = MOVE_ALLOWLIST(agent);
		for (const path of plan.include) {
			assert.ok(!path.startsWith("/"), `${agent}: "${path}" is absolute; HOME differs per substrate`);
			// The reinstallable, arch-specific trees. Copying them is how a
			// migrated machine looks installed and cannot run.
			assert.ok(
				!/^\.agent-machines\/(node|pkgs|uv)(\/|$)/.test(path),
				`${agent}: "${path}" is a toolchain tree; toolchains re-derive`,
			);
			assert.ok(
				!/^\.local(\/|$)/.test(path),
				`${agent}: "${path}" is under ~/.local, which is toolchain territory`,
			);
			assert.ok(
				!/\.env$|credentials|auth\.json/.test(path),
				`${agent}: "${path}" looks like credential material`,
			);
		}
		// Belt and suspenders: even if an include tree grows a credential
		// file later, the tar excludes it by pattern.
		assert.ok(plan.exclude.includes(".env"), `${agent} must exclude .env`);
		assert.ok(plan.exclude.includes(".agent-env"), `${agent} must exclude .agent-env`);
		// The load every harness shares.
		for (const doc of ["SOUL.md", "AGENTS.md", "MEMORY.md", "USER.md"]) {
			assert.ok(plan.include.includes(`.agent-machines/${doc}`), `${agent} must move ${doc}`);
		}
		assert.ok(plan.include.includes(".agent-machines/skills"), `${agent} must move the skills tree`);
		assert.ok(plan.include.includes(MIGRATION_MARKER_PATH), `${agent} must carry the marker`);
	}
	// Per-harness session state moves; per-harness login state does not.
	const claude = MOVE_ALLOWLIST("claude-code");
	assert.ok(claude.include.includes(".claude"));
	assert.ok(claude.include.includes(".claude.json"));
	assert.ok(claude.exclude.includes(".claude/.credentials.json"));
	const codex = MOVE_ALLOWLIST("codex");
	assert.ok(codex.include.includes(".codex"));
	assert.ok(codex.exclude.includes(".codex/auth.json"));
	assert.ok(MOVE_ALLOWLIST("openclaw").include.includes(".openclaw"));
	const hermes = MOVE_ALLOWLIST("hermes");
	assert.ok(hermes.include.includes(".agent-machines/config.yaml"));
	assert.ok(hermes.include.includes(".agent-machines/state.db"));
	assert.ok(!hermes.include.includes(".agent-machines/.env"), "hermes .env re-derives");
});

test("the re-derived and lost lists say what the report will say", () => {
	for (const agent of HARNESS_KINDS) {
		const rederived = REDERIVED(agent);
		assert.ok(rederived.some((line) => line.includes("toolchain")), `${agent}: toolchain line`);
		assert.ok(rederived.some((line) => line.includes("credential")), `${agent}: credential line`);
		assert.ok(rederived.some((line) => line.includes("combined entry docs")), `${agent}: docs line`);
	}
	assert.ok(REDERIVED("hermes").some((line) => line.includes("249 MB")));
	assert.ok(REDERIVED("codex").some((line) => line.includes("auth.json")));
	// Every migration loses processes, /tmp, apt state and create-time env.
	assert.equal(LOST_ALWAYS.length, 4);
	// Only e2b has RAM-snapshot state no file copy captures.
	assert.ok(lostState("e2b").some((line) => line.includes("RAM state")));
	assert.ok(!lostState("sprites").some((line) => line.includes("RAM state")));
	assert.deepEqual(lostState("sprites"), [...LOST_ALWAYS]);
});

// ---------------------------------------------------------------------------
// The export command
// ---------------------------------------------------------------------------

test("buildExportCommand snapshots: relative paths, excludes first, everything quoted", () => {
	const plan = MOVE_ALLOWLIST("claude-code");
	assert.equal(
		buildExportCommand(plan, "/tmp/t.tgz"),
		`tar -C "$HOME" -czf '/tmp/t.tgz' --ignore-failed-read ` +
			`--exclude='.env' --exclude='.agent-env' --exclude='.claude/.credentials.json' ` +
			`'.agent-machines/SOUL.md' '.agent-machines/AGENTS.md' '.agent-machines/MEMORY.md' ` +
			`'.agent-machines/USER.md' '.agent-machines/skills' '.agent-machines/.loadout' ` +
			`'.agent-machines/state' '.agent-machines/chats' '.agent-machines/artifacts' ` +
			`'.agent-machines/crons' '.agent-machines/mcps' '.agent-machines/sessions' ` +
			`'.agent-machines/.migration-marker' '.claude' '.claude.json'`,
	);
	// Never `tar $HOME`: the command must archive the allowlist, not the home.
	assert.ok(!buildExportCommand(plan, "/tmp/t.tgz").includes(`-czf '/tmp/t.tgz' "$HOME"`));
});

test("buildExportCommand refuses an empty include list", () => {
	assert.throws(
		() => buildExportCommand({ include: [], exclude: [] }, "/tmp/t.tgz"),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /no paths to ship/);
			return true;
		},
	);
});

// ---------------------------------------------------------------------------
// Presence probe
// ---------------------------------------------------------------------------

test("probeIncludes reports absences and swallowed verdicts instead of dropping them", async () => {
	const include = [".agent-machines/MEMORY.md", ".agent-machines/chats", ".agent-machines/mcps"];
	const handle = {
		async exec(command: string): Promise<ExecResult> {
			assert.equal(command, buildPresenceProbe(include));
			// mcps gets NO verdict at all -- the trimmed-output case.
			return ok("AM_MOVE P .agent-machines/MEMORY.md\nAM_MOVE A .agent-machines/chats\n");
		},
	};
	const report = await probeIncludes(handle, include);
	assert.deepEqual(report.present, [".agent-machines/MEMORY.md"]);
	assert.deepEqual(report.skipped, [
		{ path: ".agent-machines/chats", reason: "not present on the source" },
		{
			path: ".agent-machines/mcps",
			reason: "presence probe returned no verdict for this path",
		},
	]);
});

// ---------------------------------------------------------------------------
// Export transport
// ---------------------------------------------------------------------------

/** A source whose /tmp tar is `tar`; serves stat/sha256sum/dd like a shell. */
class FakeSource {
	readonly execs: string[] = [];
	constructor(
		readonly tar: Buffer,
		readonly overrides: (command: string) => ExecResult | undefined = () => undefined,
	) {}

	async exec(command: string, _options?: ExecOptions): Promise<ExecResult> {
		this.execs.push(command);
		const override = this.overrides(command);
		if (override) return override;
		if (command.startsWith("stat -c %s ")) return ok(`${this.tar.length}\n`);
		if (command.startsWith("sha256sum ")) return ok(`${sha256(this.tar)}  /tmp/t.tgz\n`);
		if (command.startsWith("dd if=")) {
			const skip = Number(/skip=(\d+)/.exec(command)?.[1]);
			const count = Number(/count=(\d+)/.exec(command)?.[1]);
			const bs = Number(/bs=(\d+)/.exec(command)?.[1]);
			const slice = this.tar.subarray(skip * bs, skip * bs + count * bs);
			return ok(slice.toString("base64"));
		}
		if (command.startsWith("du -sh ")) return ok("600M\t$HOME/.agent-machines/skills\n");
		throw new Error(`FakeSource has no handler for: ${command}`);
	}
}

/** ~2.7 chunks, so reassembly crosses two chunk boundaries. */
function fixtureTar(size = 700_003): Buffer {
	const bytes = Buffer.alloc(size);
	for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
	return bytes;
}

test("exportTar reassembles chunked base64 byte-for-byte and returns the source digest", async () => {
	const tar = fixtureTar();
	const source = new FakeSource(tar);
	const exported = await exportTar(source, "/tmp/t.tgz");
	assert.equal(exported.bytes.length, tar.length);
	assert.ok(exported.bytes.equals(tar), "reassembled bytes differ from the source tar");
	assert.equal(exported.sha256, sha256(tar));
	// 700,003 bytes at 256 KiB per exec is 3 chunks, each dd'ing 4x64KiB blocks.
	const chunkReads = source.execs.filter((command) => command.startsWith("dd if="));
	assert.equal(chunkReads.length, Math.ceil(tar.length / EXPORT_CHUNK_RAW_BYTES));
	assert.match(chunkReads[0], /bs=65536 skip=0 count=4/);
	assert.match(chunkReads[1], /bs=65536 skip=4 count=4/);
	assert.match(chunkReads[2], /bs=65536 skip=8 count=4/);
	// Newlines are stripped in-shell so sprites/dedalus trimming cannot
	// corrupt a chunk boundary.
	for (const command of chunkReads) assert.ok(command.includes(`| base64 | tr -d "\\n"`));
});

test("exportTar aborts on a digest mismatch, naming both digests", async () => {
	const tar = fixtureTar(300_000);
	const wrong = "0".repeat(64);
	const source = new FakeSource(tar, (command) =>
		command.startsWith("sha256sum ") ? ok(`${wrong}  /tmp/t.tgz\n`) : undefined,
	);
	await assert.rejects(
		() => exportTar(source, "/tmp/t.tgz"),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "transient");
			assert.ok(error.message.includes(wrong), "must name the source digest");
			assert.ok(error.message.includes(sha256(tar)), "must name the reassembled digest");
			return true;
		},
	);
});

test("exportTar fails closed above the size limit, before any chunk crosses the wire", async () => {
	const source = new FakeSource(fixtureTar(64), (command) =>
		command.startsWith("stat -c %s ") ? ok(`${MAX_STATE_TAR_BYTES + 1}\n`) : undefined,
	);
	await assert.rejects(
		() => exportTar(source, "/tmp/t.tgz", { include: [".agent-machines/skills"] }),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "fatal");
			assert.match(error.message, /unmeasured/);
			// The actionable part: which entry to prune.
			assert.ok(error.message.includes("600M"), "must name the biggest offenders via du");
			return true;
		},
	);
	assert.ok(
		!source.execs.some((command) => command.startsWith("dd if=")),
		"no chunk may be read once the size guard tripped",
	);
});

test("exportTar reports a truncated chunk as a size mismatch, not a success", async () => {
	const tar = fixtureTar(300_000);
	const source = new FakeSource(tar, (command) => {
		if (!command.startsWith("dd if=") || !command.includes("skip=4")) return undefined;
		// Second chunk loses its tail -- the trimming failure mode.
		const slice = tar.subarray(4 * 65_536, 4 * 65_536 + 1_000);
		return ok(slice.toString("base64"));
	});
	await assert.rejects(() => exportTar(source, "/tmp/t.tgz"), /truncated in transit/);
});

// ---------------------------------------------------------------------------
// Restore transport
// ---------------------------------------------------------------------------

class FakeTarget {
	readonly writes: Array<{ path: string; content: string }> = [];
	readonly execs: string[] = [];
	constructor(readonly respond: (command: string) => ExecResult) {}
	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		this.writes.push({ path, content: content.toString() });
	}
	async exec(command: string, _options?: ExecOptions): Promise<ExecResult> {
		this.execs.push(command);
		return this.respond(command);
	}
}

test("restoreTar stages one file, verifies the digest ON TARGET, extracts foreground, and fixes up", async () => {
	const tar = fixtureTar(1_000);
	const digest = sha256(tar);
	const target = new FakeTarget(() => ok("AM_MOVE_RESTORED\n"));
	await restoreTar(target, tar, { sha256: digest, agent: "codex", oldHome: "/home/user" });

	// One writeFile of base64 (the loadout precedent), never argv.
	assert.equal(target.writes.length, 1);
	assert.equal(target.writes[0].path, `/tmp/am-migrate-${digest.slice(0, 16)}.b64`);
	assert.equal(target.writes[0].content, tar.toString("base64"));

	assert.equal(target.execs.length, 1, "restore is ONE foreground exec");
	const script = target.execs[0];
	// Digest re-checked on the machine that will extract it.
	assert.ok(script.includes(`[ "$actual" = "${digest}" ]`));
	// Foreground extraction (sprites throttles detached work), $HOME-relative.
	assert.ok(script.includes(`tar -C "$HOME" -xzf`));
	// Both temp files removed.
	assert.ok(script.includes(`rm -f '/tmp/am-migrate-${digest.slice(0, 16)}.b64' '/tmp/am-migrate-${digest.slice(0, 16)}.tgz'`));
	// tmux restore must relaunch THIS machine's agent, not the source's.
	assert.ok(script.includes(`"desiredAgentKind":"codex"`));
	// Text configs that embed the old HOME are rewritten for the new one.
	assert.ok(script.includes(`sed "s|/home/user|$HOME|g"`));
	assert.ok(script.includes(".codex/config.toml"));
	assert.ok(script.includes(".claude.json"));
	assert.ok(script.includes(".agent-machines/config.yaml"));
});

test("restoreTar without oldHome skips the home rewrite instead of guessing one", async () => {
	const tar = fixtureTar(1_000);
	const target = new FakeTarget(() => ok("AM_MOVE_RESTORED\n"));
	await restoreTar(target, tar, { sha256: sha256(tar), agent: "hermes" });
	assert.ok(!target.execs[0].includes('sed "s|'), "no rewrite without a known old HOME");
});

test("restoreTar surfaces a target-side digest mismatch with both digests", async () => {
	const tar = fixtureTar(1_000);
	const target = new FakeTarget(() =>
		fail(65, "AM_MOVE_SHA_MISMATCH deadbeef"),
	);
	await assert.rejects(
		() => restoreTar(target, tar, { sha256: sha256(tar), agent: "codex" }),
		(error: unknown) => {
			assert.ok(error instanceof MuxError);
			assert.equal(error.kind, "transient");
			assert.ok(error.message.includes(sha256(tar)));
			assert.ok(error.message.includes("deadbeef"));
			assert.match(error.message, /nothing was extracted/);
			return true;
		},
	);
});

test("restoreTar refuses exit 0 without the completion sentinel", async () => {
	// Measured failure mode: a substrate returned exit 0 for a killed
	// process (loadout.ts), so the exit code alone cannot prove extraction.
	const tar = fixtureTar(1_000);
	const target = new FakeTarget(() => ok(""));
	await assert.rejects(
		() => restoreTar(target, tar, { sha256: sha256(tar), agent: "codex" }),
		/completion sentinel missing/,
	);
});

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

/** A box whose marker file round-trips through the same base64 the code uses. */
class FakeMarkerBox {
	marker: string | null = null;
	async exec(command: string): Promise<ExecResult> {
		const write = /printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d > "\$HOME\/\.agent-machines\/\.migration-marker"/.exec(
			command,
		);
		if (write) {
			this.marker = Buffer.from(write[1], "base64").toString("utf8");
			return ok();
		}
		if (command === `cat "$HOME/${MIGRATION_MARKER_PATH}"`) {
			// Trailing-whitespace trim, as sprites/dedalus apply to exec output.
			return this.marker === null ? fail(1, "No such file") : ok(this.marker.trim());
		}
		throw new Error(`FakeMarkerBox has no handler for: ${command}`);
	}
}

const MARKER: MigrationMarker = {
	name: "reviewer",
	fromSubstrate: "e2b",
	fromSandboxId: "sbx-1",
	nonce: "nonce-1",
	at: "2026-08-03T12:00:00.000Z",
};

test("the migration marker round-trips, and a stale nonce is caught", async () => {
	const box = new FakeMarkerBox();
	await writeMarker(box, MARKER);
	assert.deepEqual(await verifyMarker(box, MARKER), { ok: true });

	// A marker from an EARLIER migration of the same name: every field but
	// the nonce matches, which is exactly the case byte-comparison of a
	// pre-existing file would wave through.
	const stale = await verifyMarker(box, { ...MARKER, nonce: "nonce-2" });
	assert.equal(stale.ok, false);
	if (!stale.ok) assert.match(stale.reason, /"nonce"/);
});

test("a missing or unparseable marker fails the verdict with the reason named", async () => {
	const box = new FakeMarkerBox();
	const missing = await verifyMarker(box, MARKER);
	assert.equal(missing.ok, false);
	if (!missing.ok) assert.match(missing.reason, /missing on the target/);

	box.marker = "not json";
	const garbage = await verifyMarker(box, MARKER);
	assert.equal(garbage.ok, false);
	if (!garbage.ok) assert.match(garbage.reason, /not parseable/);
});

test("readHome survives output trimming via its delimiters", async () => {
	const handle = {
		async exec(): Promise<ExecResult> {
			return ok("AM_MOVE_HOME:/home/sprite:");
		},
	};
	assert.equal(await readHome(handle), "/home/sprite");
});

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { isRuntimeSessionId, runtimeSessionsCommand } from "./runtime-sessions";
import type { SessionsPayload, SessionTranscriptPayload } from "./types";

const homes: string[] = [];
function fixtureHome(label = "home") {
	const path = realpathSync(mkdtempSync(join(tmpdir(), `am-sessions-${label}-`)));
	homes.push(path);
	return path;
}
function file(home: string, path: string, content: string) {
	const target = join(home, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
	return target;
}
function jsonl(home: string, path: string, records: unknown[]) {
	return file(home, path, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}
function rawProbe(home: string, id?: string, env: Record<string, string> = {}) {
	const result = spawnSync("/bin/bash", ["-c", runtimeSessionsCommand(id)], {
		env: { ...process.env, HOME: home, ...env }, encoding: "utf8", timeout: 5_000, maxBuffer: 4 * 1024 * 1024,
	});
	expect(result.status, result.stderr).toBe(0);
	return JSON.parse(result.stdout);
}
function probe<T = SessionsPayload>(home: string, id?: string, env: Record<string, string> = {}): T {
	const data = rawProbe(home, id, env);
	expect(data.error, JSON.stringify(data)).toBeUndefined();
	return data as T;
}
function hermesDatabase(home: string, sessionId = "hermes-session") {
	const path = join(home, ".agent-machines/state.db");
	mkdirSync(dirname(path), { recursive: true });
	const result = spawnSync("python3", ["-c", `
import json, sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, started_at REAL, ended_at REAL)")
    db.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, timestamp REAL, tool_name TEXT, tool_calls TEXT)")
    db.execute("INSERT INTO sessions VALUES (?, 'Weekly briefing', 1788900000, NULL)", (sys.argv[2],))
    db.executemany("INSERT INTO messages VALUES (?, ?, ?, ?, 1788900010, ?, ?)", [
        (1, sys.argv[2], 'user', 'Research Acme', None, None),
        (2, sys.argv[2], 'assistant', 'Found primary sources.', None, None),
        (3, sys.argv[2], 'tool', 'Source verified.', 'web_search', None),
        (4, sys.argv[2], 'assistant', '', None, json.dumps([{"function": {"name": "write_file", "arguments": json.dumps({"path": "brief.md"}, separators=(',', ':'))}}])),
    ])
`, path, sessionId], { encoding: "utf8" });
	expect(result.status, result.stderr).toBe(0);
	return path;
}

function openclawMetadataDatabase(home: string) {
	const path = join(home, ".openclaw/agents/main/agent/openclaw-agent.sqlite");
	mkdirSync(dirname(path), { recursive: true });
	const result = spawnSync("python3", ["-c", `
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute("CREATE TABLE auth_profile_store (store_key TEXT PRIMARY KEY, store_json TEXT, updated_at INTEGER)")
    db.execute("CREATE TABLE memory_index_meta (key TEXT PRIMARY KEY, value TEXT)")
    db.execute("INSERT INTO auth_profile_store VALUES ('fixture', 'NOT-A-CONVERSATION-OR-PUBLIC-CREDENTIAL', 1)")
`, path], { encoding: "utf8" });
	expect(result.status, result.stderr).toBe(0);
	return path;
}

afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("native runtime session reader (executed on a real fixture HOME)", () => {
	it.each(["user", "sprite", "vercel-sandbox", "machine"])("reads actual native history from the %s provider HOME", (label) => {
		const home = fixtureHome(label);
		jsonl(home, ".claude/projects/-workspace/session.jsonl", [
			{ type: "user", timestamp: "2026-09-08T18:00:00Z", message: { role: "user", content: "Inspect this repository." } },
			{ type: "assistant", message: { role: "assistant", content: [{ type: "thinking", thinking: "not display content" }, { type: "text", text: "Two tests need attention." }, { type: "tool_use", name: "Bash", input: { command: "pnpm test" } }] } },
			{ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "Tests passed." }] } },
		]);
		const list = probe(home);
		expect(list.sessions).toHaveLength(1);
		expect(list.sessions[0]).toMatchObject({ runtime: "claude-code", preview: "Inspect this repository.", source: "~/.claude/projects/-workspace/session.jsonl" });
		expect(isRuntimeSessionId(list.sessions[0].id)).toBe(true);
		const detail = probe<SessionTranscriptPayload>(home, list.sessions[0].id);
		expect(detail.messages.map(({ role, text }) => ({ role, text }))).toEqual([
			{ role: "user", text: "Inspect this repository." },
			{ role: "assistant", text: "Two tests need attention." },
			{ role: "tool", text: '{"command": "pnpm test"}' },
			{ role: "tool", text: "Tests passed." },
		]);
		expect(JSON.stringify(detail)).not.toContain("not display content");
		expect(detail.truncated).toBe(false);
	});

	it("lists retained histories from all four runtimes without inventing configured sessions", () => {
		const home = fixtureHome();
		file(home, ".agent-machines/state/terminal-agent.json", '{"agent":"claude-code"}');
		jsonl(home, ".claude/projects/-workspace/claude.jsonl", [{ type: "user", message: { role: "user", content: "Claude task" } }]);
		jsonl(home, ".codex/sessions/2026/09/08/rollout.jsonl", [
			{ type: "session_meta", payload: { id: "codex-session", cwd: "/workspace" } },
			{ type: "event_msg", payload: { type: "user_message", message: "Codex task" } },
			{ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Codex task" }] } },
			{ type: "response_item", payload: { type: "reasoning", summary: [{ text: "hidden reasoning" }] } },
			{ type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: '{"cmd":"pwd"}' } },
			{ type: "response_item", payload: { type: "function_call_output", output: "/workspace" } },
			{ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Codex result" }] } },
			{ type: "event_msg", payload: { type: "agent_message", message: "Codex result" } },
		]);
		jsonl(home, ".openclaw/agents/main/sessions/openclaw.jsonl", [
			{ type: "session", version: 3, id: "openclaw-session" },
			{ type: "message", message: { role: "user", content: [{ type: "text", text: "OpenClaw task" }] } },
			{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read", arguments: { path: "notes.md" } }] } },
			{ type: "message", message: { role: "toolResult", toolName: "read", content: [{ type: "text", text: "Project notes" }] } },
		]);
		const db = hermesDatabase(home, "hermes'; DROP TABLE messages; --");
		const before = readFileSync(db);
		symlinkSync(join(home, ".agent-machines"), join(home, ".hermes"));
		const list = probe(home);
		expect(list.sessions).toHaveLength(4);
		expect(new Set(list.sessions.map((session) => session.runtime))).toEqual(new Set(["claude-code", "codex", "openclaw", "hermes"]));
		const byRuntime = Object.fromEntries(list.sessions.map((session) => [session.runtime, probe<SessionTranscriptPayload>(home, session.id)]));
		expect(byRuntime.codex.messages.map((message) => message.text)).toEqual(["Codex task", '{"cmd":"pwd"}', "/workspace", "Codex result"]);
		expect(byRuntime.openclaw.messages).toMatchObject([{ role: "user", text: "OpenClaw task" }, { role: "tool", toolName: "read" }, { role: "tool", toolName: "read", text: "Project notes" }]);
		expect(byRuntime.hermes.session.preview).toBe("Weekly briefing");
		expect(byRuntime.hermes.messages).toMatchObject([{ role: "user", text: "Research Acme" }, { role: "assistant", text: "Found primary sources." }, { role: "tool", text: "Source verified." }, { role: "tool", toolName: "write_file", text: '{"path":"brief.md"}' }]);
		expect(readFileSync(db)).toEqual(before);
		expect(readdirSync(dirname(db)).sort()).toEqual(["state", "state.db"]);
	});

	it("returns no sessions and does not create a database when only runtime configuration exists", () => {
		const home = fixtureHome();
		file(home, ".claude/settings.json", "{}");
		file(home, ".agent-machines/config.yaml", "model: example");
		const result = probe(home);
		expect(result).toMatchObject({ sessions: [], totalSessions: 0, totalBytes: 0, warnings: [] });
		expect(existsSync(join(home, ".agent-machines/state.db"))).toBe(false);
	});

	it("does not follow transcript files or directories symlinked outside the machine HOME", () => {
		const home = fixtureHome();
		const outside = fixtureHome("outside");
		const secret = jsonl(outside, "private.jsonl", [{ type: "user", message: { role: "user", content: "Do not read" } }]);
		mkdirSync(join(home, ".claude/projects"), { recursive: true });
		symlinkSync(secret, join(home, ".claude/projects/leak.jsonl"));
		symlinkSync(outside, join(home, ".claude/projects/leak-directory"));
		expect(probe(home).sessions).toEqual([]);
	});

	it("preserves warnings for corrupt actual Hermes history databases", () => {
		const home = fixtureHome();
		file(home, ".agent-machines/state.db", "not a sqlite database");
		const list = probe(home);
		expect(list.sessions).toEqual([]);
		expect(list.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Hermes history exists")]));
	});

	it.each([true, false])("does not mistake OpenClaw auth/memory SQLite for conversation storage (JSONL present: %s)", (withConversation) => {
		const home = fixtureHome();
		const metadata = openclawMetadataDatabase(home);
		const before = readFileSync(metadata);
		if (withConversation) jsonl(home, ".openclaw/agents/main/sessions/conversation.jsonl", [
			{ type: "message", message: { role: "user", content: "A real OpenClaw conversation" } },
		]);
		const list = probe(home);
		expect(list.sessions).toHaveLength(withConversation ? 1 : 0);
		expect(list.warnings).toEqual([]);
		if (withConversation) {
			const detail = probe<SessionTranscriptPayload>(home, list.sessions[0].id);
			expect(detail.messages[0].text).toBe("A real OpenClaw conversation");
			expect(detail.warnings).toEqual([]);
		}
		expect(JSON.stringify(list)).not.toContain("NOT-A-CONVERSATION-OR-PUBLIC-CREDENTIAL");
		expect(readFileSync(metadata)).toEqual(before);
		expect(readdirSync(dirname(metadata))).toEqual(["openclaw-agent.sqlite"]);
	});

	it.each([true, false])("excludes OpenClaw trajectory traces without deleting them (conversation companion: %s)", (withConversation) => {
		const home = fixtureHome();
		const trace = jsonl(home, ".openclaw/agents/main/sessions/same-id.trajectory.jsonl", [
			{ traceSchema: "openclaw", type: "context.compiled", sessionId: "same-id", data: "x".repeat(80000) },
		]);
		const before = readFileSync(trace);
		if (withConversation) jsonl(home, ".openclaw/agents/main/sessions/same-id.jsonl", [
			{ type: "message", message: { role: "user", content: "The conversation, not its diagnostic trace" } },
		]);
		const list = probe(home);
		expect(list.sessions).toHaveLength(withConversation ? 1 : 0);
		expect(list.warnings).toEqual([]);
		expect(list.totalBytes).toBe(withConversation ? readFileSync(join(home, ".openclaw/agents/main/sessions/same-id.jsonl")).length : 0);
		if (withConversation) expect(list.sessions[0].source).toBe("~/.openclaw/agents/main/sessions/same-id.jsonl");
		expect(readFileSync(trace)).toEqual(before);
	});

	it("preserves corruption warnings for an actual OpenClaw conversation while ignoring its trace", () => {
		const home = fixtureHome();
		file(home, ".openclaw/agents/main/sessions/broken.jsonl", '{"type":');
		file(home, ".openclaw/agents/main/sessions/broken.trajectory.jsonl", '{"traceSchema":');
		const list = probe(home);
		expect(list.sessions).toHaveLength(1);
		expect(list.sessions[0].source).toBe("~/.openclaw/agents/main/sessions/broken.jsonl");
		expect(list.warnings.join(" ")).toContain("Some transcript records could not be decoded");
		const detail = probe<SessionTranscriptPayload>(home, list.sessions[0].id);
		expect(detail.messages).toEqual([]);
		expect(detail.warnings).toContain("Some incomplete or invalid transcript records were skipped.");
	});

	it("does not apply OpenClaw-specific trace naming to another runtime", () => {
		const home = fixtureHome();
		jsonl(home, ".claude/projects/test/legitimate.trajectory.jsonl", [{ type: "user", message: { role: "user", content: "Claude transcript" } }]);
		expect(probe(home).sessions).toHaveLength(1);
	});

	it("bounds transcripts and skips incomplete append records without losing readable messages", () => {
		const home = fixtureHome();
		const records = Array.from({ length: 220 }, (_, index) => ({ type: "user", message: { role: "user", content: `Message ${index}` } }));
		file(home, ".claude/projects/test/session.jsonl", records.map((record) => JSON.stringify(record)).join("\n") + '\n{"type":');
		const list = probe(home);
		const transcript = probe<SessionTranscriptPayload>(home, list.sessions[0].id);
		expect(transcript.messages).toHaveLength(200);
		expect(transcript.messages[0].text).toBe("Message 20");
		expect(transcript.messages.at(-1)?.text).toBe("Message 219");
		expect(transcript.truncated).toBe(true);
		expect(transcript.warnings).toContain("Some incomplete or invalid transcript records were skipped.");
	});

	it("truncates very long message text and marks it explicitly", () => {
		const home = fixtureHome();
		jsonl(home, ".claude/projects/test/session.jsonl", [{ type: "user", message: { role: "user", content: "x".repeat(15000) } }]);
		const detail = probe<SessionTranscriptPayload>(home, probe(home).sessions[0].id);
		expect(detail.messages[0].text).toHaveLength(12000);
		expect(detail.messages[0].truncated).toBe(true);
		expect(detail.truncated).toBe(true);
	});

	it("bounds the complete transcript payload while retaining the most recent messages", () => {
		const home = fixtureHome();
		jsonl(home, ".claude/projects/test/session.jsonl", Array.from({ length: 180 }, (_, index) => ({ type: "user", message: { role: "user", content: `${index}: ${"x".repeat(6000)}` } })));
		const detail = probe<SessionTranscriptPayload>(home, probe(home).sessions[0].id);
		expect(detail.truncated).toBe(true);
		expect(Buffer.byteLength(JSON.stringify(detail))).toBeLessThan(550_000);
		expect(detail.messages.at(-1)?.text).toMatch(/^179:/);
	});

	it("reads committed live WAL messages without changing the original DB, WAL, or SHM", () => {
		const home = fixtureHome();
		const db = hermesDatabase(home);
		const result = spawnSync("python3", ["-c", `
import hashlib, json, os, pathlib, shlex, sqlite3, subprocess, sys
path, command = sys.argv[1:]
connection = sqlite3.connect(path)
connection.execute("PRAGMA journal_mode=WAL")
connection.execute("PRAGMA wal_autocheckpoint=0")
connection.execute("INSERT INTO messages VALUES (5, 'hermes-session', 'assistant', 'Committed only in the active WAL.', 1788900020, NULL, NULL)")
connection.commit()
def hashes():
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path(path).parent.glob("state.db*")}
before = hashes()
assert os.path.getsize(path + '-wal') > 0
args = shlex.split(command)
listing = json.loads(subprocess.check_output(args, env=os.environ))
args[-1] = listing["sessions"][0]["id"]
detail = json.loads(subprocess.check_output(args, env=os.environ))
print(json.dumps({"listing": listing, "detail": detail, "unchanged": hashes() == before}))
connection.close()
`, db, runtimeSessionsCommand()], { env: { ...process.env, HOME: home }, encoding: "utf8", timeout: 5000 });
		expect(result.status, result.stderr).toBe(0);
		const observed = JSON.parse(result.stdout);
		expect(observed.unchanged).toBe(true);
		expect(observed.listing.warnings).toEqual([]);
		expect(observed.detail.messages.at(-1).text).toBe("Committed only in the active WAL.");
	});

	it.each(["jsonl-parent", "jsonl-file", "sqlite-parent", "sqlite-file"])("does not read external data during a deterministic %s substitution", (race) => {
		const home = fixtureHome();
		const outside = fixtureHome("outside");
		const hooks = fixtureHome("hooks");
		const sqlite = race.startsWith("sqlite");
		if (sqlite) {
			hermesDatabase(home, "local-session");
			const outsideDb = hermesDatabase(outside, "PRIVATE-EXTERNAL-SESSION");
			const marker = spawnSync("python3", ["-c", "import sqlite3, sys; connection = sqlite3.connect(sys.argv[1]); connection.execute(\"UPDATE sessions SET title = 'PRIVATE EXTERNAL HISTORY'\"); connection.commit(); connection.close()", outsideDb]);
			expect(marker.status).toBe(0);
		} else {
			jsonl(home, ".claude/projects/test/session.jsonl", [{ type: "user", message: { role: "user", content: "Local safe history" } }]);
			jsonl(outside, "session.jsonl", [{ type: "user", message: { role: "user", content: "PRIVATE EXTERNAL HISTORY" } }]);
		}
		const session = probe(home).sessions[0];
		file(hooks, "sitecustomize.py", `
import os
original = os.open
fired, opens = False, 0
root, outside, race = os.environ["HOME"], os.environ["AM_TEST_OUTSIDE"], os.environ["AM_TEST_RACE"]
def raced_open(path, flags, *args, **kwargs):
    global fired, opens
    if path == ("state.db" if race.startswith("sqlite") else "session.jsonl"):
        opens += 1
        if not fired and (not race.startswith("sqlite") or opens == 2):
            fired = True
            parent = root + ("/.agent-machines" if race.startswith("sqlite") else "/.claude/projects/test")
            target = outside + ("/.agent-machines" if race.startswith("sqlite") else "")
            if race.endswith("parent"):
                os.rename(parent, parent + "-original")
                os.symlink(target, parent)
            else:
                os.unlink(parent + "/" + path)
                os.symlink(target + "/" + path, parent + "/" + path)
    return original(path, flags, *args, **kwargs)
os.open = raced_open
`);
		const observed = rawProbe(home, sqlite ? undefined : session.id, { PYTHONPATH: hooks, AM_TEST_OUTSIDE: outside, AM_TEST_RACE: race });
		expect(JSON.stringify(observed)).not.toContain("PRIVATE");
		if (race.endsWith("file")) {
			if (sqlite) {
				expect(observed.sessions).toEqual([]);
				expect(observed.warnings.join(" ")).toContain("read-only snapshot");
			} else expect(observed.error).toBe("history_read_failed");
		} else if (!sqlite) expect(observed.messages[0].text).toBe("Local safe history");
		else expect(observed.sessions[0].id).toBe(session.id);
	});

	it("bounds every Hermes SQL field before materializing rows, and flags oversized tool details and IDs", () => {
		const home = fixtureHome();
		const db = hermesDatabase(home);
		const hooks = fixtureHome("sql-hooks");
		const setup = spawnSync("python3", ["-c", `
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    huge = 'x' * (2 * 1024 * 1024)
    db.execute("UPDATE sessions SET title = ?", (huge,))
    db.execute("INSERT INTO sessions VALUES (?, 'Invalid ID', 1788900001, NULL)", ('i' * 1000,))
    db.execute("INSERT INTO messages VALUES (5, 'hermes-session', 'assistant', ?, ?, ?, ?)", (huge, huge, huge, huge))
`, db], { encoding: "utf8" });
		expect(setup.status, setup.stderr).toBe(0);
		file(hooks, "sitecustomize.py", `
import sqlite3
original = sqlite3.connect
class Cursor:
    def __init__(self, cursor): self.cursor = cursor
    def __iter__(self): return iter(self.cursor)
    def fetchone(self): return self.cursor.fetchone()
    def fetchall(self):
        rows = self.cursor.fetchall()
        for row in rows:
            for value in row:
                if isinstance(value, str): assert len(value) <= 12001, 'unbounded SQL string materialized'
                if isinstance(value, bytes): assert len(value) <= 65536, 'unbounded SQL bytes materialized'
        return rows
class Connection(sqlite3.Connection):
    def execute(self, *args, **kwargs): return Cursor(super().execute(*args, **kwargs))
def connect(*args, **kwargs):
    kwargs['factory'] = Connection
    return original(*args, **kwargs)
sqlite3.connect = connect
`);
		const listing = probe(home, undefined, { PYTHONPATH: hooks });
		expect(listing.sessions).toHaveLength(1);
		expect(listing.sessions[0].preview).toHaveLength(180);
		expect(listing.warnings.join(" ")).toContain("identifiers over 512 bytes");
		const transcript = probe<SessionTranscriptPayload>(home, listing.sessions[0].id, { PYTHONPATH: hooks });
		expect(transcript.messages.at(-1)?.text).toHaveLength(12000);
		expect(transcript.messages.at(-1)?.toolName).toHaveLength(120);
		expect(transcript.messages.at(-1)?.at).toHaveLength(80);
		expect(transcript.truncated).toBe(true);
		expect(transcript.warnings.join(" ")).toContain("tool-call details exceeding 64 KiB");
		expect(Buffer.byteLength(JSON.stringify(transcript))).toBeLessThan(20_000);
	});

	it.each(["oversized-db", "oversized-wal", "symlink-wal", "rollback-journal", "changing-db"])("surfaces a precise degradation reason for %s", (scenario) => {
		const home = fixtureHome();
		const db = hermesDatabase(home);
		const hooks = fixtureHome("hooks");
		if (scenario === "oversized-db") truncateSync(db, 33 * 1024 * 1024);
		if (scenario === "oversized-wal") { file(home, ".agent-machines/state.db-wal", ""); truncateSync(db + "-wal", 33 * 1024 * 1024); }
		if (scenario === "symlink-wal") symlinkSync(file(hooks, "private", "PRIVATE WAL"), db + "-wal");
		if (scenario === "rollback-journal") file(home, ".agent-machines/state.db-journal", "active");
		if (scenario === "changing-db") file(hooks, "sitecustomize.py", `
import os
original_read = os.read
changed = False
def read(*args, **kwargs):
    global changed
    data = original_read(*args, **kwargs)
    if not changed:
        changed = True
        path = os.environ["HOME"] + '/.agent-machines/state.db'
        info = os.stat(path)
        os.utime(path, ns=(info.st_atime_ns, info.st_mtime_ns + 1000000000))
    return data
os.read = read
`);
		const listing = probe(home, undefined, { PYTHONPATH: hooks });
		expect(listing.sessions).toEqual([]);
		expect(listing.warnings.join(" ")).toContain("read-only snapshot");
		const detail = listing.warnings.join(" ");
		if (scenario.startsWith("oversized")) expect(detail).toContain("32 MiB snapshot limit");
		if (scenario === "rollback-journal") expect(detail).toContain("active rollback journal");
		if (scenario === "changing-db") expect(detail).toContain("changed during snapshot");
	});

	it("never reads beyond the JSONL byte cap even for a giant unterminated line", () => {
		const home = fixtureHome();
		const hooks = fixtureHome("read-budget");
		file(home, ".claude/projects/test/session.jsonl", "x".repeat(5 * 1024 * 1024));
		const listing = probe(home);
		file(hooks, "sitecustomize.py", `
import os
original = os.read
total = 0
def read(fd, count):
    global total
    data = original(fd, count)
    total += len(data)
    assert total <= 2 * 1024 * 1024, 'read beyond the transcript byte cap'
    return data
os.read = read
`);
		const transcript = probe<SessionTranscriptPayload>(home, listing.sessions[0].id, { PYTHONPATH: hooks });
		expect(transcript.messages).toEqual([]);
		expect(transcript.truncated).toBe(true);
	});

	it.each(["../../.env", "$(touch /tmp/session-injection)", "a".repeat(63), "" ])("rejects an untrusted session locator before shell generation: %s", (id) => {
		expect(() => runtimeSessionsCommand(id)).toThrow("Invalid session identifier");
	});
});

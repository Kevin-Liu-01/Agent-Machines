import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { INTROSPECTION_COMMAND, parseIntrospection } from "./machine-introspection";

const fixtures: string[] = [];

function fixtureHome() {
	const home = mkdtempSync(join(tmpdir(), "am-introspection-"));
	fixtures.push(home);
	return home;
}

function file(home: string, path: string, content: string, executable = false) {
	const target = join(home, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, { mode: executable ? 0o755 : 0o644 });
}

function probe(home: string) {
	const result = spawnSync("/bin/bash", ["-c", INTROSPECTION_COMMAND], {
		env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" },
		encoding: "utf8",
		timeout: 5_000,
	});
	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toContain("===END===");
	return parseIntrospection(result.stdout);
}

afterEach(() => {
	for (const home of fixtures.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("machine introspection", () => {
	it("invariant_native_runtime_and_worker_state_are_observed_in_the_provider_home", () => {
		const home = fixtureHome();
		file(home, ".npm-global/bin/claude", "#!/bin/sh\necho 'Claude Code 2.1.220'\n", true);
		file(home, ".claude/settings.json", "{}");
		file(home, ".agent-machines/SOUL.md", "A careful researcher.");
		file(home, ".agent-machines/AGENTS.md", "Verify every source.");
		file(home, ".agent-machines/MEMORY.md", "Remember the project.");
		file(home, ".agent-machines/USER.md", "Use concise reports.");
		file(home, ".agent-machines/skills/research/SKILL.md", "# Research");
		file(home, ".agent-machines/skills/writing/SKILL.md", "author: agent\n# Writing");

		const result = probe(home);
		expect(result.detectedAgent).toBe("claude-code");
		expect(result.agentVersion).toBe("Claude Code 2.1.220");
		expect(result.configPath).toBe(join(home, ".claude/settings.json"));
		expect(result.identity.map((entry) => entry.name)).toEqual(["SOUL.md", "AGENTS.md"]);
		expect(result.memory.map((entry) => entry.name)).toEqual(["MEMORY.md", "USER.md"]);
		expect(result.memory.every((entry) => entry.chars > 0 && entry.path.startsWith(home))).toBe(true);
		expect(result.skills).toMatchObject({ total: 2, bundled: 1, agentAuthored: 1 });
	});

	it("invariant_missing_runtime_evidence_stays_unknown", () => {
		const home = fixtureHome();
		file(home, ".agent-machines/SOUL.md", "A worker identity does not prove an installed runtime.");
		const result = probe(home);
		expect(result.detectedAgent).toBe("unknown");
		expect(result.agentVersion).toBeNull();
		expect(result.identity).toHaveLength(1);
	});

	it.each([".claude/settings.json", ".codex/config.toml"])(
		"invariant_retained_native_configuration_does_not_prove_runtime_installation: %s",
		(configPath) => {
			const home = fixtureHome();
			file(home, configPath, "");
			expect(probe(home).detectedAgent).toBe("unknown");
		},
	);

	it("invariant_native_and_durable_session_files_are_counted_once", () => {
		const home = fixtureHome();
		file(home, ".local/bin/codex", "#!/bin/sh\necho 'codex-cli 0.118.0'\n", true);
		file(home, ".codex/config.toml", 'sandbox_mode = "workspace-write"\napproval_policy = "on-request"\n');
		file(home, ".agent-machines/sessions/worker.jsonl", "{}");
		file(home, ".codex/sessions/2026/09/session.jsonl", "{}");
		file(home, ".claude/projects/workspace/session.jsonl", "{}");
		const result = probe(home);
		expect(result.detectedAgent).toBe("codex");
		expect(result.agentVersion).toBe("codex-cli 0.118.0");
		expect(result.sandboxMode).toBe("workspace-write");
		expect(result.approvalPolicy).toBe("on-request");
		expect(result.sessions.totalSessions).toBe(3);
	});
});

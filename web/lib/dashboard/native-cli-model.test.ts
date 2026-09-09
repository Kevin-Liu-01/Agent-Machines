import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { agentLaunchCommand, agentOneShotInvocation, agentTerminalLauncherCommand } from "./agent-launch";
import { CONSOLE_LOG, ensureSessionCommand, installAgentLauncherCommand } from "./terminal-session";
import { nativeCliModelFilename, shellArgument, type NativeCliKind } from "./native-cli-model";
import { runWebBootstrap } from "@/lib/bootstrap/runner";
import { BOOTSTRAP_PHASES, DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";
import type { MachineProvider } from "@/lib/providers";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function worker() {
	const root = mkdtempSync(join(tmpdir(), "am-native-model-"));
	roots.push(root);
	const home = join(root, "home");
	const app = join(home, ".agent-machines");
	const bin = join(home, ".npm-global/bin");
	mkdirSync(join(app, "state"), { recursive: true });
	mkdirSync(bin, { recursive: true });
	for (const cli of ["claude", "codex"]) {
		writeFileSync(join(bin, cli), '#!/bin/bash\nif [ "$1" = --help ]; then echo "--bare --print --output-format --verbose --include-partial-messages --dangerously-skip-permissions --model --resume"; exit 0; fi\nprintf "%s\\0" "$@" > "$AM_ARGS_FILE"\n', { mode: 0o755 });
	}
	writeFileSync(join(app, ".agent-env"), `export PATH=${shellArgument(bin)}:"$PATH"\n`);
	const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, AM_ARGS_FILE: join(root, "args"), AM_MARKER: join(root, "injected"), AM_TMUX_STATE: join(root, "tmux"), AM_CRON_PROMPT: "" };
	const run = (command: string) => spawnSync("/bin/bash", ["-c", command], { env, encoding: "utf8", timeout: 10_000 });
	const ok = (command: string) => {
		const result = run(command);
		expect(result.error).toBeUndefined();
		expect(result.status, result.stderr + result.stdout).toBe(0);
	};
	const args = () => readFileSync(env.AM_ARGS_FILE, "utf8").split("\0").slice(0, -1);
	return { root, home, app, bin, env, run, ok, args };
}

const cases: Array<[NativeCliKind, string, string]> = [
	["claude-code", "anthropic/claude-sonnet-4-6", "claude-sonnet-4-6"],
	["codex", "openai/gpt-5.6-sol", "gpt-5.6-sol"],
];

describe("executable native terminal model selection", () => {
	it.each(cases)("passes the explicit normalized %s model as one CLI argument", (kind, requested, expected) => {
		const f = worker();
		f.ok(agentLaunchCommand(kind, requested)!);
		expect(f.args()).toEqual(["--model", expected]);
	});

	it.each(cases)("upgrades existing %s workers using the durable settings model", (kind, requested, expected) => {
		const f = worker();
		writeFileSync(join(f.app, "settings.json"), JSON.stringify({ agentKind: kind, model: requested }));
		f.ok(installAgentLauncherCommand());
		f.ok(agentTerminalLauncherCommand(kind)!);
		expect(f.args()).toEqual(["--model", expected]);
		expect(readFileSync(join(f.app, "state", nativeCliModelFilename(kind)), "utf8")).toBe(`${expected}\n`);
	});

	it.each(cases)("retains an explicit %s model across a relaunch and provider-state migration", (kind, requested, expected) => {
		const source = worker();
		source.ok(installAgentLauncherCommand());
		source.ok(agentTerminalLauncherCommand(kind, requested)!);
		// A paused running terminal is marked running, while its durable files survive.
		writeFileSync(join(source.app, "state/terminal-agent.json"), JSON.stringify({ desiredAgentKind: kind, status: "running" }));
		const target = worker();
		cpSync(join(source.app, "state"), join(target.app, "state"), { recursive: true });
		writeFileSync(join(target.bin, "tmux"), `#!/bin/bash
case "$1" in
  has-session) test -f "$AM_TMUX_STATE" ;;
  new-session) touch "$AM_TMUX_STATE" ;;
  send-keys) /bin/bash -c "$4" ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 });
		target.ok(ensureSessionCommand(100, 30).replaceAll(CONSOLE_LOG, join(target.root, "console.log")));
		expect(target.args()).toEqual(["--model", expected]);
		expect(JSON.parse(readFileSync(join(target.app, "state/terminal-agent.json"), "utf8"))).toMatchObject({ desiredAgentKind: kind, status: "exited" });
	});

	it.each(cases)("also honors the stored %s model in scheduled one-shot work", (kind, _requested, expected) => {
		const f = worker();
		writeFileSync(join(f.app, "state", nativeCliModelFilename(kind)), expected);
		f.env.AM_CRON_PROMPT = 'inspect a file; $(touch "$AM_MARKER")';
		f.ok(agentOneShotInvocation(kind)!);
		expect(f.args()).toEqual(kind === "codex"
			? ["exec", "--model", expected, f.env.AM_CRON_PROMPT]
			: ["--model", expected, "-p", f.env.AM_CRON_PROMPT]);
		expect(existsSync(f.env.AM_MARKER)).toBe(false);
	});

	it("does not execute shell syntax from either the supplied or persisted model", () => {
		const f = worker();
		const model = 'claude-sonnet-4-6\'"; $(touch "$AM_MARKER")';
		f.ok(agentLaunchCommand("claude-code", model)!);
		expect(f.args()).toEqual(["--model", model]);
		f.ok(installAgentLauncherCommand());
		f.ok(agentTerminalLauncherCommand("claude-code", model)!);
		f.ok(agentTerminalLauncherCommand("claude-code")!);
		expect(f.args()).toEqual(["--model", model]);
		expect(existsSync(f.env.AM_MARKER)).toBe(false);
	});

	it.each(cases)("bootstrap persists the normalized %s choice without changing trust or permissions", async (kind, requested, expected) => {
		const f = worker();
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { anthropic: "test-native-key", openai: "test-native-key" };
		const machine: MachineRef = {
			id: "model-test", name: "Model test", providerKind: "e2b", agentKind: kind,
			model: requested, gatewayProfileId: null, apiKey: "worker-bearer",
			spec: config.draftSpec, agentProfileId: null, environmentProfileId: null,
			bootstrapPresetId: null, createdAt: "2026-09-09", apiUrl: null,
			bootstrapState: { phase: "idle", startedAt: null, finishedAt: null, current: null, lastError: null, completed: BOOTSTRAP_PHASES.filter((phase) => phase !== "configure-hermes") },
		};
		const configPath = join(f.home, kind === "claude-code" ? ".claude/settings.json" : ".codex/config.toml");
		mkdirSync(join(configPath, ".."), { recursive: true });
		const priorConfig = kind === "claude-code" ? '{"permissions":{"defaultMode":"default"}}' : 'approval_policy = "on-request"\n';
		writeFileSync(configPath, priorConfig);
		const provider = { kind: "e2b", exec: vi.fn(async (_id: string, command: string) => {
			const result = f.run(command.replaceAll("/home/user", f.home));
			return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status ?? 1 };
		}) } as unknown as MachineProvider;
		await runWebBootstrap({ machine, config, provider, onState: vi.fn() });
		expect(readFileSync(configPath, "utf8")).toBe(priorConfig);
		f.ok(agentLaunchCommand(kind)!);
		expect(f.args()).toEqual(["--model", expected]);
		expect(readFileSync(join(f.app, "state", nativeCliModelFilename(kind)), "utf8")).toBe(`${expected}\n`);
		expect(readFileSync(join(f.app, ".agent-env"), "utf8")).toContain(kind === "claude-code" ? `export ANTHROPIC_MODEL='${expected}'` : `export AM_CODEX_MODEL='${expected}'`);
	});
});

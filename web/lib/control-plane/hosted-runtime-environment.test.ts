import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({ exec: vi.fn(), state: vi.fn() }));
vi.mock("@/lib/providers", () => ({ getProvider: () => ({ exec: mocks.exec, state: mocks.state }) }));
vi.mock("@/lib/storage/workspace-capture", () => ({
	beginWorkspaceCapture: async () => ({ available: false, warnings: [] }),
	finishWorkspaceCapture: async () => ({ artifacts: [], warnings: [] }),
}));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfigById: vi.fn(), setOperationalUserConfigById: vi.fn() }));
import { HostedWorkerRuntimeDriver } from "./hosted-driver";

const roots: string[] = [];
afterEach(() => { vi.clearAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("hosted Hermes execution environment", () => {
	it("uses the installed virtualenv, durable home and configured provider instead of overriding them with native keys", async () => {
		const home = mkdtempSync(join(tmpdir(), "am-hosted-hermes-"));
		roots.push(home);
		const app = join(home, ".agent-machines");
		mkdirSync(join(app, "venv/bin"), { recursive: true });
		writeFileSync(join(app, ".agent-env"), "export LAUNCH_PROFILE=attached\n");
		writeFileSync(join(app, "venv/bin/hermes"), '#!/bin/bash\n[ "$HERMES_HOME" = "$HOME/.agent-machines" ] && [ "$LAUNCH_PROFILE" = attached ] || exit 7\nfor arg in "$@"; do case "$arg" in --provider|-m) exit 8 ;; esac; done\nprintf "configured-runtime-ok\\n"\n', { mode: 0o755 });
		mocks.exec.mockImplementation(async (_id: string, command: string, options: { env?: Record<string, string> }) => {
			const result = spawnSync("/bin/bash", ["-c", command.replaceAll("/home/user", home)], { env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: home, ...options.env }, encoding: "utf8", timeout: 5_000 });
			return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status ?? 1 };
		});
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { anthropic: "native-key-must-not-override-configured-router" };
		config.machines = [{ id: "test-hermes", providerKind: "e2b", agentKind: "hermes", model: "router/model", archived: false } as MachineRef];
		const result = await new HostedWorkerRuntimeDriver("test-user", config).run({ workerId: "test-worker", sandboxId: "test-hermes", sandbox: "e2b", runtime: "hermes" }, "Inspect the workspace", { runKey: "test-run", model: "router/model" });
		expect(result).toMatchObject({ text: "configured-runtime-ok\n", exitCode: 0 });
		expect(mocks.exec.mock.calls[0][2].env).toEqual({});
	});
});

describe("hosted OpenClaw project context", () => {
	it("passes the real project path to tools without moving memory or replacing project instructions", async () => {
		const home = mkdtempSync(join(tmpdir(), "am-hosted-openclaw-")); roots.push(home);
		const bin = join(home, ".agent-machines/pkgs/node_modules/.bin");
		mkdirSync(bin, { recursive: true });
		mkdirSync(join(home, ".openclaw/workspace"), { recursive: true });
		mkdirSync(join(home, "agent-machines"), { recursive: true });
		writeFileSync(join(home, ".openclaw/workspace/AGENTS.md"), "owned-runtime-memory\n");
		writeFileSync(join(home, "agent-machines/AGENTS.md"), "existing-project-instructions\n");
		writeFileSync(join(bin, "openclaw"), `#!${process.execPath}\nconst args=process.argv.slice(2);process.stdout.write(JSON.stringify({text:JSON.stringify({cwd:process.cwd(),message:args[args.indexOf('--message')+1]})}));\n`, { mode: 0o755 });
		mocks.state.mockResolvedValue({ state: "ready", spec: { memoryMib: 2048 } });
		mocks.exec.mockImplementation(async (_id: string, command: string, options: { env?: Record<string, string> }) => {
			const result = spawnSync("/bin/bash", ["-c", command.replaceAll("/home/user", home)], { env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: home, ...options.env }, encoding: "utf8", timeout: 5000 });
			return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status ?? 1 };
		});
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { anthropic: "fixture-key" };
		config.machines = [{ id: "test-openclaw", providerKind: "e2b", agentKind: "openclaw", model: "anthropic/claude-sonnet-4-6", archived: false } as MachineRef];
		const result = await new HostedWorkerRuntimeDriver("tenant", config).run({ workerId: "worker", sandboxId: "test-openclaw", sandbox: "e2b", runtime: "openclaw" }, "Read ./proof.txt", { runKey: "fixture" }) as { text: string };
		const actual = JSON.parse(result.text);
		expect(actual.cwd).toBe(realpathSync(join(home, "agent-machines")));
		// Prompt bytes are base64-encoded before the fixture rewrites shell paths.
		expect(actual.message).toContain('Worker project directory: "/home/user/agent-machines"');
		expect(actual.message).toContain("Read ./proof.txt");
		expect(readFileSync(join(home, ".openclaw/workspace/AGENTS.md"), "utf8")).toBe("owned-runtime-memory\n");
		expect(readFileSync(join(home, "agent-machines/AGENTS.md"), "utf8")).toBe("existing-project-instructions\n");
	});
});

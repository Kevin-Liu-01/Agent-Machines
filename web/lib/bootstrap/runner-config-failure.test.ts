import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MachineProvider } from "@/lib/providers";
import { BOOTSTRAP_PHASES, DEFAULT_USER_CONFIG, type BootstrapState, type MachineRef } from "@/lib/user-config/schema";
import { runWebBootstrap } from "./runner";

describe("configuration failure propagation", () => {
	it.each(["environment-write", "model-write", "installer", "success"] as const)("preserves the actual %s result before rewriting terminal state", async (mode) => {
		const home = mkdtempSync(join(tmpdir(), "am-config-result-"));
		const app = join(home, ".agent-machines");
		const bin = join(app, "pkgs/node_modules/.bin");
		mkdirSync(bin, { recursive: true });
		mkdirSync(join(app, "state"));
		const terminal = join(app, "state/terminal-agent.json");
		const oldTerminal = '{"desiredAgentKind":"codex","status":"running"}\n';
		writeFileSync(terminal, oldTerminal);
		const flags = `${mode === "installer" ? "" : "--bare "}--print --output-format --verbose --include-partial-messages --dangerously-skip-permissions --model --resume`;
		writeFileSync(join(bin, "claude"), `#!/bin/sh\nif [ "$1" = --help ]; then echo '${flags}'; else echo 'Claude Code 2.1.220 fixture'; fi\n`, { mode: 0o755 });
		// An inert package-manager failure proves failed installation cannot be
		// hidden by a later terminal rewrite. No network/package work is allowed.
		writeFileSync(join(bin, "npm"), "#!/bin/sh\necho 'fixture install failed' >&2\nexit 72\n", { mode: 0o755 });
		if (mode === "environment-write") mkdirSync(join(app, ".agent-env"));
		if (mode === "model-write") mkdirSync(join(app, "state/claude-code-model"));
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { anthropic: "fixture-only-key" };
		const machine: MachineRef = {
			id: "configuration-fixture", name: "Configuration fixture", providerKind: "daytona", agentKind: "claude-code",
			model: "claude-sonnet-4-6", apiKey: "fixture-worker-key", apiUrl: null, gatewayProfileId: null,
			spec: config.draftSpec, agentProfileId: null, environmentProfileId: null, bootstrapPresetId: null,
			createdAt: "2026-09-09", bootstrapState: { phase: "idle", current: null, startedAt: null, finishedAt: null,
				lastError: null, completed: BOOTSTRAP_PHASES.filter((phase) => phase !== "configure-hermes") },
		};
		const states: BootstrapState[] = [];
		let configureResult: number | null = null;
		const provider = {
			kind: "daytona",
			async exec(_id: string, command: string) {
				if (!command.includes("--- phase: configure-hermes")) return { stdout: "ok", stderr: "", exitCode: 0 };
				const result = spawnSync("bash", ["-c", command.replaceAll("/home/daytona", home)], {
					env: { ...process.env, HOME: home }, encoding: "utf8", timeout: 15_000,
				});
				configureResult = result.status ?? 1;
				return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: configureResult };
			},
		} as unknown as MachineProvider;
		try {
			const result = runWebBootstrap({ machine, config, provider, onState: async (state) => { states.push(state); } });
			if (mode === "success") {
				await result;
				expect(configureResult).toBe(0);
				expect(JSON.parse(readFileSync(terminal, "utf8")).desiredAgentKind).toBe("claude-code");
				expect(readFileSync(join(app, "state/claude-code-model"), "utf8")).toBe("claude-sonnet-4-6\n");
			} else {
				await expect(result).rejects.toThrow("configure-hermes failed");
				expect(configureResult).not.toBe(0);
				expect(readFileSync(terminal, "utf8")).toBe(oldTerminal);
				expect(states.some((state) => state.phase === "succeeded")).toBe(false);
				expect(states.at(-1)?.phase).toBe("failed");
			}
		} finally { rmSync(home, { recursive: true, force: true }); }
	});
});

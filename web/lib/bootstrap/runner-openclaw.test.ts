import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MachineProvider } from "@/lib/providers";
import { BOOTSTRAP_PHASES, DEFAULT_USER_CONFIG, type BootstrapPhaseId, type MachineRef } from "@/lib/user-config/schema";
import { runWebBootstrap } from "./runner";

describe("OpenClaw bootstrap upgrades incompatible preinstalled CLIs", () => {
	it.each(["fresh-old", "completed-old", "compatible", "failed-install"] as const)("executes the actual %s phase shell without model calls", async (mode) => {
		const home = mkdtempSync(join(tmpdir(), "am-openclaw-bootstrap-"));
		const bin = join(home, ".local/bin");
		mkdirSync(bin, { recursive: true });
		mkdirSync(join(home, ".openclaw"));
		// The Node suitability probe runs in a child sh, not this shell's
		// function namespace. Keep it offline and independent of host versions.
		writeFileSync(join(bin, "node"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		const config = structuredClone(DEFAULT_USER_CONFIG);
		config.aiProviderKeys = { anthropic: "fixture-not-a-key" };
		const phases: BootstrapPhaseId[] = mode === "completed-old" ? [] : ["install-hermes", "configure-hermes"];
		if (mode === "completed-old") writeFileSync(join(home, ".openclaw/.env"), "# existing config\n");
		const machine: MachineRef = { id: "daytona-openclaw-fixture", name: "QA", agentKind: "openclaw", providerKind: "daytona", model: "claude-sonnet-4-6", apiKey: "fixture-token", apiUrl: null, gatewayProfileId: null, agentProfileId: null, environmentProfileId: null, bootstrapPresetId: null, createdAt: "2026-09-09", spec: config.draftSpec, bootstrapState: { phase: "idle", current: null, startedAt: null, finishedAt: null, lastError: null, completed: BOOTSTRAP_PHASES.filter(phase => !phases.includes(phase)) } };
		writeFileSync(join(bin, "openclaw"), `#!/bin/sh
case "$*" in
 *--help)
  echo '--strict-json --merge --local --session-key --message --model --json --provider'
  if [ '${mode}' = compatible ] || [ -f "$HOME/pinned-installed" ]; then echo --batch-file; fi;;
 '--version') echo 'OpenClaw fixture';;
 'config set --batch-file '*)
  if [ '${mode}' != compatible ] && [ ! -f "$HOME/pinned-installed" ]; then echo "error: unknown option '--batch-file'" >&2; exit 1; fi;;
 'config set '*|'models set '*) :;;
 'models auth paste-api-key '*) read -r ignored;;
 *) echo "Unexpected model call" >&2; exit 77;;
esac
`, { mode: 0o755 });
		const prelude = `export HOME='${home}'; export PATH='${bin}':$PATH;
node() { return 0; }
npm() { ${mode === "failed-install" ? "return 42;" : 'touch "$HOME/pinned-installed";'} }
curl() { echo 'Unexpected download' >&2; return 77; }
`;
		const states: string[] = [];
		const exec = vi.fn(async (_id: string, command: string) => {
			const result = spawnSync("bash", ["-c", prelude + command.replaceAll("/home/daytona", home)], { encoding: "utf8", timeout: 15000 });
			return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.status ?? 1 };
		});
		const bootstrap = () => runWebBootstrap({ machine, config, provider: { kind: "daytona", state: async () => ({ state: "ready", spec: { memoryMib: 2048 } }), exec } as unknown as MachineProvider, onState: async state => { states.push(state.phase); } });
		try {
			if (mode === "failed-install") {
				await expect(bootstrap()).rejects.toThrow(/install-hermes failed/);
				expect(states).not.toContain("succeeded");
				expect(existsSync(join(home, ".openclaw/.env"))).toBe(false);
			} else {
				await expect(bootstrap()).resolves.toEqual({ apiUrl: null, apiKey: "fixture-token" });
				expect(existsSync(join(home, "pinned-installed"))).toBe(mode !== "compatible");
				expect(existsSync(join(home, ".openclaw/.env"))).toBe(true);
				expect(states.at(-1)).toBe("succeeded");
			}
		} finally { rmSync(home, { recursive: true, force: true }); }
	});
});

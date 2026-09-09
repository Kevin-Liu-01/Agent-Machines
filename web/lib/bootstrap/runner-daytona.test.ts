import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MachineProvider } from "@/lib/providers";
import { BOOTSTRAP_PHASES, DEFAULT_USER_CONFIG, type BootstrapPhaseId, type MachineRef } from "@/lib/user-config/schema";
import { finalizeGatewayBootstrap, runWebBootstrap } from "./runner";

vi.mock("./gateway-lifecycle", () => ({
	ensureGatewayRunning: vi.fn(async () => { throw new Error("Root/systemd gateway path must not run in Daytona"); }),
	installGatewayUnitCommand: vi.fn(() => "systemctl fixture-forbidden"),
	waitForGatewayUrl: vi.fn(),
}));

function fixture(phases: BootstrapPhaseId[]) {
	const config = structuredClone(DEFAULT_USER_CONFIG);
	config.aiProviderKeys = { anthropic: "fixture-only-not-a-key" };
	const machine: MachineRef = {
		id: "daytona-fixture", name: "Daytona fixture", providerKind: "daytona", agentKind: "claude-code",
		model: "claude-sonnet-4-6", apiKey: "fixture-worker-token", apiUrl: null, gatewayProfileId: null,
		spec: config.draftSpec, agentProfileId: null, environmentProfileId: null,
		bootstrapPresetId: null, createdAt: "2026-09-09",
		bootstrapState: { phase: "idle", current: null, startedAt: null, finishedAt: null, lastError: null,
			completed: BOOTSTRAP_PHASES.filter((phase) => !phases.includes(phase)) },
	};
	return { config, machine };
}

describe("Daytona user-space bootstrap", () => {
	it.each(["missing", "incompatible", "compatible"] as const)("executes user-space bootstrap with a %s preinstalled CLI", async (cliState) => {
		const temporary = mkdtempSync(join(tmpdir(), "am-daytona-bootstrap-"));
		const calls = join(temporary, "calls");
		const selected: BootstrapPhaseId[] = ["system-deps", "install-node", "configure-hermes"];
		const { machine, config } = fixture(selected);
		const executed: string[] = [];
		let phase: BootstrapPhaseId | null = null;
		// Execute the real emitted phase shell with inert package-manager stubs.
		// A direct apt or root installer is recorded and rejected. No network,
		// actual package installation, or write outside the temporary HOME occurs.
		const prelude = `
export HOME='${temporary}'
export AM_FIXTURE_CALLS='${calls}'
sudo() { printf 'sudo %s\\n' "$*" >> "$AM_FIXTURE_CALLS"; AM_FIXTURE_SUDO=1 "$@"; }
apt-get() { if [ "\${AM_FIXTURE_SUDO:-}" != 1 ]; then echo forbidden-direct-apt >> "$AM_FIXTURE_CALLS"; return 77; fi; }
node() { printf 'node %s\\n' "$*" >> "$AM_FIXTURE_CALLS"; echo v22.0.0; }
claude() {
  if [ '${cliState}' = missing ] && [ ! -f "$HOME/cli-installed" ]; then return 1; fi
  if [ "$1" = --help ]; then
    printf '%s\\n' '--print --output-format --verbose --include-partial-messages --dangerously-skip-permissions --model --resume'
    if [ '${cliState}' = compatible ] || [ -f "$HOME/cli-installed" ]; then echo --bare; fi
  else echo 'Claude Code fixture'; fi
}
npm() { printf 'npm %s\\n' "$*" >> "$AM_FIXTURE_CALLS"; touch "$HOME/cli-installed"; }
curl() { echo forbidden-root-installer >> "$AM_FIXTURE_CALLS"; return 77; }
pgrep() { return 1; }
systemctl() { echo forbidden-systemd >> "$AM_FIXTURE_CALLS"; return 77; }
`;
		const exec = vi.fn(async (_id: string, command: string) => {
			if (!command.includes("--- phase:")) return { stdout: "broken", stderr: "", exitCode: 0 };
			expect(selected).toContain(phase);
			executed.push(command);
			const result = spawnSync("bash", ["-c", prelude + command.replaceAll("/home/daytona", temporary)], { encoding: "utf8", timeout: 15_000 });
			return { stdout: result.stdout ?? "", stderr: result.stderr || result.error?.message || "", exitCode: result.status ?? 1 };
		});
		try {
			await runWebBootstrap({ machine, config, provider: { kind: "daytona", exec } as unknown as MachineProvider,
				onState: async (state) => { phase = state.current; } });
			expect(executed).toHaveLength(3);
			const actualCalls = readFileSync(calls, "utf8");
			expect(actualCalls).toContain("sudo apt-get update");
			expect(actualCalls).toContain("sudo apt-get install");
			expect(actualCalls).toContain("node --version");
			if (cliState === "compatible") expect(actualCalls).not.toContain("npm install");
			else expect(actualCalls).toContain(`npm install --prefix ${temporary}/.agent-machines/pkgs --no-fund --no-audit @anthropic-ai/claude-code@2.1.220`);
			expect(actualCalls).not.toContain("forbidden-");
			expect(readFileSync(join(temporary, ".agent-machines/state/claude-code-model"), "utf8")).toBe("claude-sonnet-4-6\n");
		} finally {
			rmSync(temporary, { recursive: true, force: true });
		}
	});

	it("does not enter the systemd gateway repair path for a native Daytona runtime", async () => {
		const { machine, config } = fixture([]);
		const exec = vi.fn();
		await expect(finalizeGatewayBootstrap({ machine, config,
			provider: { kind: "daytona", exec } as unknown as MachineProvider,
			onState: vi.fn(),
		})).resolves.toEqual({ apiUrl: null, apiKey: "fixture-worker-token" });
		expect(exec).not.toHaveBeenCalled();
	});
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openclawHarness } from "./openclaw.js";

const configFlags = "--batch-file --strict-json --merge";
const agentFlags = "--local --session-key --message --model --json";

for (const mode of ["old-config", "old-agent", "old-auth", "failed-help", "compatible", "flag-prefix"] as const) {
	test(`OpenClaw capability probe checks ${mode} CLI without model or configuration writes`, () => {
		const home = mkdtempSync(join(tmpdir(), "am-openclaw-capability-"));
		const bin = join(home, ".agent-machines/pkgs/node_modules/.bin");
		mkdirSync(bin, { recursive: true });
		const configHelp = mode === "old-config" ? "--strict-json" : mode === "flag-prefix" ? configFlags.replace("--batch-file", "--batch-file-suffix") : configFlags;
		const agentHelp = mode === "old-agent" ? agentFlags.replace("--session-key", "") : agentFlags;
		writeFileSync(join(bin, "openclaw"), `#!/bin/sh
case "$*" in
 'config set --help') printf '%s\\n' '${configHelp}';;
 'agent --help') printf '%s\\n' '${agentHelp}';;
 'models auth paste-api-key --help') printf '%s\\n' '${mode === "old-auth" ? "--profile-id" : "--provider"}';;
 *) echo 'Unexpected model/config invocation' >&2; exit 77;;
esac
exit ${mode === "failed-help" ? 1 : 0}
`, { mode: 0o755 });
		try {
			const result = spawnSync("/bin/bash", ["-c", openclawHarness.isInstalledCommand()], { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 5000 });
			assert.equal(result.status, mode === "compatible" ? 0 : 1, result.stderr);
		} finally { rmSync(home, { recursive: true, force: true }); }
	});
}

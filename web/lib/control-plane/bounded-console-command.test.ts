import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { boundedConsoleCommand } from "./bounded-console-command";

const fixtures: string[] = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "am-bounded-command-"));
	fixtures.push(root);
	const bin = join(root, "bin");
	mkdirSync(bin);
	return { root, bin };
}
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

const timeoutBinary = spawnSync("/bin/sh", ["-c", "command -v timeout || command -v gtimeout"], { encoding: "utf8" }).stdout.trim();

describe("bounded guest commands", () => {
	it("invariant_missing_guest_timeout_starts_no_work", () => {
		const { root, bin } = fixture();
		const marker = join(root, "started");
		const result = spawnSync("/bin/bash", ["-c", boundedConsoleCommand(`touch '${marker}'`, 100)], { env: { ...process.env, PATH: bin }, encoding: "utf8" });
		expect(result.status).toBe(127);
		expect(result.stderr).toContain("no work was started");
		expect(existsSync(marker)).toBe(false);
	});

	it("invariant_shell_source_reaches_the_timeout_as_one_argument", () => {
		const { root, bin } = fixture();
		const marker = join(root, "injected");
		// An argument-capturing timeout proves the outer shell cannot evaluate
		// the intended inner command before its process guard takes control.
		writeFileSync(join(bin, "timeout"), '#!/bin/bash\nprintf "%s" "$6"\n', { mode: 0o755 });
		const command = `printf '%s' 'quoted'; $(touch '${marker}')\n# nested source`;
		const result = spawnSync("/bin/bash", ["-c", boundedConsoleCommand(command, 100)], { env: { ...process.env, PATH: bin }, encoding: "utf8" });
		expect(result.status).toBe(0);
		expect(result.stdout).toBe(command);
		expect(existsSync(marker)).toBe(false);
	});

	it.skipIf(!timeoutBinary)("invariant_guest_timeout_terminates_work_before_its_effect", () => {
		const { root, bin } = fixture();
		symlinkSync(timeoutBinary, join(bin, "timeout"));
		const marker = join(root, "finished");
		const result = spawnSync("/bin/bash", ["-c", boundedConsoleCommand(`sleep 2; touch '${marker}'`, 50)], { env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` }, encoding: "utf8", timeout: 1_000 });
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(124);
		expect(existsSync(marker)).toBe(false);
	});
});

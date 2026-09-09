import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginWorkspaceCapture, finishWorkspaceCapture, workspaceCaptureCommand, workspaceCaptureScript, type CaptureLimits } from "./workspace-capture";
import type { MachineProvider } from "@/lib/providers";
import type { MachineRef } from "@/lib/user-config/schema";

const directories: string[] = [];
function fixture() {
	const home = mkdtempSync(path.join(tmpdir(), "am-artifact-capture-"));
	directories.push(home);
	mkdirSync(path.join(home, "agent-machines"));
	mkdirSync(path.join(home, "work"));
	return home;
}
function capture(home: string, phase: "before" | "after", limits?: CaptureLimits) {
	const command = workspaceCaptureCommand({ home, phase, id: "a".repeat(32), runKey: "fixture-run", limits });
	const result = spawnSync("/bin/bash", ["-c", command], { encoding: "utf8", timeout: 15_000 });
	expect(result.status, result.stderr).toBe(0);
	return JSON.parse(result.stdout);
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe.skipIf(process.platform !== "linux")("bounded managed-workspace artifact capture", () => {
	it("captures shell-created and modified files, not unchanged repository files", () => {
		const home = fixture();
		writeFileSync(path.join(home, "agent-machines", "unchanged.txt"), "existing");
		writeFileSync(path.join(home, "agent-machines", "edited.txt"), "before");
		expect(capture(home, "before").ok).toBe(true);
		writeFileSync(path.join(home, "agent-machines", "edited.txt"), "after");
		writeFileSync(path.join(home, "work", "research report.md"), "# Evidence\n");
		const result = capture(home, "after");
		expect(result.ok).toBe(true);
		expect(result.artifacts.map((entry: { name: string }) => entry.name).sort()).toEqual(["edited.txt", "research-report.md"]);
		const artifact = result.artifacts.find((entry: { name: string }) => entry.name === "research-report.md");
		expect(artifact).toMatchObject({ runKey: "fixture-run", sourcePath: path.join(home, "work", "research report.md"), sha256: createHash("sha256").update("# Evidence\n").digest("hex") });
		const stored = path.join(home, ".agent-machines", "artifacts", artifact.id);
		expect(JSON.parse(readFileSync(path.join(stored, "_meta.json"), "utf8"))).toEqual(artifact);
		writeFileSync(artifact.sourcePath, "later edit");
		expect(readFileSync(path.join(stored, artifact.name), "utf8")).toBe("# Evidence\n");
	});

	it("excludes symlinks, credential names, hidden files and dependencies", () => {
		const home = fixture();
		const outside = path.join(home, "private.txt"); writeFileSync(outside, "must not export");
		capture(home, "before");
		for (const name of [".env", "credentials.json", "secret.txt", "private-key.pem"]) writeFileSync(path.join(home, "work", name), "private");
		mkdirSync(path.join(home, "work", "node_modules")); writeFileSync(path.join(home, "work", "node_modules", "package.js"), "dependency");
		symlinkSync(outside, path.join(home, "work", "innocent.txt"));
		symlinkSync(home, path.join(home, "work", "escape-directory"));
		expect(capture(home, "after").artifacts).toEqual([]);
	});

	it("never traverses a symlinked workspace root or broad HOME", () => {
		const home = fixture();
		rmSync(path.join(home, "work"), { recursive: true });
		symlinkSync(home, path.join(home, "work"));
		const before = capture(home, "before");
		expect(before.warnings.length).toBeGreaterThan(0);
		writeFileSync(path.join(home, "outside.txt"), "not a workspace artifact");
		expect(capture(home, "after").artifacts).toEqual([]);
	});

	it("reports incomplete scans and skips oversized files without claiming a complete capture", () => {
		const home = fixture();
		capture(home, "before");
		writeFileSync(path.join(home, "work", "large.txt"), "12345");
		const result = capture(home, "after", { maxFileBytes: 4 });
		expect(result.artifacts).toEqual([]);
		expect(result.warnings.join(" ")).toMatch(/per-file/);
	});

	it("bounds a wide directory while enumerating it, before loading every entry", () => {
		const home = fixture();
		for (let index = 0; index < 5001; index++) mkdirSync(path.join(home, "work", `.hidden-${index}`));
		expect(capture(home, "before").warnings.join(" ")).toMatch(/directory-entry limit/);
	});

	it("does not attribute unobserved existing files when the baseline hit its file-count limit", () => {
		const home = fixture();
		writeFileSync(path.join(home, "work", "a.txt"), "a");
		writeFileSync(path.join(home, "work", "b.txt"), "b");
		expect(capture(home, "before", { maxFiles: 1 }).warnings.join(" ")).toMatch(/file-count/);
		const result = capture(home, "after");
		expect(result.artifacts).toEqual([]);
		expect(result.warnings.join(" ")).toMatch(/pre-run scan was incomplete/);
	});

	it("cannot redirect capture output through a symlinked artifacts directory", () => {
		const home = fixture();
		mkdirSync(path.join(home, ".agent-machines"));
		symlinkSync(path.join(home, "work"), path.join(home, ".agent-machines", "artifacts"));
		expect(capture(home, "before")).toMatchObject({ ok: false, artifacts: [] });
	});

});

describe("capture platform and request boundaries", () => {
	it.skipIf(process.platform === "linux")("fails closed when directory descriptors are unavailable", () => {
		const result = capture(fixture(), "before");
		expect(result).toMatchObject({ ok: false, artifacts: [] });
		expect(result.warnings.join(" ")).toMatch(/Linux directory-descriptor support/);
	});
	it.skipIf(process.platform !== "linux")("executes the provider-portable fixture suite including deterministic parent-directory swaps", () => {
		const fixtureScript = readFileSync(new URL("./__fixtures__/workspace-capture.cjs", import.meta.url), "utf8");
		const { script } = workspaceCaptureScript({ phase: "before", home: "/unused", id: "a".repeat(32), runKey: "unused" });
		const program = `${fixtureScript}\nprocess.stdout.write(JSON.stringify(module.exports(Buffer.from(process.argv[1], 'base64').toString('utf8'))));`;
		const result = spawnSync(process.execPath, ["-e", program, Buffer.from(script).toString("base64")], { encoding: "utf8", timeout: 30_000 });
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout).passed).toBe(8);
	});
	it("does not start any extra provider exec after the run's deadline expires", async () => {
		const exec = vi.fn();
		const provider = { exec } as unknown as MachineProvider;
		const machine = { id: "machine", providerKind: "e2b" } as MachineRef;
		const before = await beginWorkspaceCapture(provider, machine, { runKey: "paid-run", executionDeadlineMs: Date.now() - 1 });
		expect(before.available).toBe(false);
		const after = await finishWorkspaceCapture(provider, machine, { ...before, available: true }, { executionDeadlineMs: Date.now() - 1 });
		expect(after.warnings.join(" ")).toMatch(/deadline/);
		expect(exec).not.toHaveBeenCalled();
	});
});

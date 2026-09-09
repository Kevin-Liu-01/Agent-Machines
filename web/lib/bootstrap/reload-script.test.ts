import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { buildWebReloadScript, managedCheckoutGuard } from "./reload-script";

let temp: string;
beforeEach(() => { temp = mkdtempSync(join(tmpdir(), "am-reload-")); });
afterEach(() => rmSync(temp, { recursive: true, force: true }));
function git(cwd: string, ...args: string[]) {
	return execFileSync("git", ["-c", "user.name=Reload test", "-c", "user.email=reload@example.test", ...args], {
		cwd, encoding: "utf8", stdio: "pipe",
	});
}
function put(root: string, file: string, body: string) {
	const target = join(root, file);
	mkdirSync(join(target, ".."), { recursive: true });
	writeFileSync(target, body);
}

it.skipIf(process.platform !== "linux")("refreshes a shallow managed checkout without touching the Worker workspace or memory", () => {
	const upstream = join(temp, "upstream");
	const home = join(temp, "home with spaces");
	const runtime = join(home, ".agent-machines");
	const checkout = join(runtime, "knowledge-source");
	mkdirSync(upstream); mkdirSync(runtime, { recursive: true });
	git(upstream, "init", "-b", "main");
	put(upstream, "knowledge/skills/base/SKILL.md", "v1");
	put(upstream, "knowledge/MEMORY.md", "repository default");
	git(upstream, "add", "."); git(upstream, "commit", "-m", "initial knowledge");
	git(temp, "clone", "--depth", "1", "--branch", "main", `file://${upstream}`, checkout);
	put(home, "agent-machines/project.txt", "my uncommitted work");
	put(runtime, "MEMORY.md", "my learned context");
	const reload = () => execFileSync("/bin/bash", ["-c", buildWebReloadScript(home, runtime)], {
		env: { ...process.env, HOME: home }, stdio: "pipe",
	});
	reload();
	put(upstream, "knowledge/skills/base/SKILL.md", "v2");
	git(upstream, "add", "."); git(upstream, "commit", "-m", "refresh knowledge");
	reload();
	expect(readFileSync(join(runtime, "skills/base/SKILL.md"), "utf8")).toBe("v2");
	expect(readFileSync(join(runtime, "MEMORY.md"), "utf8")).toBe("my learned context");
	expect(readFileSync(join(home, "agent-machines/project.txt"), "utf8")).toBe("my uncommitted work");
	expect(git(checkout, "rev-parse", "HEAD")).toBe(git(upstream, "rev-parse", "HEAD"));
});

it.each(["runtime", "checkout", "git"])("rejects a symlinked %s before running Git", (kind) => {
	const home = join(temp, "home"), runtime = join(home, ".agent-machines");
	const checkout = join(runtime, "knowledge-source"), outside = join(temp, "outside");
	mkdirSync(outside); mkdirSync(home);
	if (kind === "runtime") symlinkSync(outside, runtime);
	else {
		mkdirSync(runtime);
		if (kind === "checkout") symlinkSync(outside, checkout);
		else { mkdirSync(checkout); symlinkSync(outside, join(checkout, ".git")); }
	}
	const result = spawnSync("/bin/bash", ["-c", buildWebReloadScript(home, runtime)], { encoding: "utf8" });
	expect(result.status).toBe(2);
	expect(result.stderr).toContain("must not be a symlink");
	expect(result.stdout).not.toContain("refresh managed");
});

it("bootstrap seeds the selected persona before refresh, preserving existing memory", () => {
	const source = readFileSync(resolve(process.cwd(), "lib/bootstrap/runner.ts"), "utf8");
	const phase = source.slice(source.indexOf('case "install-git-reload"'), source.indexOf('case "install-cursor-bridge"'));
	expect(phase).toContain("managedCheckoutGuard(p.APP_HOME)");
	expect(phase).toContain("machine.agentKind, { preserveExisting: true }");
	expect(phase.indexOf("...bundleInstallLines")).toBeLessThan(phase.lastIndexOf("`${p.HERMES_HOME}/scripts/reload-from-git.sh`,"));
	expect(managedCheckoutGuard("/home/user/.agent-machines")).not.toContain("/home/user/agent-machines");
});

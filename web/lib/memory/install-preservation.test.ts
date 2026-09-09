import { spawnSync } from "node:child_process";
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { newBundle } from "./bundle";
import { bundleInstallCommand, bundleInstallLines, regenerateMemoryEntrypointsLines } from "./install";

const homes: string[] = [];
function home() {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "am-memory-preserve-")));
	homes.push(root);
	return root;
}
function exec(root: string, command: string, env: Record<string, string> = {}) {
	return spawnSync("/bin/bash", ["-c", command], { env: { ...process.env, HOME: root, ...env }, encoding: "utf8" });
}
const bundle = () => newBundle({ name: "Saved template", docs: { soul: "Saved persona", agentDocs: "Saved rules", memory: "OUTDATED MEMORY", user: "Saved operator" } });
const docs = { "SOUL.md": "Current persona\n", "AGENTS.md": "Run real tests.\n", "MEMORY.md": "New note learned after the template was saved.\n", "USER.md": "" };
function canonical(root: string) {
	mkdirSync(join(root, ".agent-machines"), { recursive: true });
	for (const [file, body] of Object.entries(docs)) writeFileSync(join(root, ".agent-machines", file), body);
}

afterEach(() => { for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("durable memory installation and regeneration (executed shell)", () => {
	it.each(["claude-code", "codex", "openclaw", "hermes"] as const)("preserves existing canonical docs, including intentionally empty ones, during %s repair", (agent) => {
		const root = home();
		canonical(root);
		const result = exec(root, bundleInstallLines(bundle(), agent, { preserveExisting: true }).join(" && "));
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("AM_MEMORY_INSTALLED");
		for (const [file, body] of Object.entries(docs)) expect(readFileSync(join(root, ".agent-machines", file), "utf8")).toBe(body);
		if (agent === "claude-code" || agent === "codex") {
			const entry = agent === "claude-code" ? "CLAUDE.md" : "AGENTS.md";
			const derived = readFileSync(join(root, entry), "utf8");
			expect(derived).toContain(docs["MEMORY.md"].trim());
			expect(derived).not.toContain("OUTDATED MEMORY");
		} else if (agent === "openclaw") {
			for (const [file, body] of Object.entries(docs)) expect(readFileSync(join(root, ".openclaw/workspace", file), "utf8")).toBe(body);
		}
		expect(readdirSync(join(root, ".agent-machines")).sort()).toEqual(Object.keys(docs).sort());
	});

	it("seeds only missing docs while retaining Worker-authored changes", () => {
		const root = home();
		mkdirSync(join(root, ".agent-machines"));
		writeFileSync(join(root, ".agent-machines/MEMORY.md"), "A newer on-Worker note.");
		const result = exec(root, bundleInstallCommand(bundle(), "claude-code", { preserveExisting: true }));
		expect(result.status, result.stderr).toBe(0);
		expect(readFileSync(join(root, ".agent-machines/MEMORY.md"), "utf8")).toBe("A newer on-Worker note.");
		expect(readFileSync(join(root, ".agent-machines/SOUL.md"), "utf8")).toBe("Saved persona");
		expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toContain("A newer on-Worker note.");
	});

	it("explicit Apply Memory intentionally replaces canonical memory by default", () => {
		const root = home();
		canonical(root);
		const result = exec(root, bundleInstallCommand(bundle(), "codex"));
		expect(result.status, result.stderr).toBe(0);
		expect(readFileSync(join(root, ".agent-machines/MEMORY.md"), "utf8")).toBe("OUTDATED MEMORY");
		expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("OUTDATED MEMORY");
	});

	it("regenerates target entrypoints from mutated source memory restored after bootstrap", () => {
		const source = home();
		const target = home();
		canonical(source);
		expect(exec(target, bundleInstallCommand(bundle(), "claude-code")).status).toBe(0);
		writeFileSync(join(source, ".agent-machines/MEMORY.md"), "Source learned this during the latest completed job.\n");
		cpSync(join(source, ".agent-machines"), join(target, ".agent-machines"), { recursive: true });
		const result = exec(target, regenerateMemoryEntrypointsLines("claude-code").join("\n"));
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("AM_MEMORY_ENTRYPOINTS_REGENERATED");
		expect(readFileSync(join(target, ".agent-machines/MEMORY.md"), "utf8")).toBe("Source learned this during the latest completed job.\n");
		expect(readFileSync(join(target, "CLAUDE.md"), "utf8")).toContain("Source learned this during the latest completed job.");
		expect(readFileSync(join(target, ".claude/CLAUDE.md"), "utf8")).not.toContain("OUTDATED MEMORY");
	});

	it("a missing canonical file fails before replacing any entrypoint, including inside an && chain", () => {
		const root = home();
		canonical(root);
		rmSync(join(root, ".agent-machines/MEMORY.md"));
		writeFileSync(join(root, "CLAUDE.md"), "Previous working entrypoint");
		const result = exec(root, `true && ${regenerateMemoryEntrypointsLines("claude-code").join(" && ")} && echo FALSE_SUCCESS`);
		expect(result.status).not.toBe(0);
		expect(result.stdout).not.toContain("REGENERATED");
		expect(result.stdout).not.toContain("FALSE_SUCCESS");
		expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("Previous working entrypoint");
	});

	it("a blocked derived directory fails without overwriting canonical docs or claiming installation", () => {
		const root = home();
		canonical(root);
		writeFileSync(join(root, ".claude"), "Not a directory");
		const result = exec(root, bundleInstallCommand(bundle(), "claude-code", { preserveExisting: true }));
		expect(result.status).not.toBe(0);
		expect(result.stdout).not.toContain("AM_MEMORY_INSTALLED");
		expect(readFileSync(join(root, ".agent-machines/MEMORY.md"), "utf8")).toBe(docs["MEMORY.md"]);
		expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
		expect(readdirSync(join(root, ".agent-machines")).sort()).toEqual(Object.keys(docs).sort());
	});

	it.each([".agent-machines", ".agent-machines/MEMORY.md", ".claude", ".claude/CLAUDE.md", "CLAUDE.md", ".openclaw", ".openclaw/workspace"])("rejects a symlink at %s without reading or altering its external target", (location) => {
		const root = home();
		const outside = home();
		canonical(root);
		canonical(outside);
		writeFileSync(join(outside, "protected.md"), "PRIVATE OUTSIDE CONTENT");
		writeFileSync(join(outside, "CLAUDE.md"), "OUTSIDE ENTRYPOINT");
		mkdirSync(join(root, ".claude"));
		mkdirSync(join(root, ".openclaw/workspace"), { recursive: true });
		const target = join(root, location);
		rmSync(target, { recursive: true, force: true });
		symlinkSync(location.endsWith(".md") ? join(outside, "protected.md") : location === ".agent-machines" ? join(outside, ".agent-machines") : outside, target);
		const agent = location.startsWith(".openclaw") ? "openclaw" : "claude-code";
		for (const command of [regenerateMemoryEntrypointsLines(agent).join(" && "), bundleInstallCommand(bundle(), agent), bundleInstallCommand(bundle(), agent, { preserveExisting: true })]) {
			const result = exec(root, command);
			expect(result.status, result.stderr).not.toBe(0);
			expect(result.stdout).not.toContain("AM_MEMORY_");
			expect(readFileSync(join(outside, "protected.md"), "utf8")).toBe("PRIVATE OUTSIDE CONTENT");
			expect(readFileSync(join(outside, "CLAUDE.md"), "utf8")).toBe("OUTSIDE ENTRYPOINT");
			for (const [name, body] of Object.entries(docs)) expect(readFileSync(join(outside, ".agent-machines", name), "utf8")).toBe(body);
		}
	});

	it("rejects a symlinked HOME and hard-linked canonical files", () => {
		const root = home();
		const outside = home();
		canonical(root);
		symlinkSync(root, join(outside, "home-link"));
		expect(exec(join(outside, "home-link"), regenerateMemoryEntrypointsLines("hermes").join(" && ")).status).not.toBe(0);
		writeFileSync(join(outside, "private.md"), "Private hard-linked content");
		rmSync(join(root, ".agent-machines/MEMORY.md"));
		linkSync(join(outside, "private.md"), join(root, ".agent-machines/MEMORY.md"));
		expect(exec(root, bundleInstallCommand(bundle(), "claude-code")).status).not.toBe(0);
		expect(readFileSync(join(outside, "private.md"), "utf8")).toBe("Private hard-linked content");
		expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
	});

	it.each(["read-parent", "read-file", "write-parent"])("fails closed during a deterministic %s swap without touching outside files", (race) => {
		const root = home();
		const outside = home();
		const hooks = home();
		canonical(root);
		canonical(outside);
		mkdirSync(join(root, ".claude"));
		writeFileSync(join(root, ".claude/CLAUDE.md"), "Previous runtime entrypoint");
		writeFileSync(join(outside, "CLAUDE.md"), "Private external runtime entrypoint");
		writeFileSync(join(outside, ".agent-machines/MEMORY.md"), "PRIVATE EXTERNAL MEMORY");
		// Inject the race at a real filesystem operation, not a mocked helper.
		// The production command itself is executed unmodified by Python.
		writeFileSync(join(hooks, "sitecustomize.py"), `
import os
original_open = os.open
original_replace = os.replace
fired = False
root, outside, race = os.environ["HOME"], os.environ["AM_TEST_OUTSIDE"], os.environ["AM_TEST_RACE"]
def raced_open(path, flags, *args, **kwargs):
    global fired
    if not fired and path == "MEMORY.md" and kwargs.get("dir_fd") is not None and race in ("read-parent", "read-file"):
        fired = True
        if race == "read-parent":
            os.rename(root + "/.agent-machines", root + "/canonical-original")
            os.symlink(outside + "/.agent-machines", root + "/.agent-machines")
        else:
            os.unlink(root + "/.agent-machines/MEMORY.md")
            os.symlink(outside + "/.agent-machines/MEMORY.md", root + "/.agent-machines/MEMORY.md")
    return original_open(path, flags, *args, **kwargs)
def raced_replace(source, destination, *args, **kwargs):
    global fired
    if not fired and destination == "CLAUDE.md" and kwargs.get("dst_dir_fd") is not None and race == "write-parent":
        fired = True
        os.rename(root + "/.claude", root + "/runtime-original")
        os.symlink(outside, root + "/.claude")
    return original_replace(source, destination, *args, **kwargs)
os.open, os.replace = raced_open, raced_replace
`);
		const result = exec(root, regenerateMemoryEntrypointsLines("claude-code").join(" && "), { PYTHONPATH: hooks, AM_TEST_OUTSIDE: outside, AM_TEST_RACE: race });
		expect(result.status, result.stderr).not.toBe(0);
		expect(result.stdout).not.toContain("AM_MEMORY_ENTRYPOINTS_REGENERATED");
		expect(readFileSync(join(outside, "CLAUDE.md"), "utf8")).toBe("Private external runtime entrypoint");
		expect(readFileSync(join(outside, ".agent-machines/MEMORY.md"), "utf8")).toBe("PRIVATE EXTERNAL MEMORY");
		expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
		const pinnedRuntime = race === "write-parent" ? "runtime-original" : ".claude";
		expect(readdirSync(join(root, pinnedRuntime)).some((file) => file.startsWith(".am-memory-"))).toBe(false);
	});

	it("preserveExisting never overwrites a document authored concurrently with seeding", () => {
		const root = home();
		const hooks = home();
		writeFileSync(join(hooks, "sitecustomize.py"), `
import os
original_link = os.link
def raced_link(source, destination, *args, **kwargs):
    if destination == "MEMORY.md":
        with open(os.environ["HOME"] + "/.agent-machines/MEMORY.md", "w") as stream:
            stream.write("Concurrent Worker-authored memory")
    return original_link(source, destination, *args, **kwargs)
os.link = raced_link
`);
		const result = exec(root, bundleInstallCommand(bundle(), "claude-code", { preserveExisting: true }), { PYTHONPATH: hooks });
		expect(result.status, result.stderr).toBe(0);
		expect(readFileSync(join(root, ".agent-machines/MEMORY.md"), "utf8")).toBe("Concurrent Worker-authored memory");
		expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toContain("Concurrent Worker-authored memory");
	});

	it("bounds canonical reads and rejects special files without blocking", () => {
		const root = home();
		canonical(root);
		writeFileSync(join(root, ".agent-machines/MEMORY.md"), "x".repeat(4 * 1024 * 1024 + 1));
		expect(exec(root, regenerateMemoryEntrypointsLines("claude-code").join(" && ")).status).not.toBe(0);
		rmSync(join(root, ".agent-machines/MEMORY.md"));
		expect(spawnSync("mkfifo", [join(root, ".agent-machines/MEMORY.md")]).status).toBe(0);
		expect(exec(root, regenerateMemoryEntrypointsLines("claude-code").join(" && ")).status).not.toBe(0);
		expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
	});
});

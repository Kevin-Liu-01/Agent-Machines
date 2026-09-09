import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KNOWLEDGE_SYNC_SCRIPT } from "./knowledge-sync";
import { buildWebReloadScript } from "./reload-script";
let temp: string, source: string, runtime: string;
beforeEach(() => { temp = mkdtempSync(join(tmpdir(), "am-knowledge-test-")); source = join(temp, "source"); runtime = join(temp, "runtime"); mkdirSync(source); mkdirSync(runtime); });
afterEach(() => rmSync(temp, {recursive: true, force: true}));
function put(root: string, relative: string, content: string) { const file = join(root, relative); mkdirSync(join(file, ".."), {recursive: true}); writeFileSync(file, content); }
function sync(prefix = "") { return execFileSync(process.execPath, ["-e", `${prefix}\n${KNOWLEDGE_SYNC_SCRIPT}`, source, runtime], {encoding: "utf8", stdio: "pipe"}); }
describe.skipIf(process.platform !== "linux")("Worker-safe knowledge refresh", () => {
	it("seeds knowledge, then updates only unchanged managed skills", () => {
		put(source, "skills/base/SKILL.md", "version one"); sync();
		put(source, "skills/base/SKILL.md", "version two"); sync();
		expect(readFileSync(join(runtime, "skills/base/SKILL.md"), "utf8")).toBe("version two");
	});
	it("preserves custom skills, modified bundled skills and canonical memory", () => {
		put(source, "skills/base/SKILL.md", "version one"); put(source, "MEMORY.md", "template"); sync();
		put(runtime, "skills/base/SKILL.md", "user revision"); put(runtime, "skills/custom/SKILL.md", "custom work"); put(runtime, "MEMORY.md", "Remember my completed job");
		put(source, "skills/base/SKILL.md", "version two"); put(source, "MEMORY.md", "new template"); sync();
		expect(readFileSync(join(runtime, "skills/base/SKILL.md"), "utf8")).toBe("user revision");
		expect(readFileSync(join(runtime, "skills/custom/SKILL.md"), "utf8")).toBe("custom work");
		expect(readFileSync(join(runtime, "MEMORY.md"), "utf8")).toBe("Remember my completed job");
	});
	it("does not assume ownership of unknown existing skill files", () => {
		put(source, "skills/overlap/SKILL.md", "bundled"); put(runtime, "skills/overlap/SKILL.md", "my skill"); sync();
		expect(readFileSync(join(runtime, "skills/overlap/SKILL.md"), "utf8")).toBe("my skill");
	});
	it("refuses a symlink destination instead of overwriting another file", () => {
		put(source, "MEMORY.md", "template"); put(temp, "outside", "keep"); symlinkSync(join(temp, "outside"), join(runtime, "MEMORY.md"));
		expect(() => sync()).toThrow(/refuses symlink/);
		expect(readFileSync(join(temp, "outside"), "utf8")).toBe("keep");
	});
	it("invariant_dangling_symlink_is_rejected_before_an_external_file_can_be_created", () => {
		put(source, "MEMORY.md", "template");
		symlinkSync(join(temp, "outside"), join(runtime, "MEMORY.md"));
		expect(() => sync()).toThrow(/refuses symlink/);
		expect(existsSync(join(temp, "outside"))).toBe(false);
	});
	it("invariant_files_created_during_sync_are_not_overwritten", () => {
		put(source, "MEMORY.md", "template");
		const prefix = `const afs=require('node:fs'), originalLink=afs.linkSync;
			afs.linkSync=function(from,to){if(String(to).endsWith('/MEMORY.md'))afs.writeFileSync(to,'created by Worker');return originalLink.call(this,from,to);};`;
		sync(prefix);
		expect(readFileSync(join(runtime, "MEMORY.md"), "utf8")).toBe("created by Worker");
	});
	it("invariant_parent_directory_swap_cannot_redirect_an_update_outside_runtime", () => {
		put(source, "skills/base/SKILL.md", "first"); sync();
		put(source, "skills/base/SKILL.md", "second"); put(temp, "outside/SKILL.md", "keep");
		const folder = join(runtime, "skills/base");
		const prefix = `const afs=require('node:fs'), originalRename=afs.renameSync;let swapped=false;
			afs.renameSync=function(from,to){if(!swapped && String(to).endsWith('/SKILL.md')){swapped=true;originalRename(${JSON.stringify(folder)},${JSON.stringify(folder + "-old")});afs.symlinkSync(${JSON.stringify(join(temp, "outside"))},${JSON.stringify(folder)});}return originalRename.call(this,from,to);};`;
		expect(() => sync(prefix)).toThrow(/refuses symlink|changed during sync/);
		expect(readFileSync(join(temp, "outside/SKILL.md"), "utf8")).toBe("keep");
	});
	it("invariant_modified_managed_files_win_a_detected_commit_race", () => {
		put(source, "skills/base/SKILL.md", "first"); sync();
		put(source, "skills/base/SKILL.md", "second");
		const destination = join(runtime, "skills/base/SKILL.md");
		const prefix = `const afs=require('node:fs'), originalFsync=afs.fsyncSync;let modified=false;
			afs.fsyncSync=function(fd){if(!modified){modified=true;afs.writeFileSync(${JSON.stringify(destination)},'Worker revision');}return originalFsync.call(this,fd);};`;
		expect(() => sync(prefix)).toThrow(/changed before commit/);
		expect(readFileSync(destination, "utf8")).toBe("Worker revision");
	});
	it("invariant_manifest_keys_and_hashes_are_validated_before_installing_files", () => {
		put(source, "skills/base/SKILL.md", "first");
		for (const body of ['[]', '{"__proto__":"' + "a".repeat(64) + '"}', JSON.stringify({ "skills/../MEMORY.md": "a".repeat(64) }), JSON.stringify({ "skills/base/SKILL.md": { hash: "a".repeat(64) } })]) {
			put(runtime, ".knowledge-manifest.json", body);
			expect(() => sync()).toThrow(/Invalid knowledge ownership manifest/);
			expect(existsSync(join(runtime, "skills/base/SKILL.md"))).toBe(false);
		}
	});
	it("invariant_oversized_worker_files_are_preserved_without_buffering_them", () => {
		put(source, "skills/base/SKILL.md", "template");
		put(runtime, "skills/base/SKILL.md", "x".repeat(1024 * 1024 + 1));
		expect(sync("require('node:fs').readSync=function(){throw new Error('unexpected read');};")).toMatch(/Oversized knowledge files were preserved/);
		expect(readFileSync(join(runtime, "skills/base/SKILL.md"), "utf8").length).toBe(1024 * 1024 + 1);
	});
	it("invariant_manifest_and_growing_source_reads_have_hard_byte_limits", () => {
		put(runtime, ".knowledge-manifest.json", "x".repeat(512 * 1024 + 1));
		expect(() => sync()).toThrow(/byte limit/);
		rmSync(join(runtime, ".knowledge-manifest.json"));
		put(source, "skills/base/SKILL.md", "short");
		const prefix = `const afs=require('node:fs');let bytesRead=0;
			afs.readSync=function(fd,buffer,offset,length){bytesRead+=length;if(bytesRead>1024*1024+1)throw new Error('unbounded read');buffer.fill(120);return length;};`;
		expect(() => sync(prefix)).toThrow(/byte limit/);
		expect(existsSync(join(runtime, "skills/base/SKILL.md"))).toBe(false);
	});
	it("invariant_deep_or_excessive_knowledge_trees_report_bounded_coverage", () => {
		put(source, `skills/${"nested/".repeat(14)}SKILL.md`, "deep");
		expect(sync()).toMatch(/file\/depth limit reached/);
		for (let index = 0; index < 2001; index++) put(source, `skills/item-${index}.md`, "item");
		expect(sync()).toMatch(/file\/depth limit reached/);
		expect(Object.keys(JSON.parse(readFileSync(join(runtime, ".knowledge-manifest.json"), "utf8"))).length <= 2000).toBe(true);
	});
});

it("keeps reload and bootstrap out of the user's Git checkout", () => {
		const reload = buildWebReloadScript("/home/user", "/home/user/.agent-machines");
		expect(reload).toContain(".agent-machines/knowledge-source");
		expect(reload).not.toMatch(/reset --hard|rsync.*--delete|rm -rf|\/home\/user\/agent-machines/);
		const runner = readFileSync(resolve(process.cwd(), "lib/bootstrap/runner.ts"), "utf8");
		expect(runner).not.toContain("git reset --hard");
		expect(runner).not.toContain("rm -rf ${repoDir}");
});

it.skipIf(process.platform === "linux")("invariant_unsupported_platform_fails_closed", () => {
	expect(() => sync()).toThrow(/requires a Linux Worker/);
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artifactInventoryScript } from "./artifact-inventory";

let fixture: string;
let root: string;
beforeEach(() => { fixture = mkdtempSync(join(tmpdir(), "am-artifact-test-")); root = join(fixture, ".agent-machines"); });
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
function put(relative: string, content: string) {
	const file = join(root, "artifacts", relative);
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, content);
}
function run(action: "list" | "read" | "delete", id?: string, prefix = "") {
	const { script, encodedArgs } = artifactInventoryScript({ root, action, id });
	return JSON.parse(execFileSync(process.execPath, ["-e", `${prefix}\n${script}`, encodedArgs], { encoding: "utf8", stdio: "pipe", maxBuffer: 16 * 1024 * 1024 }));
}
function uploaded(id: string, text: string) {
	put(`${id}/proof.txt`, text);
	put(`${id}/_meta.json`, JSON.stringify({ id, name: "proof.txt", mime: "text/plain", bytes: 9999, chatId: null, createdAt: "2026-09-09T01:00:00Z", runKey: "managed-run", sourcePath: "~/work/proof.txt" }));
}

// /dev/fd on macOS cannot address pinned directories; never weaken the jail.
describe.skipIf(process.platform !== "linux")("on-machine artifact inventory", () => {
	it("treats a missing exports directory as an empty inventory", () => {
		expect(run("list")).toEqual({ artifacts: [], warnings: [] });
	});
	it("discovers native files and immutable snapshots even when the upload index is stale", () => {
		uploaded("run-one", "first"); uploaded("run-two", "second");
		put("_index.json", "[]"); put("briefings/monday.md", "A sourced briefing");
		const { artifacts, warnings } = run("list");
		expect(warnings).toEqual([]);
		expect(artifacts).toHaveLength(3);
		expect(artifacts.find((a: { id: string }) => a.id === "run-one")).toMatchObject({ bytes: 5, runKey: "managed-run" });
		const raw = artifacts.find((a: { name: string }) => a.name === "briefings/monday.md");
		expect(raw.id).toMatch(/^export-[a-f0-9]{64}$/);
		expect(Buffer.from(run("read", raw.id).body, "base64").toString()).toBe("A sourced briefing");
	});
	it("preserves arbitrary text bytes, including trailing newlines", () => {
		uploaded("bytes", "\u0000__MISSING__\n");
		expect(Buffer.from(run("read", "bytes").body, "base64").toString()).toBe("\u0000__MISSING__\n");
	});
	it("does not reveal dotfiles, internal metadata, symlink files or symlink folders", () => {
		put(".env", "secret"); put("_index.json", "secret");
		writeFileSync(join(fixture, "credential"), "secret");
		symlinkSync(join(fixture, "credential"), join(root, "artifacts", "linked-file"));
		symlinkSync(fixture, join(root, "artifacts", "linked-dir"));
		expect(run("list").artifacts).toEqual([]);
	});
	it("rejects forged IDs and metadata that reference another artifact", () => {
		uploaded("first", "keep");
		put("forged/_meta.json", JSON.stringify({ id: "first", name: "proof.txt", mime: "text/plain", createdAt: "2026-09-09" }));
		expect(run("list").warnings).toHaveLength(1);
		expect(run("read", "../../credential")).toEqual({ found: false });
		expect(run("delete", "first/../forged")).toEqual({ found: false });
		expect(readFileSync(join(root, "artifacts/first/proof.txt"), "utf8")).toBe("keep");
	});
	it("deletes only the requested raw export or immutable snapshot", () => {
		uploaded("one", "first"); uploaded("two", "second"); put("direct.txt", "direct");
		const raw = run("list").artifacts.find((a: { name: string }) => a.name === "direct.txt");
		expect(run("delete", raw.id)).toEqual({ found: true });
		expect(existsSync(join(root, "artifacts/direct.txt"))).toBe(false);
		run("delete", "one");
		expect(run("list").artifacts.map((a: { id: string }) => a.id)).toEqual(["two"]);
	});
	it("reports invalid metadata without exposing its contents", () => {
		put("broken/_meta.json", "{secret");
		expect(run("list")).toEqual({ artifacts: [], warnings: ["An artifact has missing or invalid metadata and could not be listed."] });
	});
	it("bounds browser downloads instead of returning truncated data", () => {
		put("large.txt", "x".repeat(8 * 1024 * 1024 + 1));
		const [file] = run("list").artifacts;
		expect(file.bytes).toBe(8 * 1024 * 1024 + 1);
		expect(() => run("read", file.id)).toThrow(/8 MiB browser download limit/);
	});
	it("invariant_parent_directory_swap_cannot_redirect_a_download", () => {
		uploaded("one", "authorized bytes");
		const outside = join(fixture, "outside");
		mkdirSync(outside); writeFileSync(join(outside, "proof.txt"), "outside bytes");
		const original = join(root, "artifacts", "one");
		const prefix = `const afs=require('node:fs'), originalOpen=afs.openSync; let swapped=false;
			afs.openSync=function(file,flags){if(!swapped && String(file).endsWith('/proof.txt')){swapped=true;afs.renameSync(${JSON.stringify(original)},${JSON.stringify(original + "-old")});afs.symlinkSync(${JSON.stringify(outside)},${JSON.stringify(original)});}return originalOpen.call(this,file,flags);};`;
		expect(Buffer.from(run("read", "one", prefix).body, "base64").toString()).toBe("authorized bytes");
	});
	it("invariant_parent_directory_swap_cannot_delete_external_files", () => {
		uploaded("one", "authorized bytes");
		const outside = join(fixture, "outside");
		mkdirSync(outside); writeFileSync(join(outside, "proof.txt"), "outside bytes");
		const original = join(root, "artifacts", "one");
		const prefix = `const afs=require('node:fs'), originalUnlink=afs.unlinkSync; let swapped=false;
			afs.unlinkSync=function(file){if(!swapped && String(file).endsWith('/proof.txt')){swapped=true;afs.renameSync(${JSON.stringify(original)},${JSON.stringify(original + "-old")});afs.symlinkSync(${JSON.stringify(outside)},${JSON.stringify(original)});}return originalUnlink.call(this,file);};`;
		expect(() => run("delete", "one", prefix)).toThrow(/changed during deletion/);
		expect(readFileSync(join(outside, "proof.txt"), "utf8")).toBe("outside bytes");
	});
	it("invariant_metadata_cannot_inject_objects_into_browser_fields", () => {
		uploaded("one", "authorized bytes");
		put("one/_meta.json", JSON.stringify({ id: "one", name: "proof.txt", mime: "text/plain", createdAt: "2026-09-09", sourcePath: { unsafe: true }, chatId: {}, runKey: ["unsafe"], sha256: "not-a-hash", unexpected: "not forwarded" }));
		expect(run("list").artifacts[0]).toEqual({ id: "one", name: "proof.txt", mime: "text/plain", createdAt: "2026-09-09T00:00:00.000Z", chatId: null, bytes: 16 });
	});
	it("invariant_valid_capture_provenance_survives_metadata_validation", () => {
		uploaded("one", "authorized bytes");
		put("one/_meta.json", JSON.stringify({ id: "one", name: "proof.txt", mime: "text/plain", createdAt: "2026-09-09", sourcePath: "~/work/proof.txt", runKey: "run-one", sha256: "a".repeat(64), chatId: "chat-one" }));
		expect(run("list").artifacts[0]).toMatchObject({ sourcePath: "~/work/proof.txt", runKey: "run-one", sha256: "a".repeat(64), chatId: "chat-one" });
	});
	it("invariant_nonstring_dates_are_rejected_without_breaking_other_artifacts", () => {
		uploaded("one", "one"); uploaded("two", "two");
		put("one/_meta.json", JSON.stringify({ id: "one", name: "proof.txt", mime: "text/plain", createdAt: 2026 }));
		expect(run("list").artifacts.map((ref: { id: string }) => ref.id)).toEqual(["two"]);
		expect(run("list").warnings).toHaveLength(1);
	});
	it("invariant_growing_file_is_read_with_a_hard_byte_budget", () => {
		put("growing.txt", "start");
		const [file] = run("list").artifacts;
		const prefix = `const afs=require('node:fs'); let bytesRead=0;
			afs.readSync=function(fd,buffer,offset,length,position){bytesRead+=length;if(bytesRead>8*1024*1024+1)throw new Error('unbounded read');buffer.fill(120);return length;};`;
		expect(() => run("read", file.id, prefix)).toThrow(/exceeds the browser download limit/);
	});
	it("invariant_inventory_quota_is_explicit_and_deletion_checks_it_before_removal", () => {
		uploaded("one", "keep");
		for (let index = 0; index < 2001; index++) put(`one/item-${index}.txt`, "x");
		expect(() => run("delete", "one")).toThrow(/safe inventory limit/);
		expect(readFileSync(join(root, "artifacts/one/proof.txt"), "utf8")).toBe("keep");
		for (let index = 0; index < 2001; index++) put(`raw-${index}.txt`, "x");
		const result = run("list");
		expect(result.artifacts.length <= 2000).toBe(true);
		expect(result.warnings).toEqual(["Only the first 2,000 artifact entries are listed."]);
	});
});

it.skipIf(process.platform === "linux")("invariant_unsupported_platform_fails_closed_instead_of_weakening_the_jail", () => {
	expect(() => run("list")).toThrow(/require a Linux Worker/);
});

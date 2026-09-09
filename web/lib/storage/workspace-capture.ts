import { createHash, randomUUID } from "node:crypto";
import type { MachineProvider } from "@/lib/providers";
import type { MachineRef } from "@/lib/user-config/schema";
import { homeFor } from "./machine-paths";

export type CapturedWorkspaceArtifact = {
	id: string; name: string; mime: string; bytes: number; chatId: null; createdAt: string;
	sourcePath: string; runKey: string; sha256: string;
};
export type WorkspaceCapture = { id: string; runKey: string; available: boolean; warnings: string[] };
export type WorkspaceCaptureResult = { artifacts: CapturedWorkspaceArtifact[]; warnings: string[] };
export type CaptureLimits = { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number; maxDepth?: number; maxDurationMs?: number };
type CaptureInput = { phase: "before" | "after"; home: string; id: string; runKey: string; limits?: CaptureLimits };

// The same dependency-free program runs in provider exec and executable local
// fixtures. Its only roots are the two documented working directories, never
// HOME itself. Existing artifacts, credentials, hidden files and dependencies
// are not inputs. Bounds are enforced in the guest as well as on the RPC.
const CAPTURE_SCRIPT = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const input = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));
const warnings = [];
const artifacts = [];
const warning = (message) => { if (!warnings.includes(message) && warnings.length < 20) warnings.push(message); };
const fail = (message) => { const error = new Error(message); error.captureSafe = true; throw error; };
const sha = (body) => crypto.createHash("sha256").update(body).digest("hex");
const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "artifact";
const limits = { maxFiles: 1000, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024, maxDepth: 12, maxDurationMs: 5000, ...input.limits };
const started = Date.now();
const budget = () => { if (Date.now() - started > limits.maxDurationMs) fail("Artifact scan reached its time limit; collection is incomplete."); };
const skippedNames = new Set(["node_modules", "vendor", "venv", "__pycache__", "dist", "build", "coverage", "target"]);
const excluded = (name) => name.startsWith(".") || skippedNames.has(name) || /(?:secret|credential|password|private[-_]?key|access[-_]?token|api[-_]?key)/i.test(name) || /\.(?:pem|key|p12|pfx|keystore)$/i.test(name);
const directoryFlags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const at = (parent, name) => "/proc/self/fd/" + parent + (name ? "/" + name : "");
function openRoot(root) {
  let fd = fs.openSync("/", directoryFlags);
  try {
    for (const name of root.split("/").filter(Boolean)) {
      if (name === "." || name === "..") fail("Invalid artifact directory component.");
      const child = fs.openSync(at(fd, name), directoryFlags);
      fs.closeSync(fd); fd = child;
    }
    return fd;
  } catch (error) { fs.closeSync(fd); throw error; }
}
function directoryAt(parent, name, create = false) {
  if (create) { try { fs.mkdirSync(at(parent, name), { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; } }
  return fs.openSync(at(parent, name), directoryFlags);
}
function assertLinkedDirectory(parent, name, fd) {
  const current = directoryAt(parent, name);
  try {
    const a = fs.fstatSync(current), b = fs.fstatSync(fd);
    if (a.dev !== b.dev || a.ino !== b.ino) fail("An artifact directory changed during capture; collection is incomplete.");
  } finally { fs.closeSync(current); }
}
function readRegular(parent, name, byteLimit = limits.maxFileBytes) {
  const fd = fs.openSync(at(parent, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink > 1 || before.size > byteLimit) return null;
    const chunks = []; let total = 0;
    while (total <= byteLimit) {
      budget();
      const chunk = Buffer.alloc(Math.min(65536, byteLimit + 1 - total));
      const read = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!read) break;
      total += read; chunks.push(chunk.subarray(0, read));
    }
    const body = Buffer.concat(chunks);
    const after = fs.fstatSync(fd);
    if (body.length > byteLimit || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail("Workspace file changed during artifact capture.");
    return body;
  } finally { fs.closeSync(fd); }
}
function scan(homeFd, includeBodies) {
  const files = {};
  let count = 0;
  let total = 0;
  let entries = 0;
  function walk(dirFd, sourceDir, depth) {
    budget();
    if (depth > limits.maxDepth) { warning("Artifact scan reached its directory-depth limit."); return; }
    const listing = fs.opendirSync(at(dirFd));
    const children = [];
    try {
      for (let entry; (entry = listing.readSync());) {
        budget();
        if (++entries > 5000) fail("Artifact scan reached its directory-entry limit.");
        children.push(entry);
      }
    } finally { listing.closeSync(); }
    for (const entry of children.sort((a, b) => a.name.localeCompare(b.name))) {
      budget();
      if (excluded(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(sourceDir, entry.name);
      if (entry.isDirectory()) {
        let child;
        try { child = directoryAt(dirFd, entry.name); walk(child, file, depth + 1); }
        finally { if (child !== undefined) fs.closeSync(child); }
        continue;
      }
      if (!entry.isFile()) continue;
      if (++count > limits.maxFiles) fail("Artifact scan reached its file-count limit.");
      const info = fs.lstatSync(at(dirFd, entry.name));
      if (info.isSymbolicLink() || info.nlink > 1) continue;
      if (info.size > limits.maxFileBytes) { warning("Files exceeding the per-file artifact limit were skipped."); continue; }
      try {
        const body = readRegular(dirFd, entry.name);
        if (body) {
          total += body.length;
          if (total > limits.maxTotalBytes) fail("Artifact scan reached its total-byte limit.");
          files[file] = { sha256: sha(body), bytes: body.length, ...(includeBodies ? { body } : {}) };
        }
      } catch (error) { if (error.captureSafe) throw error; warning("Some workspace files could not be read safely; collection is incomplete."); }
    }
  }
  for (const name of ["agent-machines", "work"]) {
    let rootFd;
    try { rootFd = directoryAt(homeFd, name); walk(rootFd, path.join(input.home, name), 0); }
    catch (error) { if (error.code !== "ENOENT") warning(error.captureSafe ? error.message : "Workspace scanning failed; collection is incomplete."); }
    finally { if (rootFd !== undefined) fs.closeSync(rootFd); }
  }
  return { files, complete: warnings.length === 0 };
}
function mime(name) {
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf", ".json": "application/json", ".csv": "text/csv", ".md": "text/markdown", ".txt": "text/plain", ".svg": "image/svg+xml", ".html": "text/html" })[path.extname(name).toLowerCase()] || "application/octet-stream";
}
const held = [];
try {
  if (process.platform !== "linux") fail("Safe artifact capture requires Linux directory-descriptor support; collection was skipped.");
  if (!path.isAbsolute(input.home) || !/^[a-f0-9]{32}$/.test(input.id)) fail("Invalid workspace capture scope.");
  const homeFd = openRoot(input.home); held.push(homeFd);
  const appFd = directoryAt(homeFd, ".agent-machines", true); held.push(appFd);
  const destinationFd = directoryAt(appFd, "artifacts", true); held.push(destinationFd);
  const stateFd = directoryAt(destinationFd, ".capture", true); held.push(stateFd);
  const baselineName = input.id + ".json";
  if (input.phase === "before") {
    const snapshot = scan(homeFd, false);
    // One baseline per paid run attempt; incomplete baselines are explicit.
    fs.writeFileSync(at(stateFd, baselineName), JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
    process.stdout.write(JSON.stringify({ ok: true, artifacts, warnings }));
  } else {
    const baseline = readRegular(stateFd, baselineName, 2 * 1024 * 1024);
    if (!baseline) fail("The pre-run artifact baseline could not be read safely.");
    const before = JSON.parse(baseline.toString("utf8"));
    const current = scan(homeFd, true);
    if (!before.complete) warning("The pre-run scan was incomplete; only previously observed files can be attributed safely.");
    for (const [sourcePath, info] of Object.entries(current.files)) {
      budget();
      if (before.files[sourcePath]?.sha256 === info.sha256 || (!before.complete && !before.files[sourcePath])) continue;
      // These bytes came from a pinned descriptor during the bounded scan.
      // Never reopen sourcePath: an unmanaged process may have swapped its parent.
      const body = info.body;
      const id = "run-" + sha(input.runKey + "\n" + sourcePath + "\n" + info.sha256).slice(0, 32);
      const basename = safeName(path.basename(sourcePath));
      const name = basename === "_meta.json" ? "artifact-_meta.json" : basename;
      const ref = { id, name, mime: mime(name), bytes: body.length, chatId: null, createdAt: new Date().toISOString(), sourcePath, runKey: input.runKey, sha256: info.sha256 };
      let created = false;
      try { fs.mkdirSync(at(destinationFd, id), { mode: 0o700 }); created = true; }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      const finalFd = directoryAt(destinationFd, id);
      try {
        if (!created) {
          const meta = readRegular(finalFd, "_meta.json", 16 * 1024);
          const stored = readRegular(finalFd, name);
          if (!meta || !stored) fail("Existing artifact contents could not be verified.");
          const prior = JSON.parse(meta.toString("utf8"));
          if (prior.id !== id || prior.name !== name || sha(stored) !== ref.sha256 || prior.sha256 !== ref.sha256 || prior.sourcePath !== sourcePath || prior.runKey !== input.runKey) fail("An immutable artifact already exists with conflicting provenance.");
          artifacts.push(ref); continue;
        }
        fs.writeFileSync(at(finalFd, name), body, { flag: "wx", mode: 0o600 });
        // Publishing metadata last makes only a complete immutable copy visible.
        fs.writeFileSync(at(finalFd, "_meta.json"), JSON.stringify(ref), { flag: "wx", mode: 0o600 });
        assertLinkedDirectory(destinationFd, id, finalFd);
        artifacts.push(ref);
      } finally { fs.closeSync(finalFd); }
    }
    fs.unlinkSync(at(stateFd, baselineName));
    process.stdout.write(JSON.stringify({ ok: true, artifacts, warnings }));
  }
} catch (error) {
  warning(error.captureSafe ? error.message : "Artifact collection failed; no paid work was retried.");
  process.stdout.write(JSON.stringify({ ok: false, artifacts, warnings }));
} finally { for (const fd of held.reverse()) fs.closeSync(fd); }
`;

function quote(value: string): string { return `'${value.replace(/'/g, `'"'"'`)}'`; }

/** Public executable seam: production and filesystem fixtures run identical code. */
export function workspaceCaptureScript(input: CaptureInput): { script: string; encodedArgs: string } {
	return { script: CAPTURE_SCRIPT, encodedArgs: Buffer.from(JSON.stringify(input)).toString("base64") };
}

export function workspaceCaptureCommand(input: CaptureInput): string {
	const { script, encodedArgs } = workspaceCaptureScript(input);
	return `export PATH=${quote(`${input.home}/.agent-machines/node/bin`)}:$PATH; node -e ${quote(script)} ${quote(encodedArgs)}`;
}

async function invoke(provider: MachineProvider, machine: MachineRef, input: CaptureInput, executionDeadlineMs?: number): Promise<WorkspaceCaptureResult & { ok: boolean }> {
	const remaining = executionDeadlineMs === undefined ? 15_000 : Math.min(15_000, executionDeadlineMs - Date.now() - 5_000);
	if (!Number.isFinite(remaining) || remaining < 1500) return { ok: false, artifacts: [], warnings: ["Artifact collection skipped because the request execution deadline was exhausted."] };
	try {
		const result = await provider.exec(machine.id, workspaceCaptureCommand({ ...input, limits: { maxDurationMs: Math.min(5000, remaining - 1000) } }), { timeoutMs: remaining });
		if (result.exitCode !== 0) throw new Error("Artifact collection process failed.");
		const parsed = JSON.parse(result.stdout) as WorkspaceCaptureResult & { ok: boolean };
		if (!Array.isArray(parsed.artifacts) || !Array.isArray(parsed.warnings)) throw new Error("Artifact collection returned an invalid response.");
		return parsed;
	} catch { return { ok: false, artifacts: [], warnings: ["Artifact collection failed; no paid work was retried."] }; }
}

export async function beginWorkspaceCapture(provider: MachineProvider, machine: MachineRef, options: { runKey: string; executionDeadlineMs?: number }): Promise<WorkspaceCapture> {
	const id = createHash("sha256").update(`${options.runKey}:${randomUUID()}`).digest("hex").slice(0, 32);
	const result = await invoke(provider, machine, { phase: "before", home: homeFor(machine.providerKind), id, runKey: options.runKey }, options.executionDeadlineMs);
	return { id, runKey: options.runKey, available: result.ok, warnings: result.warnings };
}

export async function finishWorkspaceCapture(provider: MachineProvider, machine: MachineRef, capture: WorkspaceCapture, options: { executionDeadlineMs?: number } = {}): Promise<WorkspaceCaptureResult> {
	if (!capture.available) return { artifacts: [], warnings: capture.warnings };
	const result = await invoke(provider, machine, { phase: "after", home: homeFor(machine.providerKind), id: capture.id, runKey: capture.runKey }, options.executionDeadlineMs);
	return { artifacts: result.artifacts, warnings: [...capture.warnings, ...result.warnings] };
}

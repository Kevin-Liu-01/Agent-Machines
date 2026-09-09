/**
 * Per-agent install adapter: turn a memory bundle into the shell command that
 * writes its persona/memory docs into the files each runtime reads.
 *
 * Canonical owned-memory root is `~/.agent-machines/{SOUL,AGENTS,MEMORY,USER}.md`
 * (what Hermes/OpenClaw read and the reload script syncs). For runtimes that
 * read a different entrypoint we also write a combined doc:
 *   - claude-code -> ~/.claude/CLAUDE.md + ~/CLAUDE.md
 *   - codex       -> ~/.codex/AGENTS.md + ~/AGENTS.md
 *   - openclaw    -> ~/.openclaw/workspace/{SOUL,AGENTS,MEMORY,USER}.md
 *   - hermes      -> the canonical root only
 *
 * Skills/tools/MCPs are not installed or verified by this adapter. A bundle's
 * ability selection drives the separate loadout, not this document install.
 */

import type { AgentKind, MemoryBundle } from "@/lib/user-config/schema";

const DOCS: ReadonlyArray<[keyof MemoryBundle["docs"], string]> = [
	["soul", "SOUL.md"],
	["agentDocs", "AGENTS.md"],
	["memory", "MEMORY.md"],
	["user", "USER.md"],
];

function b64(s: string): string {
	return Buffer.from(s ?? "", "utf8").toString("base64");
}

/** Combined single-doc form for runtimes that read one entrypoint file. */
export function combinedDoc(bundle: MemoryBundle): string {
	const d = bundle.docs;
	const parts: string[] = [];
	if (d.soul.trim()) parts.push(`# Persona & voice\n\n${d.soul.trim()}`);
	if (d.agentDocs.trim()) parts.push(`# Operating rules & agent docs\n\n${d.agentDocs.trim()}`);
	if (d.memory.trim()) parts.push(`# Working memory\n\n${d.memory.trim()}`);
	if (d.user.trim()) parts.push(`# Operator profile\n\n${d.user.trim()}`);
	return parts.join("\n\n");
}

// Python is already a prerequisite of every Worker bootstrap. Descriptor-
// relative opens/renames protect both reads and writes from parent/symlink
// substitution; no /proc dependency, shell interpolation, or broad HOME copy.
const INSTALLER = String.raw`
import base64, json, os, secrets, stat, sys

config = json.loads(base64.b64decode(sys.argv[1]))
names = ["SOUL.md", "AGENTS.md", "MEMORY.md", "USER.md"]
headers = ["Persona & voice", "Operating rules & agent docs", "Working memory", "Operator profile"]
max_doc_bytes = 4 * 1024 * 1024
directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
file_flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
opened, bindings = [], []

def identity(info):
    return (info.st_dev, info.st_ino)

def verify_bindings():
    for parent, name, child in bindings:
        info = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISDIR(info.st_mode) or identity(info) != identity(os.fstat(child)):
            raise ValueError("Memory directory changed during installation")

def directory(parent, name, create=False):
    if create:
        try:
            os.mkdir(name, 0o700, dir_fd=parent)
        except FileExistsError:
            pass
    fd = os.open(name, directory_flags, dir_fd=parent)
    opened.append(fd)
    bindings.append((parent, name, fd))
    verify_bindings()
    return fd

def existing(parent, name):
    try:
        info = os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError("Memory files must be regular, unlinked files: " + name)
    return True

def read(parent, name):
    verify_bindings()
    fd = os.open(name, file_flags, dir_fd=parent)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > max_doc_bytes:
            raise ValueError("Canonical memory is not a bounded regular file: " + name)
        data = stream.read(max_doc_bytes + 1)
        after = os.fstat(stream.fileno())
        current = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if len(data) > max_doc_bytes or identity(current) != identity(info) or info.st_size != after.st_size or info.st_mtime_ns != after.st_mtime_ns:
            raise ValueError("Canonical memory changed during reading: " + name)
    verify_bindings()
    return data

def write(parent, name, data, missing_only=False):
    verify_bindings()
    existing(parent, name)
    temporary = ".am-memory-" + secrets.token_hex(16)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        verify_bindings()
        existing(parent, name)
        if missing_only:
            # linkat is an atomic create-if-absent: a newly authored document
            # wins a race with seeding and is never replaced by its template.
            try:
                os.link(temporary, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
            except FileExistsError:
                existing(parent, name)
        else:
            os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
        verify_bindings()
    finally:
        try:
            os.unlink(temporary, dir_fd=parent)
        except FileNotFoundError:
            pass

try:
    home_path = os.environ["HOME"]
    if not os.path.isabs(home_path) or ".." in home_path.split("/") or home_path == "/":
        raise ValueError("Worker HOME must be an absolute directory")
    home = os.open("/", directory_flags)
    opened.append(home)
    for part in home_path.split("/"):
        if part and part != ".":
            home = directory(home, part)
    canonical = directory(home, ".agent-machines", create=config["mode"] == "install")
    for name in names:
        existing(canonical, name)
    targets = []
    agent = config["agent"]
    if agent in ("claude-code", "codex"):
        folder, entry = (".claude", "CLAUDE.md") if agent == "claude-code" else (".codex", "AGENTS.md")
        runtime = directory(home, folder, create=True)
        targets = [(runtime, entry, None), (home, entry, None)]
    elif agent == "openclaw":
        runtime = directory(directory(home, ".openclaw", create=True), "workspace", create=True)
        targets = [(runtime, name, index) for index, name in enumerate(names)]
    elif agent != "hermes":
        raise ValueError("Unsupported memory runtime")
    for parent, name, index in targets:
        existing(parent, name)
    if config["mode"] == "install":
        for name, encoded in zip(names, config["docs"]):
            if not config["preserveExisting"] or not existing(canonical, name):
                data = base64.b64decode(encoded, validate=True)
                if len(data) > max_doc_bytes:
                    raise ValueError("Template memory exceeds the per-document 4 MiB limit")
                write(canonical, name, data, missing_only=config["preserveExisting"])
    docs = [read(canonical, name) for name in names]
    combined = "\n\n".join("# " + heading + "\n\n" + data.decode("utf-8").strip() for heading, data in zip(headers, docs) if data.decode("utf-8").strip()).encode("utf-8")
    for parent, name, index in targets:
        write(parent, name, combined if index is None else docs[index])
    verify_bindings()
except (OSError, ValueError, KeyError, UnicodeError) as error:
    print("Memory installation failed: " + str(error), file=sys.stderr)
    sys.exit(1)
finally:
    for fd in reversed(opened):
        os.close(fd)
`;

function installCommand(config: Record<string, unknown>): string {
	return `python3 -c 'import base64; exec(base64.b64decode("${b64(INSTALLER)}"))' '${b64(JSON.stringify(config))}'`;
}

/** Regenerate derived entrypoints from current canonical files, never a template. */
export function regenerateMemoryEntrypointsLines(agentKind: AgentKind): string[] {
	return [`${installCommand({ mode: "regenerate", agent: agentKind })} && echo AM_MEMORY_ENTRYPOINTS_REGENERATED`];
}

export type MemoryInstallOptions = {
	/** Repair/bootstrap seeds missing docs only. Explicit Apply keeps replacement. */
	preserveExisting?: boolean;
};

/**
 * The shell lines that install a bundle's memory docs for a runtime. Returned
 * as an array for a larger `&&`-chained bootstrap phase. Standalone callers
 * should use bundleInstallCommand so failed writes cannot be skipped.
 */
export function bundleInstallLines(bundle: MemoryBundle, agentKind: AgentKind, options: MemoryInstallOptions = {}): string[] {
	return [installCommand({ mode: "install", agent: agentKind, preserveExisting: options.preserveExisting === true, docs: DOCS.map(([key]) => b64(bundle.docs[key])) }), "echo AM_MEMORY_ENTRYPOINTS_REGENERATED", "echo AM_MEMORY_INSTALLED"];
}

/** The shell command to install a bundle's memory docs for the given runtime. */
export function bundleInstallCommand(bundle: MemoryBundle, agentKind: AgentKind, options: MemoryInstallOptions = {}): string {
	return bundleInstallLines(bundle, agentKind, options).join(" && ");
}

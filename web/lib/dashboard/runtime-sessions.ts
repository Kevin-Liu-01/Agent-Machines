/**
 * Read native histories without launching an agent, migrating a database, or
 * requiring the provider's HOME to be /home/machine. Descriptor-relative reads
 * never follow history symlinks; Hermes uses bounded, stable DB/WAL snapshots
 * so SQLite never opens or modifies the original Worker database paths.
 *
 * Formats: Claude projects/*.jsonl, Codex rollout JSONL, the pinned OpenClaw
 * 2026.7 pi session JSONL, and Hermes sessions/messages in state.db. IDs are
 * hashes of discovered locators; requests never supply a filesystem path.
 */
export function isRuntimeSessionId(value: string): boolean {
	return /^[a-f0-9]{64}$/.test(value);
}

const READER = String.raw`
import datetime, hashlib, json, os, sqlite3, stat, sys, tempfile, time
from contextlib import contextmanager
from pathlib import Path

home = Path(os.environ["HOME"])
home_fd = None
selected = sys.argv[1] if len(sys.argv) > 1 else ""
limit, max_files, max_bytes, max_messages = 80, 2000, 2 * 1024 * 1024, 200
warnings, entries, seen, visited = [], [], set(), 0
unique_files = {}
directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
file_flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
max_database_bytes, max_wal_bytes = 32 * 1024 * 1024, 32 * 1024 * 1024

def warn(message):
    if message not in warnings:
        warnings.append(message)

def stamp(value):
    if isinstance(value, (int, float)):
        try:
            return datetime.datetime.fromtimestamp(value / 1000 if value > 1e11 else value, datetime.timezone.utc).isoformat()
        except (ValueError, OverflowError, OSError):
            return None
    return value[:80] if isinstance(value, str) and value else None

def open_home():
    if not home.is_absolute() or ".." in home.parts or str(home) == "/":
        raise ValueError("Worker HOME must be an absolute directory")
    fd = os.open("/", directory_flags)
    try:
        for part in home.parts[1:]:
            child = os.open(part, directory_flags, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise

@contextmanager
def directory(path):
    parts = path.relative_to(home).parts
    if any(part in ("..", ".") for part in parts):
        raise ValueError("Invalid history directory")
    fd = os.dup(home_fd)
    try:
        for part in parts:
            child = os.open(part, directory_flags, dir_fd=fd)
            os.close(fd)
            fd = child
        yield fd
    finally:
        os.close(fd)

@contextmanager
def source(path):
    with directory(path.parent) as parent:
        fd = os.open(path.name, file_flags, dir_fd=parent)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ValueError("History source is not a regular, non-hard-linked file")
            yield fd, info, parent
        finally:
            os.close(fd)

def version(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)

def file_info(path):
    with source(path) as (_, info, __):
        return info

def relative(path):
    return "~/" + str(path.relative_to(home))

def add(runtime, path, key="", row=None, info=None):
    identity = (runtime, str(path), str(key))
    if identity in seen:
        return
    seen.add(identity)
    info = info or file_info(path)
    unique_files[(info.st_dev, info.st_ino)] = info.st_size
    locator = runtime + ":" + str(path.relative_to(home)) + ":" + str(key)
    record = {
        "id": hashlib.sha256(locator.encode()).hexdigest(), "runtime": runtime,
        "source": relative(path), "preview": str((row or {}).get("title") or key or path.stem)[:180],
        "updatedAt": stamp((row or {}).get("updated_at") or info.st_mtime),
        "bytes": 0 if key else info.st_size,
    }
    entries.append((record, path, key))

def discover(runtime, root, suffix):
    global visited
    if visited >= max_files:
        return
    def walk(fd, path, depth):
        global visited
        if depth > 12:
            warn("History directory depth is limited to 12 levels.")
            return
        with os.scandir(fd) as children:
            for child in children:
                visited += 1
                if visited > max_files:
                    warn("History inventory is limited to 2,000 entries. Older files may not be listed.")
                    return
                location = path / child.name
                try:
                    info = os.stat(child.name, dir_fd=fd, follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode):
                        nested = os.open(child.name, directory_flags, dir_fd=fd)
                        try:
                            walk(nested, location, depth + 1)
                        finally:
                            os.close(nested)
                    elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and child.name.endswith(suffix):
                        # OpenClaw writes a diagnostic trajectory beside the
                        # conversation JSONL. It is not a second conversation;
                        # leave the file intact and exclude it from this index.
                        if runtime == "openclaw" and child.name.endswith(".trajectory.jsonl"):
                            continue
                        add(runtime, location, info=info)
                    elif stat.S_ISLNK(info.st_mode):
                        warn("Symlinked history paths were skipped.")
                except (OSError, ValueError):
                    warn("Some history paths changed or could not be read safely.")
    try:
        with directory(root) as fd:
            walk(fd, root, 0)
    except FileNotFoundError:
        return
    except (OSError, ValueError):
        warn("Some history directories could not be opened safely.")

@contextmanager
def database(path):
    # SQLite never opens the original Worker pathname. Copy pinned regular
    # files into a private snapshot; SQLite can rebuild snapshot SHM from WAL
    # without creating, recovering, checkpointing, or locking source files.
    with tempfile.TemporaryDirectory(prefix="am-history-") as temporary:
        snapshot = Path(temporary) / "state.db"
        sources = []
        try:
            with directory(path.parent) as parent:
                try:
                    journal = os.stat(path.name + "-journal", dir_fd=parent, follow_symlinks=False)
                except FileNotFoundError:
                    journal = None
                if journal and journal.st_size:
                    raise ValueError("active rollback journal; retry when Hermes is idle")
                for name, cap in [(path.name, max_database_bytes), (path.name + "-wal", max_wal_bytes)]:
                    try:
                        fd = os.open(name, file_flags, dir_fd=parent)
                    except FileNotFoundError:
                        if name == path.name:
                            raise
                        continue
                    info = os.fstat(fd)
                    sources.append((fd, name, info))
                    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                        raise ValueError("unsafe database or WAL link/type")
                    if info.st_size > cap:
                        raise ValueError("database or WAL exceeds its 32 MiB snapshot limit")
                    destination = snapshot if name == path.name else Path(str(snapshot) + "-wal")
                    with destination.open("xb") as stream:
                        remaining = info.st_size
                        while remaining:
                            block = os.read(fd, min(65536, remaining))
                            if not block:
                                raise ValueError("database or WAL changed during snapshot")
                            stream.write(block)
                            remaining -= len(block)
                expected = {name for _, name, _ in sources}
                # A WAL appearing/disappearing, checkpoint, or concurrent write
                # invalidates this snapshot instead of returning stale history.
                for name in [path.name, path.name + "-wal"]:
                    try:
                        current = os.stat(name, dir_fd=parent, follow_symlinks=False)
                    except FileNotFoundError:
                        current = None
                    if bool(current) != (name in expected):
                        raise ValueError("database or WAL changed during snapshot")
                for fd, name, info in sources:
                    if version(info) != version(os.fstat(fd)) or version(info) != version(os.stat(name, dir_fd=parent, follow_symlinks=False)):
                        raise ValueError("database or WAL changed during snapshot")
            connection = sqlite3.connect(snapshot.as_uri() + "?mode=ro", uri=True, timeout=1)
            try:
                connection.row_factory = sqlite3.Row
                connection.execute("PRAGMA query_only = ON")
                connection.execute("PRAGMA trusted_schema = OFF")
                connection.execute("PRAGMA cache_size = -2048")
                deadline = time.monotonic() + 2
                connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
                yield connection
            finally:
                connection.close()
        finally:
            for fd, _, _ in sources:
                os.close(fd)

def columns(connection, table):
    # Both names are fixed by this reader, never supplied by a request.
    return {row[1] for row in connection.execute("PRAGMA table_info(" + table + ")")}

def hermes(path):
    info = None
    try:
        info = file_info(path)
        with database(path) as connection:
            cols = columns(connection, "sessions")
            if "id" not in cols:
                raise ValueError("Unsupported sessions schema")
            title = "title" if "title" in cols else "id"
            time_columns = [c for c in ["last_activity_at", "ended_at", "started_at"] if c in cols]
            time_expr = "COALESCE(" + ", ".join(time_columns + ["0"]) + ")" if time_columns else "0"
            bounded_time = "CASE WHEN typeof(" + time_expr + ") IN ('integer', 'real') THEN " + time_expr + " ELSE substr(" + time_expr + ", 1, 80) END"
            query = "SELECT CAST(id AS TEXT) AS id, substr(CAST(" + title + " AS TEXT), 1, 180) AS title, " + bounded_time + " AS updated_at FROM sessions WHERE id IS NOT NULL AND length(CAST(id AS BLOB)) BETWEEN 1 AND 512 ORDER BY " + time_expr + " DESC LIMIT 81"
            rows = connection.execute(query).fetchall()
            if connection.execute("SELECT 1 FROM sessions WHERE length(CAST(id AS BLOB)) > 512 LIMIT 1").fetchone():
                warn("Hermes sessions with identifiers over 512 bytes were skipped.")
            if len(rows) > limit:
                warn("Showing the 80 most recent Hermes sessions per database.")
            for row in rows[:limit]:
                add("hermes", path, row["id"], dict(row), info)
    except FileNotFoundError:
        if info is not None:
            warn("Hermes history exists but its database disappeared during the read-only snapshot. Retry when the runtime is idle.")
    except (sqlite3.Error, ValueError, OSError):
        error = sys.exc_info()[1]
        warn("Hermes history exists but its read-only snapshot could not be read: " + str(error)[:160] + ". Retry when the runtime is idle.")

def content_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(content_text(part) for part in content if isinstance(part, (dict, str)))
    if isinstance(content, dict) and content.get("type") in ("text", "input_text", "output_text"):
        return str(content.get("text", ""))
    return ""

def normalize(role, content, timestamp=None, tool=None):
    if role in ("toolResult", "tool_result"):
        role = "tool"
    if role not in ("user", "assistant", "tool"):
        return []
    result = []
    text = content_text(content).strip()
    if text:
        result.append({"role": role, "text": text[:12000], "at": stamp(timestamp), "toolName": str(tool)[:120] if tool is not None else None, "truncated": len(text) > 12000})
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            kind = part.get("type")
            if kind in ("tool_use", "toolCall"):
                arguments = part.get("input", part.get("arguments", {}))
                text = arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False)
                result.append({"role": "tool", "text": text[:12000], "at": stamp(timestamp), "toolName": str(part.get("name", "Tool call"))[:120], "truncated": len(text) > 12000})
            elif kind == "tool_result":
                result.extend(normalize("tool", part.get("content", ""), timestamp, tool))
    return result

def json_messages(records, runtime):
    messages = []
    # Codex writes the same user/assistant text in event_msg and response_item.
    # Prefer response_item when present; events are a fallback for old rollouts.
    response_roles = {r.get("payload", {}).get("role") for r in records if r.get("type") == "response_item" and isinstance(r.get("payload"), dict) and r["payload"].get("type") == "message"}
    for record in records:
        kind, at = record.get("type"), record.get("timestamp")
        if runtime == "codex":
            body = record.get("payload")
            if not isinstance(body, dict):
                continue
            if kind == "response_item" and body.get("type") == "message":
                messages.extend(normalize(body.get("role"), body.get("content"), at))
            elif kind == "response_item" and body.get("type") in ("function_call", "custom_tool_call"):
                messages.extend(normalize("tool", body.get("arguments", body.get("input", "")), at, body.get("name")))
            elif kind == "response_item" and body.get("type") in ("function_call_output", "custom_tool_call_output"):
                messages.extend(normalize("tool", body.get("output", ""), at))
            elif kind == "event_msg":
                role = {"user_message": "user", "agent_message": "assistant"}.get(body.get("type"))
                if role and role not in response_roles:
                    messages.extend(normalize(role, body.get("message", ""), at))
        else:
            body = record.get("message")
            if isinstance(body, dict):
                messages.extend(normalize(body.get("role", kind), body.get("content"), at or body.get("timestamp"), body.get("toolName")))
            elif runtime == "hermes" and record.get("role"):
                messages.extend(normalize(record.get("role"), record.get("content"), at, record.get("tool_name")))
    return messages

def read_jsonl(path, runtime, detail):
    cap = max_bytes if detail else 65536
    with source(path) as (fd, info, _):
        size = info.st_size
        if detail and size > cap:
            os.lseek(fd, size - cap, os.SEEK_SET)
        chunks, remaining = [], min(size, cap)
        while remaining:
            block = os.read(fd, min(65536, remaining))
            if not block:
                break
            chunks.append(block)
            remaining -= len(block)
        raw = b"".join(chunks)
        if detail and size > cap:
            # Never readline(): a single unterminated record may be gigabytes.
            raw = raw.partition(b"\n")[2]
    records, invalid = [], 0
    for line in raw.splitlines():
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                records.append(value)
        except (ValueError, UnicodeDecodeError, RecursionError):
            invalid += 1
    messages = json_messages(records, runtime)
    return messages[-max_messages:] if detail else messages, size > cap or len(messages) > max_messages, invalid

def read_hermes(path, key):
    with database(path) as connection:
        cols = columns(connection, "messages")
        if not {"session_id", "role", "content"}.issubset(cols):
            raise ValueError("Unsupported messages schema")
        fields = ["substr(role, 1, 32) AS role", "substr(CAST(content AS TEXT), 1, 12001) AS content"]
        if "timestamp" in cols:
            fields.append("CASE WHEN typeof(timestamp) IN ('integer', 'real') THEN timestamp ELSE substr(timestamp, 1, 80) END AS timestamp")
        if "tool_name" in cols:
            fields.append("substr(tool_name, 1, 120) AS tool_name")
        if "tool_calls" in cols:
            fields.extend(["substr(CAST(tool_calls AS BLOB), 1, 65536) AS tool_calls", "length(CAST(tool_calls AS BLOB)) > 65536 AS tool_calls_truncated"])
        order = "id" if "id" in cols else "rowid"
        rows = connection.execute("SELECT " + ", ".join(fields) + " FROM messages WHERE session_id = ? ORDER BY " + order + " DESC LIMIT 201", (key,)).fetchall()
        messages, truncated = [], False
        for row in reversed(rows[:max_messages]):
            row = dict(row)
            content = row.get("content") or ""
            # Hermes usually stores plain content; blocks may be serialized JSON.
            if content.startswith("["):
                try:
                    content = json.loads(content)
                except (ValueError, RecursionError):
                    pass
            messages.extend(normalize(row["role"], content, row.get("timestamp"), row.get("tool_name")))
            if row.get("tool_calls_truncated"):
                warn("Hermes tool-call details exceeding 64 KiB were omitted from this transcript.")
                truncated = True
            elif row.get("tool_calls"):
                try:
                    for call in json.loads(row["tool_calls"]):
                        function = call.get("function", {})
                        messages.extend(normalize("tool", function.get("arguments", ""), row.get("timestamp"), function.get("name")))
                except (ValueError, TypeError, AttributeError, RecursionError):
                    warn("Some tool-call details could not be decoded.")
        return messages[-max_messages:], truncated or len(rows) > max_messages or len(messages) > max_messages, 0

def bound_messages(messages):
    # Keep API responses below hosted response limits, including Unicode and
    # SQLite histories whose individual messages can each be very large.
    budget, bounded, truncated = 512 * 1024, [], False
    for message in reversed(messages):
        if budget <= 0:
            truncated = True
            break
        encoded = message["text"].encode("utf-8")
        if len(encoded) > budget:
            message = dict(message, text=encoded[:budget].decode("utf-8", errors="ignore"), truncated=True)
            truncated = True
        bounded.append(message)
        budget -= len(encoded)
    return list(reversed(bounded)), truncated

try:
    home_fd = open_home()
    discover("claude-code", home / ".claude/projects", ".jsonl")
    discover("codex", home / ".codex/sessions", ".jsonl")
    discover("codex", home / ".codex/archived_sessions", ".jsonl")
    agents = home / ".openclaw/agents"
    try:
        with directory(agents) as fd, os.scandir(fd) as children:
            for index, child in enumerate(children):
                if index >= 100:
                    warn("OpenClaw history inventory is limited to 100 agents.")
                    break
                agent = agents / child.name
                discover("openclaw", agent / "sessions", ".jsonl")
                # agent/openclaw-agent.sqlite stores auth/cache/memory metadata
                # alongside supported JSONL conversations. Its presence does
                # not establish another history format, so do not inspect it
                # or invent an unsupported-conversation warning from its name.
    except FileNotFoundError:
        pass
    except (OSError, ValueError):
        warn("OpenClaw history directories could not be read safely.")
    for root in [home / ".agent-machines", home / ".hermes"]:
        # The supported .hermes -> .agent-machines alias is already inventoried
        # through its canonical root. Never resolve other symlink targets.
        if root.name == ".hermes":
            try:
                alias = os.readlink(".hermes", dir_fd=home_fd)
                if alias in (".agent-machines", str(home / ".agent-machines")):
                    continue
            except OSError:
                pass
        hermes(root / "state.db")
        discover("hermes", root / "sessions", ".jsonl")
    entries.sort(key=lambda entry: entry[0]["updatedAt"] or "", reverse=True)
    if selected:
        chosen = next((entry for entry in entries if entry[0]["id"] == selected), None)
        if chosen is None:
            print(json.dumps({"error": "session_not_found"}))
        else:
            record, path, key = chosen
            messages, truncated, invalid = read_hermes(path, key) if key else read_jsonl(path, record["runtime"], True)
            messages, payload_truncated = bound_messages(messages)
            if invalid:
                warn("Some incomplete or invalid transcript records were skipped.")
            print(json.dumps({"session": record, "messages": messages, "truncated": truncated or payload_truncated or any(m.get("truncated") for m in messages), "warnings": warnings}, ensure_ascii=False))
    else:
        if len(entries) > limit:
            warn("Showing the 80 most recently updated sessions.")
        records = []
        for record, path, key in entries[:limit]:
            if not key:
                try:
                    messages, _, invalid = read_jsonl(path, record["runtime"], False)
                    first = next((m["text"] for m in messages if m["role"] == "user"), None)
                    if first:
                        record["preview"] = first.replace("\n", " ")[:180]
                    elif invalid:
                        warn("Some transcript records could not be decoded; open the session to inspect the readable messages.")
                except (OSError, ValueError, RecursionError):
                    warn("Some session previews could not be read.")
            records.append(record)
        print(json.dumps({"sessions": records, "totalSessions": len(entries), "totalBytes": sum(unique_files.values()), "dbPath": "Native runtime histories in ~/", "warnings": warnings}))
except (OSError, ValueError, sqlite3.Error, RecursionError) as error:
    print(json.dumps({"error": "history_read_failed", "message": "Native history could not be read. " + str(error)[:200]}))
finally:
    if home_fd is not None:
        os.close(home_fd)
`;

export function runtimeSessionsCommand(sessionId?: string): string {
	if (sessionId !== undefined && !isRuntimeSessionId(sessionId)) {
		throw new Error("Invalid session identifier.");
	}
	const encoded = Buffer.from(READER).toString("base64");
	return `python3 -c "import base64; exec(base64.b64decode('${encoded}'))" '${sessionId ?? ""}'`;
}

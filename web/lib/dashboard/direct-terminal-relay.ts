/**
 * Worker-side WebSocket relay used by direct terminal lanes.
 *
 * The provider SDK implements PTY input as one unary RPC per write. That is a
 * useful control-plane primitive, but its ~150ms round trip is the wrong hot
 * path for an interactive terminal. This relay runs beside tmux, writes to a
 * local PTY, and acknowledges only after the worker kernel accepts every byte.
 */

export const DIRECT_TERMINAL_PROTOCOL = "agent-machines-v1";
export const DIRECT_TERMINAL_ACK_PROTOCOL = "agent-machines-ack-v1";
export const DIRECT_TERMINAL_MIN_PORT = 20_000;
export const DIRECT_TERMINAL_PORT_SPAN = 20_000;
const DIRECT_TERMINAL_LOWEST_WORKER_PORT = 1_024;

export type DirectTerminalLaunch = {
	port: number;
	token: string;
	origin: string;
	cols: number;
	rows: number;
};

export const DIRECT_TERMINAL_RELAY_SOURCE = String.raw`#!/usr/bin/env python3
import argparse
import base64
import codecs
import fcntl
import hashlib
import json
import os
import pty
import re
import select
import signal
import socket
import struct
import subprocess
import threading
import time

PROTOCOL = "agent-machines-v1"
ACK_PROTOCOL = "agent-machines-ack-v1"
INPUT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_HTTP_BYTES = 16384
MAX_FRAME_BYTES = 16384


def sprite_task(method, path, body=b""):
    conn = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    conn.settimeout(2)
    try:
        conn.connect("/.sprite/api.sock")
        conn.sendall(
            ("%s %s HTTP/1.1\r\nHost: sprite\r\nConnection: close\r\n"
             "Content-Type: application/json\r\nContent-Length: %d\r\n\r\n" %
             (method, path, len(body))).encode("ascii") + body
        )
        response = b""
        while b"\r\n" not in response:
            chunk = conn.recv(256)
            if not chunk:
                break
            response += chunk
        status = int(response.split(b" ", 2)[1])
        if status >= 300 and not (method == "DELETE" and status == 404):
            raise OSError("sprite task request failed")
    finally:
        conn.close()


def recv_exact(conn, size):
    chunks = []
    remaining = size
    while remaining:
        chunk = conn.recv(remaining)
        if not chunk:
            raise EOFError()
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_http_request(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            raise EOFError()
        data += chunk
        if len(data) > MAX_HTTP_BYTES:
            raise ValueError("request too large")
    head = data.split(b"\r\n\r\n", 1)[0].decode("latin1")
    lines = head.split("\r\n")
    method, path, _ = lines[0].split(" ", 2)
    headers = {}
    for line in lines[1:]:
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        headers[name.strip().lower()] = value.strip()
    return method, path, headers


def send_http(conn, status, message):
    body = message.encode("utf-8")
    conn.sendall(
        ("HTTP/1.1 %s\r\nConnection: close\r\nContent-Type: text/plain\r\n"
         "Content-Length: %d\r\n\r\n" % (status, len(body))).encode("ascii") + body
    )


def accept_websocket(conn, token, origin):
    method, path, headers = read_http_request(conn)
    offered = [part.strip() for part in headers.get("sec-websocket-protocol", "").split(",")]
    if method != "GET" or path.split("?", 1)[0] != "/terminal":
        send_http(conn, "404 Not Found", "not found")
        return None
    if headers.get("origin") != origin:
        send_http(conn, "403 Forbidden", "origin refused")
        return None
    if PROTOCOL not in offered or token not in offered:
        send_http(conn, "401 Unauthorized", "terminal token required")
        return None
    key = headers.get("sec-websocket-key", "")
    if not key:
        send_http(conn, "400 Bad Request", "websocket key required")
        return None
    accept = base64.b64encode(
        hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")).digest()
    ).decode("ascii")
    conn.sendall(
        ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
         "Connection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n"
         "Sec-WebSocket-Protocol: %s\r\n\r\n" % (accept, PROTOCOL)).encode("ascii")
    )
    return ACK_PROTOCOL not in offered


def receive_frame(conn):
    first, second = recv_exact(conn, 2)
    final = (first & 0x80) != 0
    opcode = first & 0x0F
    masked = (second & 0x80) != 0
    length = second & 0x7F
    if not final or not masked:
        raise ValueError("fragmented or unmasked frame")
    if length == 126:
        length = struct.unpack("!H", recv_exact(conn, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", recv_exact(conn, 8))[0]
    if length > MAX_FRAME_BYTES:
        raise ValueError("frame too large")
    mask = recv_exact(conn, 4)
    payload = recv_exact(conn, length)
    return opcode, bytes(value ^ mask[index % 4] for index, value in enumerate(payload))


def encode_frame(opcode, payload):
    size = len(payload)
    head = bytes([0x80 | opcode])
    if size < 126:
        return head + bytes([size]) + payload
    if size <= 65535:
        return head + bytes([126]) + struct.pack("!H", size) + payload
    return head + bytes([127]) + struct.pack("!Q", size) + payload


def send_json(conn, lock, value):
    payload = json.dumps(value, separators=(",", ":")).encode("utf-8")
    with lock:
        conn.sendall(encode_frame(1, payload))


def set_size(fd, cols, rows):
    fcntl.ioctl(fd, 0x5414, struct.pack("HHHH", rows, cols, 0, 0))


def run_terminal(conn, cols, rows, input_lock, seen_inputs, send_output):
    master, slave = pty.openpty()
    set_size(master, cols, rows)
    env = os.environ.copy()
    env.pop("TMUX", None)
    env["TERM"] = "xterm-256color"
    env.setdefault("LANG", "C.UTF-8")
    process = subprocess.Popen(
        ["tmux", "attach-session", "-t", "amconsole"],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        env=env,
        start_new_session=True,
        close_fds=True,
    )
    os.close(slave)
    send_lock = threading.Lock()
    stopped = threading.Event()
    decoder = codecs.getincrementaldecoder("utf-8")("replace")

    def output_loop():
        last_ping = time.monotonic()
        try:
            while not stopped.is_set():
                readable, _, _ = select.select([master], [], [], 0.025)
                if readable:
                    chunk = os.read(master, 65536)
                    if not chunk:
                        return
                    data = decoder.decode(chunk)
                    if data and send_output:
                        send_json(conn, send_lock, {"type": "output", "data": data})
                now = time.monotonic()
                if now - last_ping >= 0.025:
                    with send_lock:
                        conn.sendall(encode_frame(9, b""))
                    last_ping = now
        except (EOFError, OSError, BrokenPipeError, ConnectionError) as error:
            try:
                send_json(conn, send_lock, {"type": "error", "message": "pty_output_" + type(error).__name__})
            except Exception:
                pass
        finally:
            stopped.set()

    output = threading.Thread(target=output_loop, daemon=True)
    output.start()
    send_json(conn, send_lock, {"type": "ready", "transport": "worker-pty"})

    try:
        while not stopped.is_set():
            opcode, payload = receive_frame(conn)
            if opcode == 8:
                return
            if opcode == 9:
                with send_lock:
                    conn.sendall(encode_frame(10, payload))
                continue
            if opcode != 1:
                continue
            message = json.loads(payload.decode("utf-8"))
            if message.get("type") == "resize":
                next_cols = min(500, max(20, int(message.get("cols", cols))))
                next_rows = min(200, max(5, int(message.get("rows", rows))))
                set_size(master, next_cols, next_rows)
                continue
            if message.get("type") != "input":
                continue
            input_id = message.get("inputId")
            data = message.get("data")
            if not isinstance(input_id, str) or not INPUT_ID.match(input_id):
                continue
            if not isinstance(data, str):
                continue
            encoded = data.encode("utf-8")
            if not encoded or len(encoded) > 8192:
                continue
            with input_lock:
                worker_ms = seen_inputs.get(input_id)
                if worker_ms is None:
                    started = time.perf_counter_ns()
                    written = 0
                    while written < len(encoded):
                        written += os.write(master, encoded[written:])
                    worker_ms = (time.perf_counter_ns() - started) / 1_000_000
                    seen_inputs[input_id] = worker_ms
                    if len(seen_inputs) > 256:
                        del seen_inputs[next(iter(seen_inputs))]
            send_json(conn, send_lock, {
                "type": "ack",
                "inputId": input_id,
                "providerMs": round(worker_ms, 3),
            })
    except (EOFError, OSError, BrokenPipeError, ConnectionError, ValueError, json.JSONDecodeError) as error:
        try:
            send_json(conn, send_lock, {"type": "error", "message": type(error).__name__})
        except Exception:
            pass
    finally:
        stopped.set()
        try:
            process.terminate()
            process.wait(timeout=1)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
        try:
            os.close(master)
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--persistent-token", action="store_true")
    parser.add_argument("--keep-awake-task", action="store_true")
    parser.add_argument("--origin", required=True)
    parser.add_argument("--cols", type=int, default=120)
    parser.add_argument("--rows", type=int, default=32)
    args = parser.parse_args()
    with open(args.token_file, "r", encoding="utf-8") as handle:
        token = handle.read().strip()
    if not args.persistent_token:
        os.unlink(args.token_file)
    task_stop = threading.Event()
    task_thread = None
    task_path = "/v1/tasks/agent-machines-terminal"
    if args.keep_awake_task and os.path.exists("/.sprite/api.sock"):
        def keep_awake():
            while not task_stop.is_set():
                try:
                    sprite_task("PUT", task_path, b'{"expire":"2m"}')
                except (OSError, ValueError, IndexError):
                    pass
                if task_stop.wait(60):
                    break
        try:
            sprite_task("PUT", task_path, b'{"expire":"2m"}')
        except (OSError, ValueError, IndexError):
            pass
        task_thread = threading.Thread(target=keep_awake, daemon=True)
        task_thread.start()
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("0.0.0.0", args.port))
    listener.listen(8)
    listener.settimeout(1)
    deadline = time.monotonic() + 90
    input_lock = threading.Lock()
    seen_inputs = {}
    clients = []
    try:
        while time.monotonic() < deadline and len(clients) < 6:
            try:
                conn, _ = listener.accept()
            except socket.timeout:
                continue
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            conn.settimeout(30)
            accepted = False
            try:
                output_lane = accept_websocket(conn, token, args.origin)
                if output_lane is not None:
                    conn.settimeout(None)
                    accepted = True
                    client = threading.Thread(
                        target=run_terminal,
                        args=(conn, args.cols, args.rows, input_lock, seen_inputs, output_lane),
                        daemon=True,
                    )
                    client.start()
                    clients.append(client)
            except (EOFError, OSError, ValueError):
                # Provider health checks and abandoned TCP handshakes must not
                # terminate the listener that owns the authenticated session.
                pass
            finally:
                if not accepted:
                    try:
                        conn.close()
                    except OSError:
                        pass
    finally:
        listener.close()
    for client in clients:
        client.join()
    if task_thread is not None:
        task_stop.set()
        task_thread.join(timeout=2)
        try:
            sprite_task("DELETE", task_path)
        except (OSError, ValueError, IndexError):
            pass


if __name__ == "__main__":
    main()
`;

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function clampInteger(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

export function buildDirectTerminalRelayCommand(
	launch: DirectTerminalLaunch,
): string {
	const prepared = prepareDirectTerminalRelay(launch);
	return [
		...prepared.setup,
		`exec python3 ${prepared.args.map(shellQuote).join(" ")}`,
	].join(" && ");
}

export type DirectTerminalServiceLaunch = {
	setupCommand: string;
	command: "python3";
	args: string[];
	serviceName: "agent-machines-terminal";
};

/** Sprite service launch: survives hibernation and avoids detached-work throttling. */
export function buildDirectTerminalRelayServiceLaunch(
	launch: DirectTerminalLaunch,
): DirectTerminalServiceLaunch {
	const prepared = prepareDirectTerminalRelay(launch);
	return {
		setupCommand: prepared.setup.join(" && "),
		command: "python3",
		args: [
			...prepared.args,
			"--persistent-token",
			"--keep-awake-task",
		],
		serviceName: "agent-machines-terminal",
	};
}

function prepareDirectTerminalRelay(launch: DirectTerminalLaunch): {
	setup: string[];
	args: string[];
} {
	const port = clampInteger(
		launch.port,
		DIRECT_TERMINAL_LOWEST_WORKER_PORT,
		65_535,
	);
	const cols = clampInteger(launch.cols, 20, 500);
	const rows = clampInteger(launch.rows, 5, 200);
	if (!/^[A-Za-z0-9_-]{32,128}$/.test(launch.token)) {
		throw new Error("Direct terminal token is not a safe high-entropy token");
	}
	const origin = new URL(launch.origin).origin;
	if (!/^https:\/\//.test(origin)) {
		throw new Error("Direct terminal origin must use HTTPS");
	}
	const source = Buffer.from(DIRECT_TERMINAL_RELAY_SOURCE, "utf8").toString(
		"base64",
	);
	const root = "/tmp/agent-machines-direct-terminal";
	const relay = `${root}/relay.py`;
	const tokenFile = `${root}/token-${port}`;
	const setup = [
		"set -eu",
		"umask 077",
		`mkdir -p ${shellQuote(root)}`,
		`printf %s ${shellQuote(source)} | base64 -d > ${shellQuote(`${relay}.tmp`)}`,
		`chmod 700 ${shellQuote(`${relay}.tmp`)}`,
		`mv ${shellQuote(`${relay}.tmp`)} ${shellQuote(relay)}`,
		`printf %s ${shellQuote(launch.token)} > ${shellQuote(tokenFile)}`,
	];
	return {
		setup,
		args: [
			relay,
			"--port",
			String(port),
			"--token-file",
			tokenFile,
			"--origin",
			origin,
			"--cols",
			String(cols),
			"--rows",
			String(rows),
		],
	};
}

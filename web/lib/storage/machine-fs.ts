/**
 * Filesystem helpers that run against the user's active persistent machine.
 *
 * The persistent volume at `/home/machine` survives sleep/wake. Storing
 * chats + artifacts there means each user's data lives on the machine
 * they already own -- no separate blob store, no shared bucket, no
 * cross-tenant leak risk, and the agent itself can read/write the same
 * files as context. This mirrors the Dedalus "agent sandbox per user"
 * cookbook pattern.
 *
 * All operations route through the selected provider's exec API. On
 * persistent-machine providers (Dedalus, Fly once exec is available)
 * this points at `/home/machine`. Ephemeral providers such as Vercel
 * Sandbox need an external storage backend and fail closed here until
 * that profile is configured.
 */

import { Buffer } from "node:buffer";

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import {
	MachineProviderError,
	getProvider,
} from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	activeMachine,
	type MachineRef,
} from "@/lib/user-config/schema";

/**
 * Root directory on the VM for all persistent state -- runtime, app data,
 * skills, sessions, crons, and config. Lives under `/home/machine`
 * (the persistent volume).
 */
export const APP_DATA_ROOT = "/home/machine/.agent-machines";

export type MachineUnreachable =
	| { ok: false; reason: "no_active_machine"; message: string }
	| { ok: false; reason: "missing_credentials"; message: string }
	| { ok: false; reason: "machine_starting"; message: string; machineId: string }
	| { ok: false; reason: "machine_asleep"; message: string; machineId: string }
	| { ok: false; reason: "machine_error"; message: string; machineId: string };

export type MachineHandle = {
	machine: MachineRef;
};

/**
 * Resolve the user's active machine and ensure it's awake.
 *
 * If the machine is sleeping, we submit a wake and return
 * `machine_starting` so the caller can return a typed envelope to the
 * client. The dashboard's `useMachineControl` hook already polls every
 * 2s during transitions, so the next request will succeed.
 *
 * Returns the machine handle when ready, or a typed unreachable state
 * the API route can pass straight back to the browser as the response
 * body. This pattern keeps the client's loading UI generic -- it just
 * polls until `ok: true`.
 */
export async function withActiveMachine(): Promise<
	MachineHandle | MachineUnreachable
> {
	const config = await getUserConfig();
	const machine = activeMachine(config);
	if (!machine) {
		return {
			ok: false,
			reason: "no_active_machine",
			message:
				"No active machine. Pick one in /dashboard/machines or provision via /dashboard/setup.",
		};
	}
	const provider = getProvider(machine.providerKind, config.providers);
	if (!provider.capabilities.hasPersistentDisk) {
		return {
			ok: false,
			reason: "missing_credentials",
			message: `Machine ${machine.id} runs on ${machine.providerKind}; chats and artifacts need an external storage backend for ephemeral sessions.`,
		};
	}

	if (await isMachineRunning()) return { machine };

	// Machine is asleep / starting / failed. Submit a wake and return
	// the appropriate transitional state for the client to poll on.
	try {
		const summary = await provider.state(machine.id);
		if (summary.state === "sleeping") {
			await provider.wake(machine.id);
			return {
				ok: false,
				reason: "machine_starting",
				message: "Waking your machine. Retry in a few seconds.",
				machineId: machine.id,
			};
		}
		if (summary.state === "starting") {
			return {
				ok: false,
				reason: "machine_starting",
				message: "Machine is starting. Retry in a few seconds.",
				machineId: machine.id,
			};
		}
		if (summary.state === "error") {
			return {
				ok: false,
				reason: "machine_error",
				message:
					summary.lastError ??
					"Machine entered an error state. Open /dashboard/machines to inspect.",
				machineId: machine.id,
			};
		}
		return {
			ok: false,
			reason: "machine_asleep",
			message: `Machine in state '${summary.state}'. Wake it from /dashboard.`,
			machineId: machine.id,
		};
	} catch (err) {
		const message =
			err instanceof MachineProviderError
				? err.message
				: err instanceof Error
					? err.message
					: "machine probe failed";
		return {
			ok: false,
			reason: "machine_error",
			message,
			machineId: machine.id,
		};
	}
}

/* ------------------------------------------------------------------ */
/* Path helpers                                                        */
/* ------------------------------------------------------------------ */

function shellEscape(value: string): string {
	// Single-quote-wrapping with escape for embedded single quotes.
	// Safe for use inside `bash -c "..."` payloads.
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function assertSafePath(path: string): void {
	if (!path.startsWith(APP_DATA_ROOT)) {
		throw new Error(
			`refusing to operate on a path outside ${APP_DATA_ROOT}: ${path}`,
		);
	}
	if (path.includes("..") || path.includes("\n")) {
		throw new Error(`unsafe path component: ${path}`);
	}
}

/* ------------------------------------------------------------------ */
/* Read helpers                                                        */
/* ------------------------------------------------------------------ */

export async function readTextFile(path: string): Promise<string | null> {
	assertSafePath(path);
	const result = await execOnMachine(
		`if [ -f ${shellEscape(path)} ]; then cat ${shellEscape(path)}; else echo __MISSING__; fi`,
	);
	if (result.exitCode !== 0) {
		throw new Error(`read ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
	if (result.stdout === "__MISSING__") return null;
	return result.stdout;
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
	const text = await readTextFile(path);
	if (text === null || text.length === 0) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		// Treat malformed files as missing -- avoids a corrupt index
		// file taking the whole feature down. Caller can rebuild from
		// the actual on-disk contents on next save.
		return null;
	}
}

export async function readBytes(path: string): Promise<Buffer | null> {
	assertSafePath(path);
	// `base64 -w 0` keeps the output as one line so we can ferry it
	// back through the execution API without newline truncation.
	const result = await execOnMachine(
		`if [ -f ${shellEscape(path)} ]; then base64 -w 0 < ${shellEscape(path)}; else echo __MISSING__; fi`,
		{ timeoutMs: 60_000 },
	);
	if (result.exitCode !== 0) {
		throw new Error(`readBytes ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
	if (result.stdout === "__MISSING__") return null;
	try {
		return Buffer.from(result.stdout, "base64");
	} catch {
		return null;
	}
}

export type StatEntry = {
	name: string;
	bytes: number;
	mtime: number;
};

export async function listDir(path: string): Promise<StatEntry[]> {
	assertSafePath(path);
	const cmd =
		`mkdir -p ${shellEscape(path)} && ` +
		`find ${shellEscape(path)} -mindepth 1 -maxdepth 1 -printf '%f\\t%s\\t%T@\\n' 2>/dev/null`;
	const result = await execOnMachine(cmd);
	if (result.exitCode !== 0) {
		throw new Error(`listDir ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const [name, bytes, mtime] = line.split("\t");
			return {
				name: name ?? "",
				bytes: Number.parseInt(bytes ?? "0", 10) || 0,
				mtime: Number.parseFloat(mtime ?? "0") || 0,
			};
		})
		.filter((entry) => entry.name.length > 0 && !entry.name.startsWith("."));
}

/* ------------------------------------------------------------------ */
/* Write helpers                                                       */
/* ------------------------------------------------------------------ */

export async function ensureDir(path: string): Promise<void> {
	assertSafePath(path);
	const result = await execOnMachine(`mkdir -p ${shellEscape(path)}`);
	if (result.exitCode !== 0) {
		throw new Error(`ensureDir ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
}

/**
 * Write a text or binary payload to a file on the machine.
 *
 * Encodes the payload as base64 in the shell command, then decodes on
 * the remote with `base64 -d`. This is reliable for arbitrary content
 * (JSON, binary, multi-line) because the execution API's heredoc
 * support is unreliable -- base64 sidesteps that entirely.
 *
 * Cap at 8 MiB per write; bigger payloads should be uploaded in
 * chunks (we don't have a streaming write surface today).
 */
export async function writeFile(
	path: string,
	content: Buffer | string,
): Promise<void> {
	assertSafePath(path);
	const buf =
		typeof content === "string" ? Buffer.from(content, "utf8") : content;
	if (buf.byteLength > 8 * 1024 * 1024) {
		throw new Error(
			`writeFile ${path}: payload exceeds 8 MiB cap (${buf.byteLength} bytes); chunk it first`,
		);
	}
	const dir = path.replace(/\/[^/]+$/, "");
	const b64 = buf.toString("base64");
	const cmd = `mkdir -p ${shellEscape(dir)} && echo ${shellEscape(b64)} | base64 -d > ${shellEscape(path)}`;
	const result = await execOnMachine(cmd, { timeoutMs: 60_000 });
	if (result.exitCode !== 0) {
		throw new Error(`writeFile ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
}

export async function writeJsonFile<T>(path: string, value: T): Promise<void> {
	await writeFile(path, JSON.stringify(value));
}

export async function deletePath(path: string): Promise<void> {
	assertSafePath(path);
	const result = await execOnMachine(`rm -rf -- ${shellEscape(path)}`);
	if (result.exitCode !== 0) {
		throw new Error(`deletePath ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
}

/**
 * One-shot ensure that the app data root + standard subdirectories
 * exist. Cheap to call; idempotent. Routes call this lazily before
 * the first write to a new user's machine so we don't have to gate
 * every call behind it.
 */
export async function ensureAppDataLayout(): Promise<void> {
	const cmd = [
		`mkdir -p ${shellEscape(`${APP_DATA_ROOT}/chats`)}`,
		`mkdir -p ${shellEscape(`${APP_DATA_ROOT}/artifacts`)}`,
		// README is a one-time hint to anyone shelling into the box.
		`if [ ! -f ${shellEscape(`${APP_DATA_ROOT}/README.md`)} ]; then ` +
			`echo '# agent-machines persistent state\\n\\n' \\\n` +
			`     'chats/    -- chat sessions started from /dashboard/chat\\n' \\\n` +
			`     'artifacts/ -- files uploaded via /dashboard/artifacts\\n\\n' \\\n` +
			`     'these survive sleep/wake. the running agent can read these as context.' \\\n` +
			`     > ${shellEscape(`${APP_DATA_ROOT}/README.md`)}; fi`,
	].join(" && ");
	const result = await execOnMachine(cmd);
	if (result.exitCode !== 0) {
		throw new Error(`ensureAppDataLayout: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
}

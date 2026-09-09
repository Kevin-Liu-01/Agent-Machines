/**
 * Filesystem helpers that run against the user's active persistent machine.
 *
 * Chats and artifacts live in the selected machine's provider-aware
 * durable directory. Pause preserves them only when the provider's
 * lifecycle is configured to retain state; deletion is not recoverable
 * through this helper. Status reads never resume compute, and file
 * access is allowed only after a non-waking probe reports it ready.
 */

import { Buffer } from "node:buffer";

import { execOnMachine, resolveMachine } from "@/lib/dashboard/exec";
import {
	MachineProviderError,
	getProvider,
} from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	type MachineRef,
} from "@/lib/user-config/schema";

import {
	APP_DATA_ROOT,
	type MachineStorageContext,
	storageContextFor,
} from "./machine-paths";

export {
	APP_DATA_ROOT,
	appDataRootFor,
	homeFor,
	storageContextFor,
	type MachineStorageContext,
} from "./machine-paths";

export type MachineUnreachable =
	| { ok: false; reason: "no_active_machine"; message: string }
	| { ok: false; reason: "missing_credentials"; message: string }
	| { ok: false; reason: "machine_starting"; message: string; machineId: string }
	| { ok: false; reason: "machine_asleep"; message: string; machineId: string }
	| { ok: false; reason: "machine_missing"; message: string; machineId: string }
	| { ok: false; reason: "machine_error"; message: string; machineId: string };

export type MachineHandle = {
	machine: MachineRef;
	storage: MachineStorageContext;
};

/**
 * Resolve a machine using a read-only provider status check. Never wake it.
 *
 * When `machineId` is provided, targets that specific machine (used
 * by per-machine dashboard pages). When omitted, falls back to the
 * account's active machine.
 *
 * Returns the machine handle when ready, or a typed unreachable state
 * the API route can pass straight back to the browser as the response
 * body. Sleeping and deleted machines are not loading states: the caller
 * must show an explicit Wake action or a terminal missing-machine message.
 */
export async function withActiveMachine(
	machineId?: string | null,
): Promise<MachineHandle | MachineUnreachable> {
	const config = await getUserConfig();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		return {
			ok: false,
			reason: "no_active_machine",
			message:
				"No active machine. Pick one in /dashboard/machines or provision via /dashboard/setup.",
		};
	}
	try {
		const provider = getProvider(machine.providerKind, config.providers);
		if (!provider.capabilities.hasPersistentDisk) {
			return { ok: false, reason: "missing_credentials", message: `Machine ${machine.id} runs on ${machine.providerKind}; chats and artifacts need an external storage backend for ephemeral sessions.` };
		}
		const summary = await provider.state(machine.id);
		if (summary.state === "ready") return { machine, storage: storageContextFor(machine) };
		if (summary.state === "sleeping") {
			return {
				ok: false,
				reason: "machine_asleep",
				message: "This machine is paused. Wake it explicitly to read its saved chats and artifacts; viewing this page does not start compute.",
				machineId: machine.id,
			};
		}
		if (summary.state === "destroyed" || summary.state === "destroying") {
			return { ok: false, reason: "machine_missing", message: "This sandbox has been deleted or is being deleted. Its disk is unavailable and cannot be recovered by Wake. Restore a backup or create a new Worker.", machineId: machine.id };
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
			reason: "machine_error",
			message: `Machine state is '${summary.state}'. Inspect its provider status before starting work.`,
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

function assertSafePath(path: string, root: string): void {
	if (!path.startsWith(root)) {
		throw new Error(
			`refusing to operate on a path outside ${root}: ${path}`,
		);
	}
	if (path.includes("..") || path.includes("\n")) {
		throw new Error(`unsafe path component: ${path}`);
	}
}

/* ------------------------------------------------------------------ */
/* Read helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Exit code meaning "the file is not there", chosen well outside the range
 * shells and coreutils use so it cannot collide with a real failure.
 *
 * A stdout sentinel was wrong twice. `echo __MISSING__` appends a newline,
 * and only some substrates trim exec output (sprites and dedalus do, e2b and
 * vercel do not), so on the untrimmed lanes the equality check never matched
 * and a MISSING FILE WAS RETURNED AS CONTENT -- the literal string
 * "__MISSING__" became the chat or artifact body. Trimming would have fixed
 * that but left a second bug: a file whose contents really are the sentinel
 * would read as absent. An exit code carries the signal out of band, so
 * neither ambiguity exists.
 */
const MISSING_FILE_EXIT = 42;

export async function readTextFile(
	path: string,
	ctx: MachineStorageContext,
): Promise<string | null> {
	assertSafePath(path, ctx.appDataRoot);
	const result = await execOnMachine(
		`if [ -f ${shellEscape(path)} ]; then cat ${shellEscape(path)}; else exit ${MISSING_FILE_EXIT}; fi`,
		{ machineId: ctx.machineId },
	);
	if (result.exitCode === MISSING_FILE_EXIT) return null;
	if (result.exitCode !== 0) {
		throw new Error(`read ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
	return result.stdout;
}

export async function readJsonFile<T>(
	path: string,
	ctx: MachineStorageContext,
): Promise<T | null> {
	const text = await readTextFile(path, ctx);
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

export async function readBytes(
	path: string,
	ctx: MachineStorageContext,
): Promise<Buffer | null> {
	assertSafePath(path, ctx.appDataRoot);
	// `base64 -w 0` keeps the output as one line so we can ferry it
	// back through the execution API without newline truncation.
	const result = await execOnMachine(
		`if [ -f ${shellEscape(path)} ]; then base64 -w 0 < ${shellEscape(path)}; else exit ${MISSING_FILE_EXIT}; fi`,
		{ timeoutMs: 60_000, machineId: ctx.machineId },
	);
	if (result.exitCode === MISSING_FILE_EXIT) return null;
	if (result.exitCode !== 0) {
		throw new Error(`readBytes ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
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

export async function listDir(
	path: string,
	ctx: MachineStorageContext,
): Promise<StatEntry[]> {
	assertSafePath(path, ctx.appDataRoot);
	const cmd =
		`mkdir -p ${shellEscape(path)} && ` +
		`find ${shellEscape(path)} -mindepth 1 -maxdepth 1 -printf '%f\\t%s\\t%T@\\n' 2>/dev/null`;
	const result = await execOnMachine(cmd, { machineId: ctx.machineId });
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

export async function ensureDir(
	path: string,
	ctx: MachineStorageContext,
): Promise<void> {
	assertSafePath(path, ctx.appDataRoot);
	const result = await execOnMachine(`mkdir -p ${shellEscape(path)}`, {
		machineId: ctx.machineId,
	});
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
	ctx: MachineStorageContext,
): Promise<void> {
	assertSafePath(path, ctx.appDataRoot);
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
	const result = await execOnMachine(cmd, {
		timeoutMs: 60_000,
		machineId: ctx.machineId,
	});
	if (result.exitCode !== 0) {
		throw new Error(`writeFile ${path}: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
}

export async function writeJsonFile<T>(
	path: string,
	value: T,
	ctx: MachineStorageContext,
): Promise<void> {
	await writeFile(path, JSON.stringify(value), ctx);
}

export async function deletePath(
	path: string,
	ctx: MachineStorageContext,
): Promise<void> {
	assertSafePath(path, ctx.appDataRoot);
	const result = await execOnMachine(`rm -rf -- ${shellEscape(path)}`, {
		machineId: ctx.machineId,
	});
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
export async function ensureAppDataLayout(ctx: MachineStorageContext): Promise<void> {
	const root = ctx.appDataRoot;
	const cmd = [
		`mkdir -p ${shellEscape(`${root}/chats`)}`,
		`mkdir -p ${shellEscape(`${root}/artifacts`)}`,
		// README is a one-time hint to anyone shelling into the box.
		`if [ ! -f ${shellEscape(`${root}/README.md`)} ]; then ` +
			`echo '# agent-machines persistent state\\n\\n' \\\n` +
			`     'chats/    -- chat sessions started from /dashboard/chat\\n' \\\n` +
			`     'artifacts/ -- files uploaded via /dashboard/artifacts\\n\\n' \\\n` +
			`     'these survive sleep/wake. the running agent can read these as context.' \\\n` +
			`     > ${shellEscape(`${root}/README.md`)}; fi`,
	].join(" && ");
	const result = await execOnMachine(cmd, { machineId: ctx.machineId });
	if (result.exitCode !== 0) {
		throw new Error(`ensureAppDataLayout: exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
	}
}

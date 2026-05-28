/**
 * Incremental exec streaming for dashboard terminal + bootstrap tail.
 *
 * Providers only expose batch `exec`. This layer runs the command in a
 * detached shell on the VM, tees output to a temp log, and polls new
 * bytes back to the control plane while the command runs.
 */

import { randomUUID } from "node:crypto";

import { getProvider } from "@/lib/providers";
import type { ExecStreamEvent, MachineProvider } from "@/lib/providers/types";
import { getUserConfig } from "@/lib/user-config/clerk";

import { resolveMachine } from "./exec";

export type { ExecStreamEvent } from "@/lib/providers/types";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 350;
const READ_CHUNK_BYTES = 8_192;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function bashViaBase64(command: string): string {
	const b64 = Buffer.from(command, "utf8").toString("base64");
	return `printf '%s' '${b64}' | base64 -d | bash --noprofile --norc`;
}

function buildSessionPaths(sessionId: string) {
	const base = `/tmp/am-stream-${sessionId}`;
	return {
		logPath: `${base}.log`,
		exitPath: `${base}.exit`,
		readyPath: `${base}.ready`,
	};
}

function buildLauncher(command: string, paths: ReturnType<typeof buildSessionPaths>): string {
	const inner = bashViaBase64(command);
	const pipePath = paths.logPath.replace(/\.log$/, ".pipe");
	return `
rm -f ${paths.logPath} ${paths.exitPath} ${paths.readyPath} ${pipePath}
: > ${paths.logPath}
mkfifo ${pipePath}
cat ${pipePath} >> ${paths.logPath} &
cat_pid=$!
touch ${paths.readyPath}
stdbuf -oL -eL bash --noprofile --norc -lc ${JSON.stringify(inner)} > ${pipePath} 2>&1
rc=$?
wait $cat_pid 2>/dev/null || true
rm -f ${pipePath}
echo $rc > ${paths.exitPath}
`.trim();
}

async function startBackgroundExec(
	provider: ReturnType<typeof getProvider>,
	machineId: string,
	launcher: string,
): Promise<void> {
	if (provider.execBackground) {
		await provider.execBackground(machineId, launcher);
		return;
	}
	await provider.exec(
		machineId,
		`nohup bash -lc ${JSON.stringify(bashViaBase64(launcher))} >/dev/null 2>&1 &`,
		{ timeoutMs: 15_000 },
	);
}

async function waitForReady(
	provider: ReturnType<typeof getProvider>,
	machineId: string,
	readyPath: string,
): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const probe = await provider.exec(
			machineId,
			`[ -f ${readyPath} ] && echo ok || echo wait`,
			{ timeoutMs: 8_000 },
		);
		if (probe.stdout.trim() === "ok") return;
		await sleep(150);
	}
	throw new Error("exec stream session failed to start on machine");
}

async function readLogDelta(
	provider: ReturnType<typeof getProvider>,
	machineId: string,
	logPath: string,
	offset: number,
): Promise<{ data: string; nextOffset: number }> {
	const readCmd = `
if [ ! -f ${logPath} ]; then exit 0; fi
dd if=${logPath} bs=1 skip=${offset} count=${READ_CHUNK_BYTES} 2>/dev/null
`.trim();
	const result = await provider.exec(machineId, readCmd, { timeoutMs: 12_000 });
	const data = result.stdout ?? "";
	if (!data) return { data: "", nextOffset: offset };
	return { data, nextOffset: offset + Buffer.byteLength(data, "utf8") };
}

async function readExitCode(
	provider: ReturnType<typeof getProvider>,
	machineId: string,
	exitPath: string,
): Promise<number | null> {
	const probe = await provider.exec(
		machineId,
		`[ -f ${exitPath} ] && cat ${exitPath} || true`,
		{ timeoutMs: 8_000 },
	);
	const raw = probe.stdout.trim();
	if (!raw) return null;
	const code = Number.parseInt(raw, 10);
	return Number.isFinite(code) ? code : 0;
}

export async function* execStreamOnMachine(
	command: string,
	options: {
		timeoutMs?: number;
		machineId?: string | null;
		pollMs?: number;
	} = {},
): AsyncGenerator<ExecStreamEvent, void, void> {
	const config = await getUserConfig();
	const machine = resolveMachine(config, options.machineId);
	if (!machine) {
		throw new Error(
			options.machineId
				? `Machine ${options.machineId} not found in your account.`
				: "No active machine selected.",
		);
	}
	const provider = getProvider(machine.providerKind, config.providers);
	yield* streamFromProvider(provider, machine.id, command, {
		timeoutMs: options.timeoutMs,
		pollMs: options.pollMs,
	});
}

/**
 * Stream a command from an already-resolved provider.
 *
 * Prefers the provider's native streaming primitive (E2B `onStdout`, Vercel
 * `Command.logs()`, Sprites `spawn`) when implemented; falls back to
 * log-tail polling for providers that cannot stream (Dedalus REST exec).
 *
 * Provider is injected (no Clerk/config lookups) so this is unit-testable
 * with a stub provider.
 */
export async function* streamFromProvider(
	provider: MachineProvider,
	machineId: string,
	command: string,
	options: { timeoutMs?: number; pollMs?: number } = {},
): AsyncGenerator<ExecStreamEvent, void, void> {
	if (typeof provider.streamExec === "function") {
		yield* provider.streamExec(machineId, command, {
			timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		});
		return;
	}
	yield* pollLogTailStream(provider, machineId, command, options);
}

/**
 * Fallback streaming for providers with no native streaming primitive:
 * launch the command in a detached shell on the VM, tee combined output to
 * a temp log, and poll new bytes from the control plane until an exit
 * marker file appears. Used by Dedalus.
 */
async function* pollLogTailStream(
	provider: MachineProvider,
	machineId: string,
	command: string,
	options: { timeoutMs?: number; pollMs?: number } = {},
): AsyncGenerator<ExecStreamEvent, void, void> {
	const sessionId = randomUUID().replace(/-/g, "").slice(0, 12);
	const paths = buildSessionPaths(sessionId);
	const launcher = buildLauncher(command, paths);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
	const deadline = Date.now() + timeoutMs;

	await startBackgroundExec(provider, machineId, launcher);
	await waitForReady(provider, machineId, paths.readyPath);

	let offset = 0;
	while (Date.now() < deadline) {
		const [{ data, nextOffset }, exitCode] = await Promise.all([
			readLogDelta(provider, machineId, paths.logPath, offset),
			readExitCode(provider, machineId, paths.exitPath),
		]);
		offset = nextOffset;
		if (data) {
			yield { type: "stdout", data };
		}

		if (exitCode !== null) {
			const tail = await readLogDelta(provider, machineId, paths.logPath, offset);
			if (tail.data) {
				yield { type: "stdout", data: tail.data };
			}
			yield { type: "exit", exitCode };
			return;
		}

		await sleep(pollMs);
	}
	throw new Error(`exec stream timed out after ${timeoutMs}ms`);
}

/** Tail a file on the machine until idle or max duration. */
export async function* tailFileStreamOnMachine(
	logPath: string,
	options: {
		machineId?: string | null;
		idleMs?: number;
		maxDurationMs?: number;
		pollMs?: number;
		startOffset?: number;
		stopWhen?: () => Promise<boolean>;
	} = {},
): AsyncGenerator<ExecStreamEvent, void, void> {
	const config = await getUserConfig();
	const machine = resolveMachine(config, options.machineId);
	if (!machine) {
		throw new Error(
			options.machineId
				? `Machine ${options.machineId} not found in your account.`
				: "No active machine selected.",
		);
	}
	const provider = getProvider(machine.providerKind, config.providers);
	const maxDurationMs = options.maxDurationMs ?? 300_000;
	const pollMs = options.pollMs ?? 400;
	const deadline = Date.now() + maxDurationMs;
	let offset = options.startOffset ?? 0;

	while (Date.now() < deadline) {
		if (options.stopWhen && (await options.stopWhen())) {
			return;
		}

		const sizeProbe = await provider.exec(
			machine.id,
			`[ -f ${logPath} ] && wc -c < ${logPath} || echo 0`,
			{ timeoutMs: 8_000 },
		);
		const size = Number.parseInt(sizeProbe.stdout.trim(), 10) || 0;

		if (size > offset) {
			const { data, nextOffset } = await readLogDelta(
				provider,
				machine.id,
				logPath,
				offset,
			);
			offset = nextOffset;
			if (data) {
				yield { type: "stdout", data };
			}
		}

		await sleep(pollMs);
	}
}

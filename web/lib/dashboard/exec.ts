/**
 * Server-side helper that runs a read-only shell command on the live
 * machine via Dedalus's executions API.
 *
 * The dashboard uses this to peek at on-VM state -- list session DBs,
 * tail the gateway log, dump cursor-runs.jsonl. Each call is a single
 * roundtrip create-execution + poll-status + fetch-output, so latency
 * is measured in seconds, not milliseconds. We rate-limit by polling
 * pages every 30s rather than streaming.
 *
 * The dashboard is read-only by contract -- never run a command that
 * mutates state. Use the CLI for that. Commands here should look like
 * `cat`, `tail`, `ls`, never `rm` or `>`.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1000;

type ExecRaw = {
	execution_id: string;
	status: "queued" | "running" | "succeeded" | "failed" | "expired" | "cancelled";
	exit_code?: number | null;
};

type ExecOutputRaw = {
	stdout?: string;
	stderr?: string;
};

export type ExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEnv() {
	const apiKey = process.env.DEDALUS_API_KEY?.trim();
	const baseUrl = (process.env.DEDALUS_BASE_URL ?? "https://dcs.dedaluslabs.ai")
		.trim()
		.replace(/\/$/, "");
	const machineId = process.env.HERMES_MACHINE_ID?.trim();
	if (!apiKey) throw new Error("DEDALUS_API_KEY is not set");
	if (!machineId) throw new Error("HERMES_MACHINE_ID is not set");
	return { apiKey, baseUrl, machineId };
}

async function dedalusFetch(
	apiKey: string,
	url: string,
	init?: RequestInit,
): Promise<Response> {
	return fetch(url, {
		...init,
		headers: {
			"X-API-Key": apiKey,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
		cache: "no-store",
	});
}

export async function execOnMachine(
	command: string,
	options: { timeoutMs?: number } = {},
): Promise<ExecResult> {
	const { apiKey, baseUrl, machineId } = getEnv();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const createResponse = await dedalusFetch(
		apiKey,
		`${baseUrl}/v1/machines/${machineId}/executions`,
		{
			method: "POST",
			body: JSON.stringify({
				command: ["/bin/bash", "-c", command],
				timeout_ms: timeoutMs,
			}),
		},
	);
	if (!createResponse.ok) {
		throw new Error(
			`exec create ${createResponse.status}: ${(await createResponse.text()).slice(0, 200)}`,
		);
	}
	const created = (await createResponse.json()) as ExecRaw;

	let current = created;
	const deadline = Date.now() + timeoutMs + 5000;
	while (
		current.status !== "succeeded" &&
		current.status !== "failed" &&
		current.status !== "expired" &&
		current.status !== "cancelled"
	) {
		if (Date.now() > deadline) {
			throw new Error(`exec poll timed out after ${timeoutMs}ms: ${command.slice(0, 80)}`);
		}
		await sleep(POLL_INTERVAL_MS);
		const pollResponse = await dedalusFetch(
			apiKey,
			`${baseUrl}/v1/machines/${machineId}/executions/${created.execution_id}`,
		);
		if (!pollResponse.ok) {
			throw new Error(
				`exec poll ${pollResponse.status}: ${(await pollResponse.text()).slice(0, 200)}`,
			);
		}
		current = (await pollResponse.json()) as ExecRaw;
	}

	const outputResponse = await dedalusFetch(
		apiKey,
		`${baseUrl}/v1/machines/${machineId}/executions/${created.execution_id}/output`,
	);
	const output: ExecOutputRaw = outputResponse.ok
		? ((await outputResponse.json()) as ExecOutputRaw)
		: {};

	const exitCode = current.exit_code ?? (current.status === "succeeded" ? 0 : 1);
	return {
		stdout: (output.stdout ?? "").trim(),
		stderr: (output.stderr ?? "").trim(),
		exitCode,
	};
}

/**
 * True iff the live machine is currently in a state where an exec is
 * likely to succeed. Routes call this first so they can return a typed
 * "machine_offline" payload instead of timing out.
 */
export async function isMachineRunning(): Promise<boolean> {
	try {
		const { apiKey, baseUrl, machineId } = getEnv();
		const response = await fetch(`${baseUrl}/v1/machines/${machineId}`, {
			headers: { "X-API-Key": apiKey },
			cache: "no-store",
		});
		if (!response.ok) return false;
		const body = (await response.json()) as { status?: { phase?: string } };
		return body.status?.phase === "running";
	} catch {
		return false;
	}
}

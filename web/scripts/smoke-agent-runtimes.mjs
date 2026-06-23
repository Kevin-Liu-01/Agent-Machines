#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:3210";
const AGENTS = ["hermes", "openclaw", "claude-code", "codex"];
const PING = "AM_PING";

const baseUrl = process.env.AGENT_MACHINES_BASE_URL || DEFAULT_BASE_URL;

function jsonFetch(path, init) {
	return fetch(`${baseUrl}${path}`, init).then(async (response) => {
		const text = await response.text();
		let body = {};
		try {
			body = text ? JSON.parse(text) : {};
		} catch {
			body = { raw: text };
		}
		return { response, body };
	});
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellFor(agentKind) {
	const common =
		"cd ~/agent-machines 2>/dev/null || cd ~; " +
		"source ~/.agent-machines/.agent-env 2>/dev/null || true; ";
	switch (agentKind) {
		case "hermes":
			return common +
				"export HERMES_HOME=\"$HOME/.agent-machines\"; " +
				"export PATH=\"$HOME/.agent-machines/venv/bin:$PATH\"; " +
				"echo AM_KIND=hermes; command -v hermes; hermes --version; " +
				"timeout 75s hermes chat --query \"reply exactly AM_HERMES_OK\" --quiet";
		case "openclaw":
			return common +
				"export PATH=\"$HOME/.npm-global/bin:$PATH\"; " +
				"export OPENCLAW_STATE_DIR=\"$HOME/.openclaw\"; export OPENCLAW_NO_RESPAWN=1; " +
				"echo AM_KIND=openclaw; command -v openclaw; (openclaw --version || openclaw --help | head -20); " +
				"timeout 75s openclaw infer model run --prompt \"reply exactly AM_OPENCLAW_OK\" --json";
		case "claude-code":
			return common +
				"echo AM_KIND=claude-code; command -v claude; claude --version; " +
				"timeout 75s claude -p \"reply exactly AM_CLAUDE_OK\" < /dev/null";
		case "codex":
			return common +
				"echo AM_KIND=codex; command -v codex; codex --version; " +
				"timeout 75s codex exec \"reply exactly AM_CODEX_OK\" < /dev/null";
		default:
			throw new Error(`unknown agent kind: ${agentKind}`);
	}
}

function expectedMarker(agentKind) {
	switch (agentKind) {
		case "hermes":
			return "AM_HERMES_OK";
		case "openclaw":
			return "AM_OPENCLAW_OK";
		case "claude-code":
			return "AM_CLAUDE_OK";
		case "codex":
			return "AM_CODEX_OK";
		default:
			return "";
	}
}

function scoreMachine(machine, agentKind) {
	let score = 0;
	if (machine.agentKind === agentKind) score += 100;
	if (!machine.archived) score += 30;
	if (machine.live?.state === "ready") score += 30;
	if (machine.bootstrapState?.phase === "succeeded") score += 25;
	if (machine.apiUrl) score += 5;
	if (machine.bootstrapState?.phase === "failed") score -= 40;
	if (machine.archived) score -= 50;
	return score;
}

function candidatesFor(machines, agentKind) {
	const candidates = machines
		.filter((machine) => machine.agentKind === agentKind && !machine.archived)
		.sort((a, b) => scoreMachine(b, agentKind) - scoreMachine(a, agentKind));
	return candidates;
}

function clean(text) {
	return String(text || "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/\x1b?\](?:10|11|12);rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}(?:\x07|\x1b\\)?/g, "")
		.slice(-1800);
}

function execOutput(body) {
	return `${body.stdout || ""}\n${body.stderr || ""}`;
}

function isOffline(response, body) {
	return response.status === 503 || body?.error === "machine_offline";
}

async function getMachines() {
	const { response, body } = await jsonFetch("/api/dashboard/machines");
	if (!response.ok) {
		throw new Error(`machines API failed: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
	}
	return Array.isArray(body.machines) ? body.machines : [];
}

async function execOnMachine(machineId, command, timeoutMs = 120_000) {
	const started = Date.now();
	const { response, body } = await jsonFetch("/api/dashboard/exec", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ machineId, command, timeoutMs }),
	});
	return { response, body, elapsedMs: body.elapsedMs ?? Date.now() - started };
}

async function wakeMachine(machineId) {
	return jsonFetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}/wake`, {
		method: "POST",
	});
}

async function ensureExecutable(machine) {
	const attempts = [];
	for (let i = 0; i < 5; i++) {
		const run = await execOnMachine(machine.id, `printf ${PING}`, 20_000);
		const output = execOutput(run.body);
		attempts.push({
			httpStatus: run.response.status,
			exitCode: run.body.exitCode ?? null,
			ok: run.response.ok && run.body.ok === true && output.includes(PING),
			error: run.body.error ?? null,
			message: run.body.message ?? null,
			output: clean(output),
		});
		if (attempts.at(-1).ok) return { ok: true, attempts };
		if (!isOffline(run.response, run.body)) break;
		await wakeMachine(machine.id).catch(() => null);
		await sleep(5_000);
	}
	return { ok: false, attempts };
}

async function pickExecutableMachine(machines, agentKind) {
	const probes = [];
	for (const machine of candidatesFor(machines, agentKind)) {
		const probe = await ensureExecutable(machine);
		probes.push({
			machineId: machine.id,
			machineName: machine.name,
			providerKind: machine.providerKind,
			liveState: machine.live?.state ?? null,
			bootstrapPhase: machine.bootstrapState?.phase ?? null,
			attempts: probe.attempts,
		});
		if (probe.ok) return { machine, probes };
	}
	return { machine: null, probes };
}

async function run() {
	const machines = await getMachines();
	const results = [];

	for (const agentKind of AGENTS) {
		const { machine, probes } = await pickExecutableMachine(machines, agentKind);
		if (!machine) {
			results.push({ agentKind, ok: false, reason: "no_usable_machine", probes });
			continue;
		}

		const marker = expectedMarker(agentKind);
		const command = shellFor(agentKind);
		const { response: execResponse, body: execBody, elapsedMs } = await execOnMachine(
			machine.id,
			command,
			120_000,
		);
		const output = execOutput(execBody);
		results.push({
			agentKind,
			machineId: machine.id,
			machineName: machine.name,
			providerKind: machine.providerKind,
			liveState: machine.live?.state ?? null,
			bootstrapPhase: machine.bootstrapState?.phase ?? null,
			probes,
			httpStatus: execResponse.status,
			exitCode: execBody.exitCode ?? null,
			elapsedMs,
			ok: execResponse.ok && execBody.ok === true && output.includes(marker),
			marker,
			output: clean(output),
			error: execBody.error ?? null,
			message: execBody.message ?? null,
		});
	}

	const failed = results.filter((result) => !result.ok);
	console.log(JSON.stringify({ ok: failed.length === 0, baseUrl, results }, null, 2));
	process.exitCode = failed.length === 0 ? 0 : 1;
}

run().catch((error) => {
	console.error(error instanceof Error ? error.stack : error);
	process.exitCode = 1;
});

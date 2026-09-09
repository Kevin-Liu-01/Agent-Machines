#!/usr/bin/env node

import { randomUUID } from "node:crypto";

const AGENTS = ["hermes", "openclaw", "claude-code", "codex"];
const PROVIDERS = ["daytona", "e2b", "sprites", "vercel"];
const HELP = [
	"Managed runtime smoke check: one explicitly selected, already-ready fixture.",
	"",
	"Build the SDK first: pnpm build:sdk",
	"Run from the repo root:",
	"  pnpm --dir web smoke:agents --base-url https://www.agent-machines.dev --machine-id <exact-id> --agent <runtime> --allow-paid-run",
	"",
	"Runtimes: " + AGENTS.join(", "),
	"Set AGENT_MACHINES_API_KEY privately for hosted access. Never pass keys in argv.",
	"Local development may use http://127.0.0.1:3210 with its existing dev session.",
	"No default host, fleet discovery, provision, wake, repair, runtime switch, or deletion.",
	"This submits one potentially billable managed task, not an artifact or launch proof.",
	"Timeout/failure does not cancel accepted remote work: inspect its journal before retrying.",
	"See docs/SMOKE.md and docs/LAUNCH.md for scope and cleanup requirements.",
].join("\n");

class SmokeError extends Error {
	constructor(message, exitCode = 1) {
		super(message);
		this.exitCode = exitCode;
	}
}

function optionsFrom(argv) {
	if (argv[0] === "--") argv = argv.slice(1);
	if (argv.length === 1 && argv[0] === "--help") return null;
	const options = {};
	const flags = new Set(["--base-url", "--machine-id", "--agent", "--allow-paid-run"]);
	for (let index = 0; index < argv.length; index++) {
		const flag = argv[index];
		if (!flags.has(flag) || Object.hasOwn(options, flag)) {
			throw new SmokeError("Unknown or duplicate option. See --help.", 2);
		}
		if (flag === "--allow-paid-run") options[flag] = true;
		else {
			const value = argv[++index];
			if (!value || value.startsWith("--")) throw new SmokeError("Missing option value. See --help.", 2);
			options[flag] = value;
		}
	}
	if (options["--allow-paid-run"] !== true ||
		!AGENTS.includes(options["--agent"]) ||
		!/^[A-Za-z0-9_-]{1,200}$/.test(options["--machine-id"] ?? "")) {
		throw new SmokeError("An exact fixture ID, supported runtime, and --allow-paid-run are required. See --help.", 2);
	}
	let url;
	try { url = new URL(options["--base-url"]); }
	catch { throw new SmokeError("An explicit --base-url origin is required. See --help.", 2); }
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
		(url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
		throw new SmokeError("Use an HTTPS origin (or local HTTP), without credentials, path, query, or fragment.", 2);
	}
	const apiKey = process.env.AGENT_MACHINES_API_KEY?.trim() || "";
	if (!local && !apiKey) throw new SmokeError("Set AGENT_MACHINES_API_KEY privately for this hosted account.", 2);
	return { baseUrl: url.origin, machineId: options["--machine-id"], agent: options["--agent"], apiKey };
}

async function run() {
	const options = optionsFrom(process.argv.slice(2));
	if (!options) { console.log(HELP); return; }
	// Reuse the supported SDK's deadline, operation validation, no-redirect and
	// single-submission behavior; do not maintain another runtime launcher here.
	let sdk;
	try { sdk = await import("agent-machines"); }
	catch { throw new SmokeError("Build the workspace SDK with pnpm build:sdk before this check."); }
	const { baseUrl, machineId, agent, apiKey } = options;
	let inspected;
	try {
		const response = await fetch(baseUrl + "/api/dashboard/machines/" + encodeURIComponent(machineId), {
			headers: apiKey ? { Authorization: "Bearer " + apiKey } : {},
			redirect: "error",
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) throw new Error("inspection failed");
		inspected = await response.json();
	} catch {
		throw new SmokeError("Fixture inspection failed. Check the canonical origin, account access, and exact machine ID. No run submitted.");
	}
	const machine = inspected?.machine;
	if (inspected?.ok !== true || machine?.id !== machineId || machine.agentKind !== agent ||
		machine.archived || !PROVIDERS.includes(machine.providerKind) ||
		machine.bootstrapState?.phase !== "succeeded" || inspected.live?.state !== "ready" ||
		typeof machine.model !== "string" || !machine.model.trim()) {
		throw new SmokeError("Fixture identity/runtime or ready state did not match. Inspect it in the dashboard; no run, wake, or repair submitted.");
	}
	const marker = "AM_SMOKE_" + randomUUID().replaceAll("-", "");
	const client = new sdk.AgentMachines({ baseUrl, apiKey, timeoutMs: 90_000 });
	const route = sdk.resolveAgentRoute({ agent, sandbox: machine.providerKind, model: machine.model });
	let result;
	try {
		result = await client.run(machineId, route, "Reply exactly " + marker + ". Do not use tools or change files.");
	} catch {
		// Server/provider errors can contain private diagnostics. Keep them out of
		// CLI output and never replay a mutation after an ambiguous response.
		throw new SmokeError("Managed run failed or its outcome is uncertain. Inspect this Worker's operation journal before retrying; accepted work may still be running.");
	}
	if (result.agent !== agent || result.text.trim() !== marker) {
		throw new SmokeError("Managed run did not return the expected runtime and exact response marker. No retry submitted.");
	}
	console.log(JSON.stringify({ ok: true, proof: "managed-response", machineId, agent, marker }));
}

run().catch((error) => {
	console.error(error instanceof SmokeError ? error.message : "Smoke check failed. Inspect the fixture before retrying; no automatic retry was submitted.");
	process.exitCode = error instanceof SmokeError ? error.exitCode : 1;
});

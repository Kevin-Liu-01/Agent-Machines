import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/smoke-agent-runtimes.mjs", import.meta.url));
const matrix = fileURLToPath(new URL("../../../scripts/verify-agent-provider-matrix.sh", import.meta.url));
const approved = ["--base-url", "https://www.agent-machines.dev", "--machine-id", "fixture-123", "--agent", "codex", "--allow-paid-run"];

function run(args = approved, scenario = "success", key = "fake-account-key") {
	// The child runs the actual CLI and packaged SDK. Replace only HTTP; no
	// server, model, sandbox, local credentials, or existing fleet is consulted.
	const preload = `
		const scenario = ${JSON.stringify(scenario)};
		let marker;
		const result = () => ({ text: scenario === 'wrong-marker' ? 'codex --version: available' : marker, exitCode: scenario === 'failed-run' ? 1 : 0, events: [] });
		globalThis.fetch = async (url, init = {}) => {
			const path = new URL(url).pathname;
			const method = init.method || 'GET';
			console.log('FETCH ' + method + ' ' + path);
			if (init.redirect !== 'error') throw new Error('redirects must fail closed');
			if (scenario === 'transport-failed') throw new Error('private-error-fake-account-key');
			if (path === '/api/dashboard/machines/fixture-123' && method === 'GET') {
				return Response.json({ ok: true, machine: { id: scenario === 'wrong-id' ? 'other-fixture' : 'fixture-123', agentKind: scenario === 'wrong-agent' ? 'hermes' : 'codex', providerKind: 'daytona', model: 'gpt-5.6-sol', archived: scenario === 'archived', bootstrapState: { phase: scenario === 'bootstrap-incomplete' ? 'running' : 'succeeded' } }, live: { state: scenario === 'sleeping' ? 'sleeping' : 'ready' } });
			}
			if (path === '/api/agents/run' && method === 'POST') {
				const body = JSON.parse(init.body);
				if (body.machineId !== 'fixture-123') throw new Error('wrong fixture');
				marker = body.prompt.match(/AM_SMOKE_[a-f0-9]+/)?.[0];
				if (!marker) throw new Error('missing challenge');
				return Response.json({ ok: true, machineId: body.machineId, agent: 'codex', model: 'gpt-5.6-sol', operation: { id: 'run-123', workerId: 'worker-123', status: scenario === 'queued' ? 'queued' : 'succeeded', result: result() } }, { status: scenario === 'queued' ? 202 : 200 });
			}
			if (path === '/api/dashboard/control-plane/operations/run-123' && method === 'GET') {
				return Response.json({ machineId: 'fixture-123', operation: { id: 'run-123', workerId: 'worker-123', status: 'succeeded', result: result() } });
			}
			return Response.json({ error: 'unexpected_path', machines: [] }, { status: 404 });
		};
	`;
	return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, script, ...args], {
		encoding: "utf8",
		timeout: 10_000,
		env: { NODE_ENV: "test", PATH: process.env.PATH, AGENT_MACHINES_API_KEY: key },
	});
}

describe("explicit-fixture managed runtime smoke command", () => {
	it.each([
		[],
		approved.filter((value) => value !== "--allow-paid-run"),
		[...approved.slice(0, 2), "--agent", "codex", "--allow-paid-run"],
		[...approved, "--machine-id", "other-fixture"],
		approved.map((value) => value === "fixture-123" ? "*" : value),
		approved.map((value) => value === "codex" ? "unknown" : value),
		approved.map((value) => value === "https://www.agent-machines.dev" ? "https://user:password@example.com" : value),
		approved.map((value) => value === "https://www.agent-machines.dev" ? "http://example.com" : value),
		approved.map((value) => value === "https://www.agent-machines.dev" ? "https://example.com/path?key=private" : value),
	].map((args) => ({ args })))("invariant_unapproved_or_ambiguous_scope_never_contacts_the_network (%j)", ({ args }) => {
		const result = run(args);
		expect(result.status).toBe(2);
		expect(result.stdout).not.toContain("FETCH");
	});

	it("invariant_hosted_authentication_requires_an_explicit_account_key", () => {
		const result = run(approved, "success", "");
		expect(result.status).toBe(2);
		expect(result.stdout).not.toContain("FETCH");
	});

	it.each(["sleeping", "wrong-id", "wrong-agent", "archived", "bootstrap-incomplete"])("invariant_unready_or_mismatched_fixture_never_starts_paid_work (%s)", (scenario) => {
		const result = run(approved, scenario);
		expect(result.status).toBe(1);
		expect(result.stdout.match(/FETCH /g)).toHaveLength(1);
		expect(result.stdout).not.toContain("FETCH POST");
	});

	it.each(["success", "queued"])("invariant_execution_proof_uses_one_managed_run_on_the_exact_fixture (%s)", (scenario) => {
		const result = run(approved, scenario);
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout.match(/FETCH POST/g)).toHaveLength(1);
		expect(result.stdout).toContain("FETCH POST /api/agents/run");
		expect(result.stdout).toContain('"ok":true');
		expect(result.stdout).toContain('"proof":"managed-response"');
		if (scenario === "queued") expect(result.stdout).toContain("FETCH GET /api/dashboard/control-plane/operations/run-123");
		expect(result.stdout).not.toMatch(/\/wake|\/bootstrap|\/provision|\/exec|\/gateway/);
	});

	it.each(["wrong-marker", "failed-run", "transport-failed"])("invariant_failed_or_ambiguous_execution_never_passes_or_replays (%s)", (scenario) => {
		const result = run(approved, scenario);
		expect(result.status).toBe(1);
		expect(result.stdout).not.toContain('"ok":true');
		expect((result.stdout.match(/FETCH POST/g) ?? []).length).toBeLessThanOrEqual(1);
		expect(result.stderr).not.toContain("fake-account-key");
	});

	it("invariant_help_is_read_only", () => {
		const result = run(["--help"]);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("--allow-paid-run");
		expect(result.stdout).not.toContain("FETCH");
	});

	it("design_legacy_matrix_is_a_non_mutating_deprecation_entry_point", () => {
		const source = readFileSync(matrix, "utf8");
		expect(source).not.toMatch(/curl |provision\(\)|wake_machine\(\)/);
		expect(source).toContain("smoke:agents");
		expect(source).toContain("exit 2");
	});
});

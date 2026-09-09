import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { DaytonaConfig } from "@daytona/sdk";
import { createDaytonaProvider, DAYTONA_PREVIEW_TTL_SECONDS, type DaytonaClient } from "./daytona.js";
import { isRoutableError } from "../types.js";

function fixture() {
	const calls: { method: string; args: unknown[] }[] = [];
	let config: DaytonaConfig | undefined;
	let error: unknown;
	const log = (method: string, ...args: unknown[]) => { calls.push({ method, args }); };
	const sandbox = {
		id: "sandbox-fixture", name: "fixture", state: "started", cpu: 1, memory: 1, disk: 3,
		labels: {} as Record<string, string>,
		createdAt: "2026-09-09T00:00:00Z",
		async start(...args: unknown[]) { log("start", ...args); sandbox.state = "started"; },
		async stop(...args: unknown[]) { log("stop", ...args); sandbox.state = "stopped"; },
		async delete(...args: unknown[]) { log("delete", ...args); sandbox.state = "destroyed"; },
		async refreshData() { log("refresh"); },
		async resize(resources: Record<string, number>, ...args: unknown[]) { log("resize", resources, ...args); Object.assign(sandbox, resources); },
		async getSignedPreviewUrl(...args: unknown[]) { log("preview", ...args); return { url: "https://fixture.invalid/signed-ephemeral" }; },
		fs: { async uploadFile(...args: unknown[]) { log("uploadFile", ...args); } },
		process: {
			async createSession(...args: unknown[]) { log("createSession", ...args); },
			async executeSessionCommand(...args: unknown[]) { log("executeSessionCommand", ...args); return { cmdId: "command", stdout: "output", stderr: "diagnostic", exitCode: 7 }; },
			async deleteSession(...args: unknown[]) { log("deleteSession", ...args); },
			async getSessionCommand() { return { exitCode: 7 }; },
			async getSessionCommandLogs() { return { stdout: "output", stderr: "diagnostic" }; },
			async listPtySessions() { log("listPtySessions"); return [] as { id: string }[]; },
			async createPty(options: { onData: (data: Uint8Array) => void }) { log("createPty", options); options.onData(Buffer.from("terminal")); return pty; },
			async connectPty(...args: unknown[]) { log("connectPty", ...args); return pty; },
		},
	};
	const pty = {
		async waitForConnection() { log("ptyReady"); },
		async wait() { return new Promise<{ exitCode: number }>(() => {}); },
		async sendInput(...args: unknown[]) { log("ptyInput", ...args); },
		async resize(...args: unknown[]) { log("ptyResize", ...args); },
		async kill() { log("ptyKill"); },
		async disconnect() { log("ptyDisconnect"); },
	};
	const client = {
		async create(...args: unknown[]) { log("create", ...args); if (error) throw error; const params = args[0] as { resources?: Record<string, number>; labels?: Record<string, string> }; if (params.resources) Object.assign(sandbox, params.resources); sandbox.labels = { ...params.labels }; return sandbox; },
		async get(...args: unknown[]) { log("get", ...args); if (error) throw error; return sandbox; },
		async *list(...args: unknown[]) { log("list", ...args); yield sandbox; },
	};
	const factory = (value: DaytonaConfig) => { config = value; return client as unknown as DaytonaClient; };
	const provider = createDaytonaProvider({ apiKey: "fixture-key" }, factory);
	return { provider, sandbox, client, calls, factory, get config() { return config; }, setError(value: unknown) { error = value; } };
}

function partialCreationFixture() {
	const f = fixture();
	const create = f.client.create;
	// SDK 0.211.2 POSTs the resource, then waits for startup before returning
	// its handle. A startup timeout loses that handle and the ID in its error.
	f.client.create = async (...args: unknown[]) => {
		await create(...args);
		throw new Error("Failed to create and start sandbox within 120 seconds. Operation timed out.");
	};
	return f;
}

test("invariant_startup_timeout_rolls_back_only_the_record_proven_created_by_this_request", async () => {
	const f = partialCreationFixture();
	await assert.rejects(f.provider.create({ name: "user-chosen-name" }), /timed out/);
	const label = f.sandbox.labels["agent-machines-create-id"];
	assert.match(label ?? "", /^[0-9a-f-]{36}$/);
	assert.deepEqual(f.calls.find((call) => call.method === "list")?.args, [{ labels: { "agent-machines-create-id": label }, limit: 2 }]);
	assert.deepEqual(f.calls.filter((call) => call.method === "get").map((call) => call.args), [["sandbox-fixture"]]);
	assert.deepEqual(f.calls.filter((call) => call.method === "delete").map((call) => call.args), [[120, true]]);
	assert.equal(f.calls.filter((call) => call.method === "create").length, 1);
});

test("invariant_installed_sdk_startup_failure_cannot_hide_the_created_resource_from_rollback", async (t) => {
	const { Daytona, Sandbox, DaytonaTimeoutError } = await import("@daytona/sdk");
	const f = fixture();
	const wait = t.mock.method(Sandbox.prototype, "waitUntilStarted", async () => { throw new DaytonaTimeoutError("startup wait timed out"); });
	let posts = 0;
	// Run the installed SDK's actual create method through its post-acceptance
	// startup failure. Only transport and the state waiter are substituted;
	// no real Daytona client constructor, socket, or network is used.
	const client = Object.assign(Object.create(Daytona.prototype), {
		target: "us", requestTimeoutMs: 30_000,
		clientConfig: { basePath: "https://fixture.invalid", baseOptions: { headers: {} } },
		eventSubscriptionManager: { subscribe: () => "fixture-subscription" },
		async ensureToolboxProxyUrl(dto: unknown) { return dto; },
		sandboxApi: { async createSandbox(params: { labels: Record<string, string> }) {
			posts++; f.sandbox.labels = { ...params.labels };
			return { data: { id: f.sandbox.id, labels: params.labels, state: "starting", toolboxProxyUrl: "https://fixture.invalid/toolbox" } };
		} },
		get: f.client.get, list: f.client.list,
	}) as InstanceType<typeof Daytona>;
	const provider = createDaytonaProvider({ apiKey: "fixture-key" }, () => client);
	await assert.rejects(provider.create(), /Failed to create and start sandbox within 120 seconds/);
	assert.equal(posts, 1);
	assert.equal(wait.mock.callCount(), 1);
	assert.deepEqual(f.calls.filter((call) => call.method === "delete").map((call) => call.args), [[120, true]]);
});

test("invariant_conflicting_names_are_never_sufficient_proof_for_rollback", async () => {
	const f = fixture();
	f.sandbox.name = "existing-worker";
	f.setError(Object.assign(new Error("Name already exists"), { statusCode: 409 }));
	await assert.rejects(f.provider.create({ name: "existing-worker" }));
	assert.equal(f.calls.some((call) => ["delete", "get"].includes(call.method)), false);
});

test("invariant_ambiguous_creation_results_cannot_delete_or_silently_retry", async () => {
	for (const mode of ["not-visible", "unrelated-record", "duplicate", "lookup-failed", "label-changed", "identity-changed"] as const) {
		const f = partialCreationFixture();
		if (mode === "not-visible") f.client.list = async function* () {};
		if (mode === "unrelated-record") f.client.list = async function* () { yield { ...f.sandbox, labels: {} }; };
		if (mode === "duplicate") f.client.list = async function* () { yield f.sandbox; yield { ...f.sandbox, id: "another" }; throw new Error("must not fetch another page"); };
		if (mode === "lookup-failed") f.client.list = async function* () { throw new Error("lookup unavailable"); };
		if (mode === "label-changed") f.client.get = async () => ({ ...f.sandbox, labels: {} });
		if (mode === "identity-changed") f.client.get = async () => ({ ...f.sandbox, id: "another" });
		await assert.rejects(f.provider.create(), (error: unknown) => {
			assert.equal((error as { kind: string }).kind, "not_supported", mode);
			assert.equal(isRoutableError(error), false, mode);
			assert.match((error as Error).message, /agent-machines-create-id=[0-9a-f-]{36}/, mode);
			assert.match((error as Error).message, /manual review required/i, mode);
			return true;
		});
		assert.equal(f.calls.some((call) => call.method === "delete"), false, mode);
		assert.equal(f.calls.filter((call) => call.method === "create").length, 1, mode);
	}
});

test("invariant_failed_partial_creation_rollback_reports_the_exact_orphan", async () => {
	const f = partialCreationFixture();
	f.sandbox.delete = async () => { throw new Error("delete unavailable"); };
	await assert.rejects(f.provider.create(), /sandbox-fixture; manual cleanup required/);
});

test("invariant_expired_creation_lookup_cannot_delete_a_late_result", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = partialCreationFixture();
	let markEntered!: () => void, release!: () => void;
	const entered = new Promise<void>((resolve) => { markEntered = resolve; });
	const blocked = new Promise<void>((resolve) => { release = resolve; });
	f.client.list = async function* () { markEntered(); await blocked; yield f.sandbox; };
	const rejected = assert.rejects(f.provider.create(), /manual review required.*Creation lookup timed out/);
	await entered;
	t.mock.timers.tick(30_000);
	await rejected;
	release();
	for (let i = 0; i < 10; i++) await Promise.resolve();
	assert.equal(f.calls.some((call) => call.method === "delete"), false);
});

test("invariant_creation_provenance_is_unique_even_when_the_name_is_reused", async () => {
	const f = fixture();
	await f.provider.create({ name: "same" });
	await f.provider.create({ name: "same" });
	const labels = f.calls.filter((call) => call.method === "create").map((call) => (call.args[0] as { labels?: Record<string, string> }).labels?.["agent-machines-create-id"]);
	assert.equal(new Set(labels).size, 2);
	assert.equal(f.calls.some((call) => call.method === "list"), false);
});

test("invariant_credentials_fail_closed_before_loading_the_optional_sdk", async () => {
	let loaded = false;
	const provider = createDaytonaProvider({}, () => { loaded = true; throw new Error("must not load"); });
	assert.deepEqual(provider.ready(), { ok: false, missing: ["DAYTONA_API_KEY"] });
	await assert.rejects(provider.create(), /DAYTONA_API_KEY/);
	assert.equal(loaded, false);
});

test("invariant_new_workers_are_private_durable_and_all_requests_have_finite_deadlines", async () => {
	const f = fixture();
	await f.provider.create({ name: "QA", env: { ROLE: "research" } });
	assert.equal(f.config?.requestTimeoutMs, 30_000);
	assert.equal(f.config?.apiUrl, "https://app.daytona.io/api");
	const call = f.calls.find((item) => item.method === "create")!;
	assert.deepEqual(call.args, [{ language: "typescript", snapshot: undefined, envVars: { ROLE: "research" }, name: "QA", labels: f.sandbox.labels, public: false, ephemeral: false, autoDeleteInterval: -1, ttlMinutes: 0, autoPauseInterval: 0, autoStopInterval: 0 }, { timeout: 120 }]);
});

test("invariant_reading_or_connecting_a_stopped_worker_never_starts_it", async () => {
	const f = fixture(); f.sandbox.state = "stopped";
	const h = await f.provider.connect("sandbox-fixture");
	assert.equal(await h.state(), "sleeping");
	assert.deepEqual((await f.provider.describe!(h.id)).resources, { vcpu: 1, memoryMib: 1024, diskGib: 3 });
	assert.equal((await f.provider.list())[0]?.state, "sleeping");
	assert.equal(f.calls.some((call) => call.method === "start"), false);
	await h.wake();
	assert.deepEqual(f.calls.filter((call) => call.method === "start").map((call) => call.args), [[120]]);
});

test("invariant_stop_and_destroy_do_not_start_the_worker", async () => {
	const f = fixture(); await f.provider.park!(f.sandbox.id); await f.provider.remove!(f.sandbox.id);
	assert.deepEqual(f.calls.filter((call) => ["start", "stop", "delete"].includes(call.method)), [{ method: "stop", args: [120] }, { method: "delete", args: [120, true] }]);
});

test("invariant_only_missing_records_are_treated_as_destroyed", async () => {
	const f = fixture();
	f.setError(Object.assign(new Error("Sandbox not found"), { statusCode: 404 }));
	assert.deepEqual(await f.provider.describe!("missing"), { state: "destroyed", rawPhase: null });
	await f.provider.remove!("missing");
	await assert.rejects(f.provider.park!("missing"));
	for (const statusCode of [401, 403, 429, 500]) {
		f.setError(Object.assign(new Error("provider unavailable"), { statusCode }));
		await assert.rejects(f.provider.describe!("existing"));
		await assert.rejects(f.provider.remove!("existing"));
	}
	f.setError(Object.assign(new Error("Cannot GET /api/sandbox/existing"), { statusCode: 404 }));
	await assert.rejects(f.provider.describe!("existing"), /Cannot GET/);
	await assert.rejects(f.provider.remove!("existing"), /Cannot GET/);
});

test("invariant_requested_allocation_is_verified_before_the_worker_is_returned", async () => {
	const f = fixture(); await f.provider.create({ resources: { vcpu: 2, memoryMib: 2048, diskGib: 4 } });
	const params = f.calls.find((call) => call.method === "create")!.args[0] as { image: string; resources: Record<string, number> };
	assert.equal(params.image, "daytonaio/sandbox:0.8.0");
	assert.deepEqual(params.resources, { cpu: 2, memory: 2, disk: 4 });
	assert.deepEqual(f.calls.filter((call) => ["stop", "resize", "start", "refresh"].includes(call.method)), [{ method: "refresh", args: [] }]);
	assert.deepEqual((await f.provider.describe!(f.sandbox.id)).resources, { vcpu: 2, memoryMib: 2048, diskGib: 4 });
});

test("invariant_snapshot_size_cannot_silently_override_requested_resources", async () => {
	const f = fixture();
	await assert.rejects(f.provider.create({ template: "custom-snapshot", resources: { memoryMib: 2048 } }), /snapshot.*resources/i);
	assert.equal(f.calls.length, 0);
});

test("invariant_unapplied_allocation_rolls_back_only_the_new_sandbox", async () => {
	const f = fixture(); f.sandbox.refreshData = async () => { f.sandbox.memory = 1; };
	await assert.rejects(f.provider.create({ resources: { memoryMib: 2048 } }), /allocation verification failed/);
	assert.deepEqual(f.calls.filter((call) => call.method === "delete").map((call) => call.args), [[120, true]]);
});

test("invariant_failed_provisioning_cleanup_identifies_the_orphan", async () => {
	const f = fixture(); f.sandbox.refreshData = async () => { throw new Error("allocation lookup failed"); };
	f.sandbox.delete = async () => { throw new Error("provider down"); };
	await assert.rejects(f.provider.create({ resources: { memoryMib: 2048 } }), /sandbox-fixture; manual cleanup required/);
});

test("invariant_invalid_resources_or_timeouts_cannot_create_billable_compute", async () => {
	for (const value of [0, -1, NaN, Infinity]) {
		const f = fixture();
		await assert.rejects(f.provider.create({ resources: { memoryMib: value } }));
		await assert.rejects(f.provider.create({ timeoutMs: value }));
		assert.equal(f.calls.length, 0);
	}
});

test("invariant_exec_keeps_stdout_stderr_and_nonzero_exit_status", async () => {
	const f = fixture(); const h = await f.provider.connect(f.sandbox.id);
	const result = await h.exec("echo hello", { timeoutMs: 1500 });
	assert.equal(result.stdout, "output"); assert.equal(result.stderr, "diagnostic"); assert.equal(result.exitCode, 7);
	const call = f.calls.find((item) => item.method === "executeSessionCommand")!;
	assert.equal(call.args[2], 12);
	assert.match((call.args[1] as { command: string }).command, /timeout --signal=TERM --kill-after=5s 2s/);
	assert.equal(f.calls.filter((item) => item.method === "deleteSession").length, 1);
});

test("invariant_command_environment_and_directory_are_shell_quoted", async () => {
	const f = fixture(); const h = await f.provider.connect(f.sandbox.id);
	const value = "$(printf injected); 'literal'";
	await h.exec('printf "%s" "$FIXTURE"', { env: { FIXTURE: value }, cwd: "/tmp" });
	const line = (f.calls.find((item) => item.method === "executeSessionCommand")!.args[1] as { command: string }).command;
	// macOS has no GNU timeout. This executable fixture forwards its argv, so
	// the exact emitted shell still runs and proves quoting across both shells.
	const directory = mkdtempSync(`${tmpdir()}/am-daytona-shell-`);
	try {
		writeFileSync(`${directory}/timeout`, '#!/bin/sh\nshift 3\nexec "$@"\n', { mode: 0o700 });
		const output = execFileSync("bash", ["-c", line], { env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		assert.equal(output, value);
	} finally { rmSync(directory, { recursive: true, force: true }); }
	await assert.rejects(h.exec("true", { env: { "BAD;echo injected": "value" } }), /environment variable/);
});

test("invariant_streaming_emits_separate_incremental_output_and_real_exit", async () => {
	const f = fixture(); const h = await f.provider.connect(f.sandbox.id);
	const events = []; for await (const event of h.execStream("fixture")) events.push(event);
	assert.deepEqual(events, [{ type: "stdout", data: "output" }, { type: "stderr", data: "diagnostic" }, { type: "exit", exitCode: 7 }]);
	assert.equal(f.calls.filter((item) => item.method === "deleteSession").length, 1);
});

test("invariant_cancelled_stream_cannot_start_a_remote_command", async () => {
	const f = fixture(); const h = await f.provider.connect(f.sandbox.id);
	const abort = new AbortController(); abort.abort();
	await assert.rejects(async () => { for await (const _ of h.execStream("never", { signal: abort.signal })) {} });
	assert.equal(f.calls.some((item) => item.method === "createSession"), false);
});

test("invariant_native_terminal_reattach_does_not_rerun_its_initial_command", async () => {
	const f = fixture(); f.sandbox.process.listPtySessions = async () => [{ id: "named" }];
	const h = await f.provider.connect(f.sandbox.id);
	const pty = await h.openPty({ session: "named", command: "must-not-rerun" });
	await pty.write("input"); await pty.resize(120, 30); await pty.close();
	assert.equal(f.calls.some((item) => item.method === "createPty"), false);
	assert.deepEqual(f.calls.filter((item) => item.method === "ptyInput").map((item) => item.args), [["input"]]);
	assert.equal(f.calls.some((item) => item.method === "ptyKill"), false);
	assert.equal(await pty.exited, null);
});

test("invariant_anonymous_terminal_close_reaps_its_process", async () => {
	const f = fixture(); const h = await f.provider.connect(f.sandbox.id);
	const pty = await h.openPty(); await pty.close();
	assert.equal(f.calls.some((item) => item.method === "ptyKill"), true);
	const chunks = []; for await (const chunk of pty.output) chunks.push(Buffer.from(chunk).toString());
	assert.deepEqual(chunks, ["terminal"]);
});

test("invariant_file_bytes_are_not_interpreted_as_paths_or_shell", async () => {
	const f = fixture(); const h = await f.provider.connect(f.sandbox.id);
	await h.writeFile("/home/daytona/quoted file", "$(not a command)");
	assert.deepEqual(f.calls.find((item) => item.method === "uploadFile")?.args, [Buffer.from("$(not a command)"), "/home/daytona/quoted file"]);
});

test("invariant_url_only_previews_are_private_expiring_and_fresh", async () => {
	const f = fixture(); const h = await f.provider.connect(f.sandbox.id);
	await h.publicUrl(3000); await h.publicUrl(3000); assert.equal(await h.publicUrl(0), null);
	assert.deepEqual(f.calls.filter((item) => item.method === "preview").map((item) => item.args), [[3000, DAYTONA_PREVIEW_TTL_SECONDS], [3000, DAYTONA_PREVIEW_TTL_SECONDS]]);
});

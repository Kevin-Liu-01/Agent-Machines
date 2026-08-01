/**
 * The no-wake contract members -- describe(), remove(), park() -- on all four
 * substrate adapters.
 *
 * Run: npx tsx --test src/mux/providers/no-wake.test.ts
 *
 * Every assertion here is NEGATIVE, and that is the point. "describe()
 * returned a state" passes with the bug present: connect() + handle.state()
 * returns a state too, after resuming and billing a parked sandbox. What has
 * to be proven is that the resuming entry point is never reached --
 * `Sandbox.connect` on e2b, `Sandbox.get` with resume defaulted or true on
 * vercel, an exec against the sprite on sprites, and an execution POST on
 * dedalus (submitting one is what wakes a sleeping machine there).
 *
 * Each suite also drives the resuming path once, so "connect was not called"
 * cannot pass merely because the fake records nothing.
 *
 * No network and no vendor SDK: three factories take an override for the SDK
 * surface they drive, and dedalus is driven through a stubbed global fetch.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SpritesClient } from "@fly/sprites";

import { MuxError, type SandboxProvider } from "../types.js";
import { createDedalusProvider } from "./dedalus.js";
import { createE2bProvider, type E2bSdk } from "./e2b.js";
import { createSpritesProvider } from "./sprites.js";
import { createVercelProvider } from "./vercel.js";

const CREATED_AT = "2026-08-01T00:00:00.000Z";

/** Any adapter must have these; the optional members are asserted per lane. */
function requireDescribe(provider: SandboxProvider): NonNullable<SandboxProvider["describe"]> {
	assert.ok(provider.describe, "provider does not implement describe()");
	return provider.describe.bind(provider);
}

function requireRemove(provider: SandboxProvider): NonNullable<SandboxProvider["remove"]> {
	assert.ok(provider.remove, "provider does not implement remove()");
	return provider.remove.bind(provider);
}

function requirePark(provider: SandboxProvider): NonNullable<SandboxProvider["park"]> {
	assert.ok(provider.park, "provider does not implement park()");
	return provider.park.bind(provider);
}

async function rejectsWith(
	run: () => Promise<unknown>,
	kind: MuxError["kind"],
	pattern?: RegExp,
): Promise<void> {
	await assert.rejects(run, (error: unknown) => {
		assert.ok(error instanceof MuxError, `not a MuxError: ${String(error)}`);
		assert.equal(error.kind, kind, `kind for: ${error.message}`);
		if (pattern) assert.match(error.message, pattern);
		return true;
	});
}

// ---------------------------------------------------------------------------
// e2b: statics only. Sandbox.connect is the resuming call and must not appear.
// ---------------------------------------------------------------------------

/** SandboxNotFoundError is what getInfo/pause throw on a 404. */
function e2bNotFound(id: string): Error {
	const error = new Error(`Sandbox ${id} not found`);
	error.name = "SandboxNotFoundError";
	return error;
}

type FakeE2bInfo = {
	sandboxId: string;
	state: "running" | "paused";
	startedAt: Date;
	cpuCount: number;
	memoryMB: number;
};

class FakeE2bStatics {
	/** Every static the adapter reached, in order. */
	readonly calls: string[] = [];
	info: FakeE2bInfo = {
		sandboxId: "sbx-1",
		state: "paused",
		startedAt: new Date(CREATED_AT),
		cpuCount: 2,
		memoryMB: 478,
	};
	missing = false;
	/** The SDK returns false (vendor 409) when the sandbox is already paused. */
	pauseResult = true;

	async getInfo(id: string, opts?: { apiKey?: string }): Promise<FakeE2bInfo> {
		this.calls.push(`getInfo:${id}:${opts?.apiKey ?? ""}`);
		if (this.missing) throw e2bNotFound(id);
		return this.info;
	}

	async kill(id: string, opts?: { apiKey?: string }): Promise<boolean> {
		this.calls.push(`kill:${id}:${opts?.apiKey ?? ""}`);
		return !this.missing;
	}

	async pause(id: string, opts?: { apiKey?: string }): Promise<boolean> {
		this.calls.push(`pause:${id}:${opts?.apiKey ?? ""}`);
		if (this.missing) throw e2bNotFound(id);
		return this.pauseResult;
	}

	/** The resuming entry point. Recorded so its absence means something. */
	async connect(id: string): Promise<{ sandboxId: string }> {
		this.calls.push(`connect:${id}`);
		return { sandboxId: id };
	}
}

function e2bProvider(
	statics: FakeE2bStatics,
	creds: { apiKey?: string } = { apiKey: "e2b-key" },
): SandboxProvider {
	return createE2bProvider(creds, { Sandbox: statics } as unknown as E2bSdk);
}

/** Guard against a vacuous "connect was not called". */
test("e2b: the fake records Sandbox.connect when the adapter resumes", async () => {
	const statics = new FakeE2bStatics();
	await e2bProvider(statics).connect("sbx-1");
	assert.deepEqual(statics.calls, ["connect:sbx-1"]);
});

test("e2b describe reads the record and never connects", async () => {
	const statics = new FakeE2bStatics();
	const description = await requireDescribe(e2bProvider(statics))("sbx-1");
	assert.deepEqual(statics.calls, ["getInfo:sbx-1:e2b-key"]);
	assert.deepEqual(description, {
		state: "sleeping",
		rawPhase: "paused",
		createdAt: CREATED_AT,
		resources: { vcpu: 2, memoryMib: 478 },
	});
});

test("e2b describe reports a vanished sandbox as destroyed without connecting", async () => {
	const statics = new FakeE2bStatics();
	statics.missing = true;
	const description = await requireDescribe(e2bProvider(statics))("sbx-gone");
	assert.deepEqual(description, { state: "destroyed", rawPhase: null });
	assert.deepEqual(statics.calls, ["getInfo:sbx-gone:e2b-key"]);
});

test("e2b remove kills by id and never connects first", async () => {
	const statics = new FakeE2bStatics();
	await requireRemove(e2bProvider(statics))("sbx-1");
	// The postmortem case: connect() resumes, so a sandbox whose snapshot
	// cannot resume would be undestroyable if this took the handle path.
	assert.deepEqual(statics.calls, ["kill:sbx-1:e2b-key"]);
});

test("e2b remove is idempotent for an id the vendor no longer knows", async () => {
	const statics = new FakeE2bStatics();
	statics.missing = true;
	await requireRemove(e2bProvider(statics))("sbx-gone");
	assert.deepEqual(statics.calls, ["kill:sbx-gone:e2b-key"]);
});

test("e2b park pauses by id, and an already-paused sandbox is a no-op", async () => {
	const statics = new FakeE2bStatics();
	statics.pauseResult = false;
	await requirePark(e2bProvider(statics))("sbx-1");
	assert.deepEqual(statics.calls, ["pause:sbx-1:e2b-key"]);
});

test("e2b park surfaces an unknown id instead of swallowing it", async () => {
	const statics = new FakeE2bStatics();
	statics.missing = true;
	await rejectsWith(() => requirePark(e2bProvider(statics))("sbx-gone"), "fatal", /not found/i);
});

test("e2b no-wake reads fail closed without credentials and touch no SDK", async () => {
	const statics = new FakeE2bStatics();
	const provider = e2bProvider(statics, {});
	await rejectsWith(
		() => requireDescribe(provider)("sbx-1"),
		"missing_credentials",
		/E2B_API_KEY/,
	);
	await rejectsWith(() => requireRemove(provider)("sbx-1"), "missing_credentials");
	await rejectsWith(() => requirePark(provider)("sbx-1"), "missing_credentials");
	assert.deepEqual(statics.calls, []);
});

// ---------------------------------------------------------------------------
// vercel: Sandbox.get DEFAULTS to resume: true, so the flag itself is the test.
// ---------------------------------------------------------------------------

function vercelNotFound(): Error {
	const error = new Error("sandbox not_found") as Error & {
		response: { status: number };
	};
	error.response = { status: 404 };
	return error;
}

class FakeVercelSandbox {
	constructor(
		private readonly owner: FakeVercelStatics,
		readonly name: string,
	) {}

	/** Proxies the CURRENT SESSION's status and throws when there is none. */
	get status(): string {
		if (this.owner.sessionMissing) {
			throw new Error("No active session. Run a command or call resume first.");
		}
		return this.owner.status;
	}

	get createdAt(): Date {
		return new Date(CREATED_AT);
	}

	get vcpus(): number | undefined {
		return 2;
	}

	async delete(): Promise<void> {
		this.owner.calls.push(`delete:${this.name}`);
	}

	async stop(): Promise<void> {
		this.owner.calls.push(`stop:${this.name}`);
	}
}

class FakeVercelStatics {
	/** Every get, with the resume flag exactly as the adapter passed it. */
	readonly gets: Array<{ name: string; resume: boolean | undefined }> = [];
	readonly calls: string[] = [];
	status = "stopped";
	sessionMissing = false;
	missing = false;

	async get(params: { name: string; resume?: boolean }): Promise<FakeVercelSandbox> {
		this.gets.push({ name: params.name, resume: params.resume });
		this.calls.push(`get:${params.name}:resume=${String(params.resume)}`);
		if (this.missing) throw vercelNotFound();
		return new FakeVercelSandbox(this, params.name);
	}
}

type VercelSandboxClass = NonNullable<Parameters<typeof createVercelProvider>[1]>;

function vercelProvider(statics: FakeVercelStatics): SandboxProvider {
	return createVercelProvider(
		{ token: "vercel-token", teamId: "team_1", projectId: "prj_1" },
		statics as unknown as VercelSandboxClass,
	);
}

/**
 * Never resumed, and the SDK was actually reached: an empty call list would
 * satisfy "no resume" while proving nothing.
 */
function assertNeverResumed(statics: FakeVercelStatics): void {
	assert.ok(statics.gets.length > 0, "the vercel SDK was never called at all");
	for (const get of statics.gets) {
		assert.equal(
			get.resume,
			false,
			`Sandbox.get must pass resume: false explicitly, got ${String(get.resume)}`,
		);
	}
}

/** Guard against a vacuous "resume was never true". */
test("vercel: connect() asks for resume: true, so the flag is observable", async () => {
	const statics = new FakeVercelStatics();
	await vercelProvider(statics).connect("box");
	assert.deepEqual(statics.gets, [{ name: "box", resume: true }]);
});

test("vercel describe reads at resume: false and reports the parked phase", async () => {
	const statics = new FakeVercelStatics();
	const description = await requireDescribe(vercelProvider(statics))("box");
	assertNeverResumed(statics);
	assert.deepEqual(description, {
		state: "sleeping",
		rawPhase: "stopped",
		createdAt: CREATED_AT,
		resources: { vcpu: 2 },
	});
	// No stop and no delete: describing must not change anything either.
	assert.deepEqual(statics.calls, ["get:box:resume=false"]);
});

test("vercel describe maps a live session without resuming it", async () => {
	const statics = new FakeVercelStatics();
	statics.status = "running";
	const description = await requireDescribe(vercelProvider(statics))("box");
	assertNeverResumed(statics);
	assert.equal(description.state, "ready");
	assert.equal(description.rawPhase, "running");
});

test("vercel describe reports unknown, not a guess, when no session exists", async () => {
	const statics = new FakeVercelStatics();
	statics.sessionMissing = true;
	const description = await requireDescribe(vercelProvider(statics))("box");
	assertNeverResumed(statics);
	assert.deepEqual(description, {
		state: "unknown",
		rawPhase: null,
		createdAt: CREATED_AT,
		resources: { vcpu: 2 },
	});
});

test("vercel describe reports a deleted sandbox as destroyed", async () => {
	const statics = new FakeVercelStatics();
	statics.missing = true;
	const description = await requireDescribe(vercelProvider(statics))("box");
	assertNeverResumed(statics);
	assert.deepEqual(description, { state: "destroyed", rawPhase: null });
});

test("vercel remove deletes a stopped sandbox without resuming it", async () => {
	const statics = new FakeVercelStatics();
	await requireRemove(vercelProvider(statics))("box");
	assertNeverResumed(statics);
	assert.deepEqual(statics.calls, ["get:box:resume=false", "delete:box"]);
});

test("vercel remove is idempotent for an already-deleted sandbox", async () => {
	const statics = new FakeVercelStatics();
	statics.missing = true;
	await requireRemove(vercelProvider(statics))("box");
	assertNeverResumed(statics);
});

test("vercel park stops a running sandbox without a resume round trip", async () => {
	const statics = new FakeVercelStatics();
	statics.status = "running";
	await requirePark(vercelProvider(statics))("box");
	assertNeverResumed(statics);
	assert.deepEqual(statics.calls, ["get:box:resume=false", "stop:box"]);
});

test("vercel park leaves an already-parked sandbox alone", async () => {
	const statics = new FakeVercelStatics();
	await requirePark(vercelProvider(statics))("box");
	assertNeverResumed(statics);
	// stop() throws "No active session to stop." on a stopped sandbox, and
	// resuming one just to park it again is the wake this member prevents.
	assert.deepEqual(statics.calls, ["get:box:resume=false"]);
});

test("vercel no-wake reads fail closed on a gateway key", async () => {
	const statics = new FakeVercelStatics();
	const provider = createVercelProvider(
		{ token: "vck_not_sandbox_auth" },
		statics as unknown as VercelSandboxClass,
	);
	await rejectsWith(
		() => requireDescribe(provider)("box"),
		"missing_credentials",
		/AI Gateway key/,
	);
	assert.deepEqual(statics.gets, []);
});

// ---------------------------------------------------------------------------
// sprites: the wake is an exec against the sprite, so no exec may be issued.
// ---------------------------------------------------------------------------

function spritesApiError(status: number, message: string): Error {
	const error = new Error(message) as Error & { statusCode: number };
	error.statusCode = status;
	return error;
}

class FakeSpriteRecord {
	readonly name = "am-mux-x";
	status: string | undefined = "cold";
	createdAt: Date | undefined = new Date(CREATED_AT);
	config: { cpus?: number } | undefined;
	/** Any of these would wake a suspended sprite. */
	execCalls = 0;
	checkCalls = 0;

	async execFileHTTP(): Promise<never> {
		this.execCalls += 1;
		throw new Error("an exec would wake the sprite");
	}

	async check(): Promise<{ status: string }> {
		this.checkCalls += 1;
		return { status: "healthy" };
	}
}

class FakeSpritesClient {
	readonly calls: string[] = [];
	readonly record = new FakeSpriteRecord();
	missing = false;

	async getSprite(name: string): Promise<FakeSpriteRecord> {
		this.calls.push(`getSprite:${name}`);
		if (this.missing) throw spritesApiError(404, "sprite not found");
		return this.record;
	}

	async deleteSprite(name: string): Promise<void> {
		this.calls.push(`deleteSprite:${name}`);
		if (this.missing) throw spritesApiError(404, "sprite not found");
	}
}

function spritesProvider(
	client: FakeSpritesClient,
	creds: { token?: string } = { token: "sprites-token" },
): SandboxProvider {
	return createSpritesProvider(creds, client as unknown as SpritesClient);
}

test("sprites describe reads the record only -- no exec, no /check", async () => {
	const client = new FakeSpritesClient();
	const description = await requireDescribe(spritesProvider(client))("am-mux-x");
	assert.deepEqual(client.calls, ["getSprite:am-mux-x"]);
	assert.equal(client.record.execCalls, 0);
	// /check answered "healthy" for a ten-minute-idle sprite whose record said
	// "cold", so consulting it would add a round trip and no information.
	assert.equal(client.record.checkCalls, 0);
	assert.deepEqual(description, {
		state: "sleeping",
		rawPhase: "cold",
		createdAt: CREATED_AT,
	});
});

test("sprites describe keeps warm and cold apart in rawPhase", async () => {
	const client = new FakeSpritesClient();
	client.record.status = "warm";
	client.record.config = { cpus: 4 };
	const description = await requireDescribe(spritesProvider(client))("am-mux-x");
	// Both normalize to sleeping; only the raw word says whether the next exec
	// answers in ~60ms or has to boot first.
	assert.equal(description.state, "sleeping");
	assert.equal(description.rawPhase, "warm");
	assert.deepEqual(description.resources, { vcpu: 4 });
	assert.equal(client.record.execCalls, 0);
});

test("sprites describe reports a deleted sprite as destroyed", async () => {
	const client = new FakeSpritesClient();
	client.missing = true;
	const description = await requireDescribe(spritesProvider(client))("am-mux-x");
	assert.deepEqual(description, { state: "destroyed", rawPhase: null });
	assert.equal(client.record.execCalls, 0);
});

test("sprites remove deletes by name without reading or waking the sprite", async () => {
	const client = new FakeSpritesClient();
	await requireRemove(spritesProvider(client))("am-mux-x");
	assert.deepEqual(client.calls, ["deleteSprite:am-mux-x"]);
	assert.equal(client.record.execCalls, 0);
});

test("sprites remove is idempotent for an already-deleted sprite", async () => {
	const client = new FakeSpritesClient();
	client.missing = true;
	await requireRemove(spritesProvider(client))("am-mux-x");
	assert.deepEqual(client.calls, ["deleteSprite:am-mux-x"]);
});

test("sprites omits park rather than faking one", () => {
	// No suspend exists in the SDK and sprites park on their own schedule; a
	// park() that resolved without parking would be a false claim.
	assert.equal(spritesProvider(new FakeSpritesClient()).park, undefined);
});

test("sprites no-wake reads fail closed without a token", async () => {
	const client = new FakeSpritesClient();
	const provider = spritesProvider(client, {});
	await rejectsWith(
		() => requireDescribe(provider)("am-mux-x"),
		"missing_credentials",
		/SPRITES_TOKEN/,
	);
	await rejectsWith(() => requireRemove(provider)("am-mux-x"), "missing_credentials");
	assert.deepEqual(client.calls, []);
});

// ---------------------------------------------------------------------------
// dedalus: raw REST. The wake is POST /executions, so none may be sent.
// ---------------------------------------------------------------------------

type RecordedRequest = { method: string; path: string };

type FetchHandler = (
	method: string,
	path: string,
) => { status: number; body?: unknown };

function stubFetch(handler: FetchHandler): {
	calls: RecordedRequest[];
	restore: () => void;
} {
	const original = globalThis.fetch;
	const calls: RecordedRequest[] = [];
	globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
		const url = new URL(String(input));
		const method = (init?.method ?? "GET").toUpperCase();
		calls.push({ method, path: url.pathname });
		const { status, body } = handler(method, url.pathname);
		// null, not "": a 204 may not carry a body at all.
		return new Response(body === undefined ? null : JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof globalThis.fetch;
	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}

function dedalusMachine(
	phase: string,
	extra: { last_error?: string | null; reason?: string | null } = {},
): Record<string, unknown> {
	return {
		machine_id: "dm-1",
		vcpu: 1,
		memory_mib: 2048,
		storage_gib: 10,
		created_at: CREATED_AT,
		desired_state: "running",
		status: { phase, revision: 7, ...extra },
	};
}

function dedalusProvider(): SandboxProvider {
	return createDedalusProvider({
		apiKey: "dedalus-key",
		baseUrl: "https://dcs.example.test",
	});
}

/** An execution POST is the documented wake path; a read must send none. */
function assertNoExecution(calls: RecordedRequest[]): void {
	assert.ok(calls.length > 0, "the dedalus API was never called at all");
	for (const call of calls) {
		assert.ok(
			!call.path.includes("/executions"),
			`a no-wake path submitted an execution: ${call.method} ${call.path}`,
		);
		assert.ok(
			!call.path.endsWith("/wake"),
			`a no-wake path called wake: ${call.method} ${call.path}`,
		);
	}
}

/** Guard against a vacuous "no execution was submitted". */
test("dedalus: the fetch stub records the execution POST a real wake sends", async () => {
	const stub = stubFetch((_method, path) =>
		path.endsWith("/executions")
			? { status: 200, body: { execution_id: "ex-1", status: "queued" } }
			: { status: 200, body: dedalusMachine("sleeping") },
	);
	try {
		const handle = await dedalusProvider().connect("dm-1");
		await handle.wake();
		assert.ok(
			stub.calls.some(
				(call) => call.method === "POST" && call.path.endsWith("/executions"),
			),
			"the wake path did not submit an execution, so the guard proves nothing",
		);
	} finally {
		stub.restore();
	}
});

test("dedalus describe reads the machine record and submits no execution", async () => {
	const stub = stubFetch(() => ({ status: 200, body: dedalusMachine("sleeping") }));
	try {
		const description = await requireDescribe(dedalusProvider())("dm-1");
		assert.deepEqual(stub.calls, [{ method: "GET", path: "/v1/machines/dm-1" }]);
		assertNoExecution(stub.calls);
		assert.deepEqual(description, {
			state: "sleeping",
			rawPhase: "sleeping",
			createdAt: CREATED_AT,
			resources: { vcpu: 1, memoryMib: 2048, diskGib: 10 },
		});
	} finally {
		stub.restore();
	}
});

test("dedalus describe carries the vendor's own failure text", async () => {
	const stub = stubFetch(() => ({
		status: 200,
		body: dedalusMachine("failed", { last_error: "SNAPSHOT_LAUNCH_TIMEOUT" }),
	}));
	try {
		const description = await requireDescribe(dedalusProvider())("dm-1");
		assert.equal(description.state, "error");
		assert.equal(description.lastError, "SNAPSHOT_LAUNCH_TIMEOUT");
		assertNoExecution(stub.calls);
	} finally {
		stub.restore();
	}
});

test("dedalus describe does not report a benign desired-state note as an error", async () => {
	const stub = stubFetch(() => ({
		status: 200,
		body: dedalusMachine("running", { reason: "DesiredStateReached" }),
	}));
	try {
		const description = await requireDescribe(dedalusProvider())("dm-1");
		assert.equal(description.state, "ready");
		assert.equal(description.lastError, undefined);
	} finally {
		stub.restore();
	}
});

test("dedalus describe reports a purged machine as destroyed", async () => {
	const stub = stubFetch(() => ({ status: 404, body: { error: "not_found" } }));
	try {
		const description = await requireDescribe(dedalusProvider())("dm-gone");
		assert.deepEqual(description, { state: "destroyed", rawPhase: null });
		assertNoExecution(stub.calls);
	} finally {
		stub.restore();
	}
});

test("dedalus remove deletes a sleeping machine without waking it", async () => {
	const stub = stubFetch((method) =>
		method === "DELETE"
			? { status: 204 }
			: { status: 200, body: dedalusMachine("sleeping") },
	);
	try {
		await requireRemove(dedalusProvider())("dm-1");
		assert.deepEqual(stub.calls, [
			{ method: "GET", path: "/v1/machines/dm-1" },
			{ method: "DELETE", path: "/v1/machines/dm-1" },
		]);
		assertNoExecution(stub.calls);
	} finally {
		stub.restore();
	}
});

test("dedalus remove is idempotent for a machine that is already gone", async () => {
	const stub = stubFetch(() => ({ status: 404, body: { error: "not_found" } }));
	try {
		await requireRemove(dedalusProvider())("dm-gone");
		assertNoExecution(stub.calls);
	} finally {
		stub.restore();
	}
});

test("dedalus omits park rather than faking one", () => {
	// POST /sleep is an HMAC-gated internal route: a public key gets 401, so a
	// park() here could only ever pretend.
	assert.equal(dedalusProvider().park, undefined);
});

test("dedalus no-wake reads fail closed without an API key", async () => {
	const stub = stubFetch(() => ({ status: 200, body: dedalusMachine("running") }));
	try {
		const provider = createDedalusProvider({});
		await rejectsWith(
			() => requireDescribe(provider)("dm-1"),
			"missing_credentials",
			/DEDALUS_API_KEY/,
		);
		await rejectsWith(() => requireRemove(provider)("dm-1"), "missing_credentials");
		assert.deepEqual(stub.calls, []);
	} finally {
		stub.restore();
	}
});

// ---------------------------------------------------------------------------
// Contract shape across all four lanes.
// ---------------------------------------------------------------------------

test("every substrate offers a no-wake read and a no-wake destroy", () => {
	const providers: SandboxProvider[] = [
		e2bProvider(new FakeE2bStatics()),
		vercelProvider(new FakeVercelStatics()),
		spritesProvider(new FakeSpritesClient()),
		dedalusProvider(),
	];
	for (const provider of providers) {
		assert.equal(
			typeof provider.describe,
			"function",
			`${provider.kind} has no describe()`,
		);
		assert.equal(typeof provider.remove, "function", `${provider.kind} has no remove()`);
	}
});

test("park exists only where the vendor can pause by id", () => {
	// e2b: POST /sandboxes/{id}/pause. vercel: get(resume:false) then stop().
	assert.equal(typeof e2bProvider(new FakeE2bStatics()).park, "function");
	assert.equal(typeof vercelProvider(new FakeVercelStatics()).park, "function");
	// sprites: no suspend API at all. dedalus: /sleep is HMAC-gated.
	assert.equal(spritesProvider(new FakeSpritesClient()).park, undefined);
	assert.equal(dedalusProvider().park, undefined);
});

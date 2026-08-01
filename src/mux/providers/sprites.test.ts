/**
 * Tests for src/mux/providers/sprites.ts: the transport-retry policy, the
 * wake-before-use path for auto-suspended sprites, MuxError
 * classification, and the secret-safety property that env never reaches
 * the SDK's `env` option.
 *
 * Run: tsx --test src/mux/providers/sprites.test.ts
 *
 * No network and no SDK: @fly/sprites is imported for types only, and the
 * Sprite/SpritesClient surfaces the adapter touches are small enough to
 * fake structurally (execFileHTTP, check, filesystem, destroy, getSprite,
 * createSprite). The adapter's own dynamic import of the SDK is never
 * reached because these tests build SpritesSandbox directly.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sprite, SpritesClient } from "@fly/sprites";
import { MuxError } from "../types.js";
import {
	createOrAdoptSprite,
	mapVendorError,
	retryDelayMs,
	withTransportRetry,
	SpritesSandbox,
	type SpritesSandboxOptions,
} from "./sprites.js";

// ---------------------------------------------------------------------------
// Error shapes, mirroring what the SDK and undici actually throw.
// ---------------------------------------------------------------------------

/** APIError carries a numeric statusCode (dist/types.js). */
function apiError(status: number, message: string, errorCode?: string): Error {
	const error = new Error(message) as Error & {
		statusCode: number;
		errorCode?: string;
	};
	error.statusCode = status;
	if (errorCode) error.errorCode = errorCode;
	return error;
}

/** AbortSignal.timeout rejects with a DOMException named TimeoutError. */
function timeoutError(): Error {
	const error = new Error("The operation was aborted due to timeout");
	error.name = "TimeoutError";
	return error;
}

/** undici hides the socket code on `cause` behind a bare "fetch failed". */
function fetchFailed(code = "ECONNRESET"): Error {
	const error = new Error("fetch failed") as Error & { cause: { code: string } };
	error.cause = { code };
	return error;
}

/** ExecError: a completed command with a non-zero exit (dist/types.js). */
function execError(exitCode: number, stderr = "boom"): Error {
	const error = new Error(`Command failed with exit code ${exitCode}`) as Error & {
		result: { stdout: string; stderr: string; exitCode: number };
	};
	error.name = "ExecError";
	error.result = { stdout: "", stderr, exitCode };
	return error;
}

// ---------------------------------------------------------------------------
// Fake sprite. Records every call so ordering and secret leakage are
// assertable; queued outcomes drive the retry paths.
// ---------------------------------------------------------------------------

type Outcome =
	| { throws: unknown }
	| { stdout?: string; stderr?: string; exitCode?: number };

/** The wake probe is the only exec the adapter sends unwrapped. */
const WAKE_SCRIPT = "exit 0";

class FakeSprite {
	readonly name = "am-mux-fake";
	/** Scripts of real commands, in order (wake probes excluded). */
	readonly commands: string[] = [];
	readonly execOptions: Array<Record<string, unknown>> = [];
	/** Timeout each wake probe was given. */
	readonly wakeProbes: number[] = [];
	readonly staged = new Map<string, string>();
	readonly spawned: Array<{ args: string[]; options: Record<string, unknown> }> = [];
	/** Guard: the wake path must not depend on /check, which lies when cold. */
	checkCalls = 0;
	destroyCalls = 0;
	/** The sprite record's lifecycle status; a live sprite reads "warm". */
	status = "warm";
	/** What /check answers -- "healthy" even for a ten-minute-idle sprite. */
	health = "healthy";
	wakeOutcome: Outcome | null = null;
	/** Per-attempt wake outcome, when one fixed outcome is not enough. */
	wakeOutcomeFor: (() => Outcome | null) | null = null;
	private readonly queue: Outcome[];

	constructor(queue: Outcome[] = []) {
		this.queue = [...queue];
	}

	async check(): Promise<{ status: string }> {
		this.checkCalls += 1;
		return { status: this.health };
	}

	async execFileHTTP(
		_file: string,
		args: string[],
		options?: Record<string, unknown>,
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		if (args[1] === WAKE_SCRIPT) {
			this.wakeProbes.push(Number(options?.timeout ?? 0));
			return this.settle(this.wakeOutcomeFor?.() ?? this.wakeOutcome);
		}
		this.commands.push(args[1] ?? "");
		this.execOptions.push(options ?? {});
		return this.settle(this.queue.shift() ?? null);
	}

	spawn(
		_file: string,
		args: string[],
		options?: Record<string, unknown>,
	): never {
		this.spawned.push({ args, options: options ?? {} });
		throw new Error("spawn is not exercised by these tests");
	}

	async destroy(): Promise<void> {
		this.destroyCalls += 1;
		const outcome = this.queue.shift();
		if (outcome && "throws" in outcome) throw outcome.throws;
	}

	filesystem(): {
		writeFile: (path: string, content: string | Buffer) => Promise<void>;
		mkdir: (path: string) => Promise<void>;
		readFile: (path: string) => Promise<string>;
	} {
		return {
			writeFile: async (path, content) => {
				this.staged.set(path, content.toString());
			},
			mkdir: async () => undefined,
			readFile: async () => {
				throw new Error("ENOENT: no such file");
			},
		};
	}

	private settle(
		outcome: Outcome | null,
	): { stdout: string; stderr: string; exitCode: number } {
		if (outcome && "throws" in outcome) throw outcome.throws;
		return {
			stdout: outcome?.stdout ?? "ok",
			stderr: outcome?.stderr ?? "",
			exitCode: outcome?.exitCode ?? 0,
		};
	}
}

/** Zero backoff: the schedule itself is asserted separately. */
function sandboxFor(
	sprite: FakeSprite,
	options: SpritesSandboxOptions = {},
): SpritesSandbox {
	const client = {
		getSprite: async () => sprite as unknown as Sprite,
	} as unknown as SpritesClient;
	return new SpritesSandbox(client, sprite as unknown as Sprite, {
		delayFor: () => 0,
		...options,
	});
}

/** Recover the payload the adapter base64-wrapped into a command script. */
function decodeScript(script: string): string {
	const match = script.match(/printf '%s' '([A-Za-z0-9+/=]+)'/);
	assert.ok(match, `not an inline base64 script: ${script}`);
	return Buffer.from(match[1] ?? "", "base64").toString("utf8");
}

async function rejectsWith(
	run: () => Promise<unknown>,
	kind: MuxError["kind"],
	pattern?: RegExp,
): Promise<MuxError> {
	let captured: unknown;
	await assert.rejects(run, (error: unknown) => {
		captured = error;
		assert.ok(error instanceof MuxError, `not a MuxError: ${String(error)}`);
		assert.equal(error.kind, kind, `kind for: ${error.message}`);
		if (pattern) assert.match(error.message, pattern);
		return true;
	});
	return captured as MuxError;
}

// ---------------------------------------------------------------------------
// Backoff schedule
// ---------------------------------------------------------------------------

test("retryDelayMs is deterministic, exponential and capped", () => {
	assert.deepEqual([0, 1, 2, 3, 4].map(retryDelayMs), [700, 1400, 2800, 5600, 8000]);
	// Cap holds for absurd indexes (2 ** 1024 is Infinity, not a huge delay).
	assert.equal(retryDelayMs(1024), 8000);
	assert.equal(retryDelayMs(-3), 700);
	// Same input, same delay: no jitter, so a test can assert the schedule.
	assert.equal(retryDelayMs(2), retryDelayMs(2));
});

test("the retry path never calls Math.random", async () => {
	const original = Math.random;
	Math.random = (): number => {
		throw new Error("Math.random is not available in this context");
	};
	try {
		const sprite = new FakeSprite([{ throws: timeoutError() }, { stdout: "second" }]);
		const result = await sandboxFor(sprite).exec("echo hi", { env: { K: "v" } });
		assert.equal(result.stdout, "second");
		assert.equal(sprite.commands.length, 2);
	} finally {
		Math.random = original;
	}
});

// ---------------------------------------------------------------------------
// withTransportRetry policy
// ---------------------------------------------------------------------------

test("withTransportRetry retries a transient failure then succeeds", async () => {
	let calls = 0;
	const seen: number[] = [];
	const value = await withTransportRetry(
		"probe",
		{
			attempts: 3,
			delayFor: () => 0,
			beforeRetry: async (attempt) => {
				seen.push(attempt);
			},
		},
		async (attempt) => {
			calls += 1;
			if (attempt === 0) throw apiError(503, "upstream unavailable");
			return "ok";
		},
	);
	assert.equal(value, "ok");
	assert.equal(calls, 2);
	assert.deepEqual(seen, [0]);
});

test("withTransportRetry gives up after the attempt cap with transient", async () => {
	let calls = 0;
	await rejectsWith(
		() =>
			withTransportRetry("probe", { attempts: 3, delayFor: () => 0 }, async () => {
				calls += 1;
				throw fetchFailed();
			}),
		"transient",
		/fetch failed/,
	);
	assert.equal(calls, 3);
});

test("withTransportRetry never retries a 404 or an auth failure", async () => {
	let notFoundCalls = 0;
	await rejectsWith(
		() =>
			withTransportRetry("connect", { attempts: 4, delayFor: () => 0 }, async () => {
				notFoundCalls += 1;
				throw apiError(404, "sprite not found");
			}),
		"fatal",
		/not found/i,
	);
	assert.equal(notFoundCalls, 1);

	let authCalls = 0;
	await rejectsWith(
		() =>
			withTransportRetry("list", { attempts: 4, delayFor: () => 0 }, async () => {
				authCalls += 1;
				throw apiError(401, "unauthorized");
			}),
		"fatal",
		/SPRITES_TOKEN/,
	);
	assert.equal(authCalls, 1);
});

test("rate limits retry only where the policy opts in", async () => {
	let held = 0;
	await rejectsWith(
		() =>
			withTransportRetry("exec", { attempts: 3, delayFor: () => 0 }, async () => {
				held += 1;
				throw apiError(429, "slow down");
			}),
		"rate_limited",
	);
	assert.equal(held, 1, "a rate limit routes instead of sleeping in place");

	let retried = 0;
	await rejectsWith(
		() =>
			withTransportRetry(
				"create",
				{ attempts: 3, delayFor: () => 0, retryRateLimited: true },
				async () => {
					retried += 1;
					throw apiError(429, "slow down");
				},
			),
		"rate_limited",
	);
	assert.equal(retried, 3);
});

test("withTransportRetry keeps an already-classified MuxError intact", async () => {
	let calls = 0;
	await rejectsWith(
		() =>
			withTransportRetry("exec", { attempts: 3, delayFor: () => 0 }, async () => {
				calls += 1;
				throw new MuxError("not_supported", "sprites exec: no such capability");
			}),
		"not_supported",
	);
	assert.equal(calls, 1);
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test("transport-class failures classify as transient", () => {
	const cases: unknown[] = [
		apiError(500, "internal error"),
		apiError(502, "bad gateway"),
		new Error("Failed to execute command over HTTP (status 503): busy"),
		timeoutError(),
		new Error("sprites exec timed out"),
		fetchFailed("ECONNRESET"),
		fetchFailed("UND_ERR_SOCKET"),
		new Error("read ECONNRESET"),
		new Error("websocket hang up"),
	];
	for (const error of cases) {
		const mapped = mapVendorError(error, "exec");
		assert.equal(mapped.kind, "transient", mapped.message);
		assert.equal(mapped.substrate, "sprites");
	}
});

test("404 and auth classify as fatal, with a usable message", () => {
	const missing = mapVendorError(apiError(404, "sprite not found"), "connect");
	assert.equal(missing.kind, "fatal");
	assert.match(missing.message, /sprite not found \(404\)/);

	const missingByMessage = mapVendorError(new Error("sprite not found"), "exec");
	assert.equal(missingByMessage.kind, "fatal");

	for (const status of [401, 403]) {
		const denied = mapVendorError(apiError(status, "invalid token"), "list");
		assert.equal(denied.kind, "fatal");
		assert.match(denied.message, /auth rejected/);
		assert.match(denied.message, /SPRITES_TOKEN/);
	}

	const unstatused = mapVendorError(new Error("Unauthorized"), "list");
	assert.equal(unstatused.kind, "fatal");
	assert.match(unstatused.message, /SPRITES_TOKEN/);
});

test("a 5xx body that mentions auth is still transient", () => {
	const mapped = mapVendorError(
		apiError(500, "internal error while checking authorization"),
		"create",
	);
	assert.equal(mapped.kind, "transient");
});

test("rate limits classify as rate_limited by status or error code", () => {
	assert.equal(mapVendorError(apiError(429, "slow down"), "create").kind, "rate_limited");
	for (const code of [
		"sprite_creation_rate_limited",
		"concurrent_sprite_limit_exceeded",
	]) {
		const mapped = mapVendorError(apiError(400, "limit", code), "create");
		assert.equal(mapped.kind, "rate_limited", code);
	}
});

test("unrecognized failures classify as fatal, and MuxErrors pass through", () => {
	assert.equal(mapVendorError(new Error("no idea"), "exec").kind, "fatal");
	assert.equal(mapVendorError(apiError(400, "bad request"), "create").kind, "fatal");
	const already = new MuxError("rate_limited", "sprites create: throttled");
	assert.equal(mapVendorError(already, "create"), already);
});

// ---------------------------------------------------------------------------
// exec: retry, wake, and what must never be retried
// ---------------------------------------------------------------------------

test("exec retries a timeout, waking the sprite once before the retry", async () => {
	const sprite = new FakeSprite([{ throws: timeoutError() }, { stdout: "MUX-OK" }]);
	const result = await sandboxFor(sprite).exec("echo MUX-OK");
	assert.equal(result.stdout, "MUX-OK");
	assert.equal(result.exitCode, 0);
	assert.equal(sprite.commands.length, 2);
	assert.equal(sprite.wakeProbes.length, 1);
	// The post-wake budget has to outlast a cold boot (~31s measured), not
	// the caller's warm-path timeout.
	assert.ok(
		(sprite.execOptions[1]?.timeout as number) >= 120_000,
		`retry timeout was ${String(sprite.execOptions[1]?.timeout)}`,
	);
	assert.ok((sprite.wakeProbes[0] ?? 0) >= 120_000);
});

test("exec gives up as transient after the cap, waking at most once", async () => {
	const failures: Outcome[] = [
		{ throws: timeoutError() },
		{ throws: fetchFailed() },
		{ throws: apiError(500, "internal error") },
		{ throws: timeoutError() },
	];
	const sprite = new FakeSprite(failures);
	await rejectsWith(() => sandboxFor(sprite).exec("echo hi"), "transient");
	// Bounded: three attempts, one wake, no loop.
	assert.equal(sprite.commands.length, 3);
	assert.equal(sprite.wakeProbes.length, 1);
});

test("exec does not retry a 404", async () => {
	const sprite = new FakeSprite([
		{ throws: apiError(404, "sprite not found") },
		{ stdout: "never reached" },
	]);
	await rejectsWith(() => sandboxFor(sprite).exec("echo hi"), "fatal", /not found/i);
	assert.equal(sprite.commands.length, 1);
	assert.equal(sprite.wakeProbes.length, 0);
});

test("exec does not retry an auth failure", async () => {
	const sprite = new FakeSprite([
		{ throws: apiError(401, "unauthorized") },
		{ stdout: "never reached" },
	]);
	await rejectsWith(
		() => sandboxFor(sprite).exec("echo hi"),
		"fatal",
		/SPRITES_TOKEN/,
	);
	assert.equal(sprite.commands.length, 1);
});

test("a command that merely failed is returned, never retried", async () => {
	const byResult = new FakeSprite([{ exitCode: 1, stderr: "nope" }]);
	const first = await sandboxFor(byResult).exec("false");
	assert.equal(first.exitCode, 1);
	assert.equal(byResult.commands.length, 1);

	const byExecError = new FakeSprite([{ throws: execError(217, "ENOTEMPTY") }]);
	const second = await sandboxFor(byExecError).exec("npm install");
	assert.equal(second.exitCode, 217);
	assert.match(second.stderr, /ENOTEMPTY/);
	assert.equal(byExecError.commands.length, 1);
});

// ---------------------------------------------------------------------------
// Wake-before-use
// ---------------------------------------------------------------------------

test("an adopted cold sprite is woken before its first exec", async () => {
	const sprite = new FakeSprite([{ stdout: "MUX-OK" }]);
	// What a sprite left idle for ten minutes actually reports.
	sprite.status = "cold";
	const result = await sandboxFor(sprite, { adopted: true }).exec("echo MUX-OK");
	assert.equal(result.stdout, "MUX-OK");
	assert.equal(sprite.wakeProbes.length, 1, "the wake precedes the command");
	assert.equal(sprite.commands.length, 1, "the command itself ran once");
	assert.ok((sprite.wakeProbes[0] ?? 0) >= 120_000, "the wake outlasts a boot");
	assert.equal(sprite.checkCalls, 0, "/check is not the gate: it lies when cold");
});

test("an unknown record status is treated as needing a wake", async () => {
	const sprite = new FakeSprite([{ stdout: "MUX-OK" }]);
	sprite.status = "";
	await sandboxFor(sprite, { adopted: true }).exec("echo MUX-OK");
	assert.equal(sprite.wakeProbes.length, 1);
	assert.equal(sprite.checkCalls, 0);
});

test("a live record status costs no wake, and a fresh sprite costs nothing", async () => {
	// Live pairing: a responsive sprite's record reads "warm" and answers an
	// exec in ~60ms. Probing or waking that would be pure overhead.
	const warm = new FakeSprite([{ stdout: "ok" }]);
	warm.status = "warm";
	await sandboxFor(warm, { adopted: true }).exec("echo hi");
	assert.equal(warm.wakeProbes.length, 0);
	assert.equal(warm.checkCalls, 0);

	const fresh = new FakeSprite([{ stdout: "ok" }]);
	fresh.status = "cold";
	await sandboxFor(fresh).exec("echo hi");
	assert.equal(
		fresh.wakeProbes.length,
		0,
		"a just-created sprite is already up; create paid that cost",
	);
});

test("waking is bounded even when everything keeps failing", async () => {
	const sprite = new FakeSprite([
		{ throws: timeoutError() },
		{ throws: timeoutError() },
		{ throws: timeoutError() },
	]);
	sprite.status = "cold";
	sprite.wakeOutcome = { throws: timeoutError() };
	await rejectsWith(
		() => sandboxFor(sprite, { adopted: true }).exec("echo hi"),
		"transient",
	);
	assert.equal(sprite.commands.length, 3);
	// One wake up front for the cold sprite and one on the first retry, each
	// bounded at WAKE_ATTEMPTS tries. Four probes, then it stops.
	assert.equal(sprite.wakeProbes.length, 4);
});

test("a wake that hits a 404 fails closed as fatal", async () => {
	const sprite = new FakeSprite([{ stdout: "never reached" }]);
	sprite.status = "cold";
	sprite.wakeOutcome = { throws: apiError(404, "sprite not found") };
	await rejectsWith(
		() => sandboxFor(sprite, { adopted: true }).exec("echo hi"),
		"fatal",
		/not found/i,
	);
	assert.equal(sprite.wakeProbes.length, 1, "a 404 is not retried");
	assert.equal(sprite.commands.length, 0);
});

test("a wake retries the 502 a parked sprite answers with", async () => {
	const sprite = new FakeSprite([{ stdout: "MUX-OK" }]);
	sprite.status = "cold";
	// Measured live: the first exec after ten idle minutes returned 502.
	let wakeAttempts = 0;
	sprite.wakeOutcomeFor = () => {
		wakeAttempts += 1;
		return wakeAttempts === 1 ? { throws: apiError(502, "bad gateway") } : null;
	};
	const result = await sandboxFor(sprite, { adopted: true }).exec("echo MUX-OK");
	assert.equal(result.stdout, "MUX-OK");
	assert.equal(sprite.wakeProbes.length, 2);
	assert.equal(sprite.commands.length, 1, "the command still ran exactly once");
});

test("wake() forces a real wake instead of reporting status", async () => {
	const sprite = new FakeSprite();
	sprite.status = "cold";
	await sandboxFor(sprite).wake();
	assert.equal(sprite.wakeProbes.length, 1);
});

// ---------------------------------------------------------------------------
// Secret safety: env is staged as a sourced file, never an SDK env option
// ---------------------------------------------------------------------------

test("env is staged as a sourced file and never handed to the SDK", async () => {
	const secret = "sk-ant-do-not-log-me";
	const sprite = new FakeSprite([{ throws: timeoutError() }, { stdout: "ok" }]);
	await sandboxFor(sprite).exec("claude -p hi", {
		env: { ANTHROPIC_API_KEY: secret },
	});

	assert.equal(sprite.commands.length, 2, "both attempts observed");
	for (const options of sprite.execOptions) {
		assert.ok(
			!("env" in options),
			"env in the SDK options lands in the request URL query string",
		);
	}
	for (const script of sprite.commands) {
		assert.ok(!script.includes(secret), "secret must not ride in argv");
		const payload = decodeScript(script);
		assert.ok(!payload.includes(secret), "secret must not ride in the script");
		assert.match(payload, /^umask 077; \. \/tmp\/am-mux-env-[a-z0-9]+\.sh; rm -f /);
	}

	const staged = [...sprite.staged.entries()].filter(([path]) =>
		path.startsWith("/tmp/am-mux-env-"),
	);
	assert.equal(staged.length, 2, "each attempt stages its own env file");
	for (const [, body] of staged) {
		assert.equal(body, `export ANTHROPIC_API_KEY='${secret}'\n`);
	}
});

// ---------------------------------------------------------------------------
// execBackground, control-plane calls, provisioning
// ---------------------------------------------------------------------------

test("execBackground never launches its payload twice", async () => {
	const sprite = new FakeSprite([{ throws: timeoutError() }, { exitCode: 0 }]);
	await rejectsWith(() => sandboxFor(sprite).execBackground("sleep 5"), "transient");
	assert.equal(
		sprite.commands.length,
		1,
		"a retried launcher would start two concurrent installs",
	);
});

test("control-plane reads retry transports and report a missing sprite", async () => {
	const flaky = new FakeSprite();
	let getCalls = 0;
	const client = {
		getSprite: async () => {
			getCalls += 1;
			if (getCalls === 1) throw apiError(503, "unavailable");
			return { name: flaky.name, status: "running" } as unknown as Sprite;
		},
	} as unknown as SpritesClient;
	const sandbox = new SpritesSandbox(client, flaky as unknown as Sprite, {
		delayFor: () => 0,
	});
	assert.equal(await sandbox.state(), "ready");
	assert.equal(getCalls, 2);

	let goneCalls = 0;
	const goneClient = {
		getSprite: async () => {
			goneCalls += 1;
			throw apiError(404, "sprite not found");
		},
	} as unknown as SpritesClient;
	const gone = new SpritesSandbox(goneClient, flaky as unknown as Sprite, {
		delayFor: () => 0,
	});
	assert.equal(await gone.state(), "destroyed");
	assert.equal(goneCalls, 1);
});

test("destroy retries a transport failure and tolerates a missing sprite", async () => {
	const flaky = new FakeSprite([{ throws: apiError(502, "bad gateway") }]);
	await sandboxFor(flaky).destroy();
	assert.equal(flaky.destroyCalls, 2);

	const gone = new FakeSprite([{ throws: apiError(404, "sprite not found") }]);
	await sandboxFor(gone).destroy();
	assert.equal(gone.destroyCalls, 1);
});

test("create retries a 500 and adopts the sprite a 500 already created", async () => {
	let createCalls = 0;
	const retried = {
		createSprite: async (name: string) => {
			createCalls += 1;
			if (createCalls === 1) throw apiError(500, "internal error");
			return { name, status: "running" } as unknown as Sprite;
		},
		getSprite: async () => {
			throw new Error("getSprite must not be needed here");
		},
	};
	const fresh = await createOrAdoptSprite(retried, "am-mux-a", undefined, {
		delayFor: () => 0,
	});
	assert.equal(createCalls, 2);
	assert.equal(fresh.adopted, false);

	let adoptCalls = 0;
	let getCalls = 0;
	const adopting = {
		createSprite: async () => {
			adoptCalls += 1;
			throw adoptCalls === 1
				? apiError(500, "internal error")
				: apiError(409, "sprite already exists");
		},
		getSprite: async (name: string) => {
			getCalls += 1;
			return { name, status: "suspended" } as unknown as Sprite;
		},
	};
	const adopted = await createOrAdoptSprite(adopting, "am-mux-b", undefined, {
		delayFor: () => 0,
	});
	assert.equal(adoptCalls, 2);
	assert.equal(getCalls, 1);
	assert.equal(adopted.adopted, true, "an adopted sprite must be woken later");
});

test("create surfaces a non-transport failure without retrying", async () => {
	let calls = 0;
	const provisioner = {
		createSprite: async () => {
			calls += 1;
			throw apiError(400, "invalid sprite name");
		},
		getSprite: async () => {
			throw new Error("unreachable");
		},
	};
	await rejectsWith(
		() => createOrAdoptSprite(provisioner, "am-mux-bad", undefined, { delayFor: () => 0 }),
		"fatal",
	);
	assert.equal(calls, 1);
});

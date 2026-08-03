/**
 * Substrate conformance suite: ONE set of assertions, run against all four
 * adapters with their vendor SDKs mocked.
 *
 * Run: npx tsx --test src/mux/providers/conformance.test.ts
 *
 * Why this file exists: four adapters implement `SandboxProvider` and nothing
 * proved they agree. Every behavioral difference found while bringing the lanes
 * up -- Sprites throttling detached work, tmux pipe-pane closing on reattach,
 * secrets in Sprites exec URLs, connect() resuming a parked sandbox -- was found
 * by hand on live infrastructure, one substrate at a time. A fifth substrate must
 * not be addable without meeting the same contract, so:
 *
 *   - Shared assertions run over `LANES` with no per-lane escape hatch.
 *   - Where a substrate legitimately differs, the difference is a VALUE in
 *     `lane.expect` (./conformance.ts) with the reason beside it. There is no
 *     skip anywhere in this file: a skip is how a regression hides.
 *   - `ALL_SUBSTRATES` below fails to COMPILE if `SubstrateKind` grows a member
 *     that has no fixture, so a fifth adapter cannot arrive untested.
 *
 * Negative assertions follow the technique in ./no-wake.test.ts: each is paired
 * with a positive drive of the same path, so "the vendor was not called" can
 * never pass merely because the double records nothing.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
	checkConstraints,
	profileFor,
	UNKNOWN_LIMITS,
	type RouteConstraintKey,
	type RouteConstraints,
} from "../constraints.js";
import {
	MuxError,
	type EgressPolicy,
	type MachineState,
	type PtySupport,
	type SandboxDescription,
	type SandboxHandle,
	type SubstrateKind,
} from "../types.js";
import {
	BASE64_WRAPPER,
	decodedPayload,
	LANES,
	NASTY_COMMAND,
	STREAM_CHUNKS,
	type Lane,
	type LaneHarness,
	type LaneOptions,
} from "./conformance.js";

/**
 * Exhaustive by construction: adding a member to `SubstrateKind` without adding
 * it here is a type error, and adding it here without a fixture fails the
 * coverage test below.
 */
const ALL_SUBSTRATES: Record<SubstrateKind, true> = {
	e2b: true,
	sprites: true,
	vercel: true,
	dedalus: true,
};

const MACHINE_STATES = new Set<MachineState>([
	"ready",
	"starting",
	"sleeping",
	"destroying",
	"destroyed",
	"error",
	"unknown",
]);

const PTY_SUPPORTS = new Set<PtySupport>(["native", "tmux", "none"]);

const EGRESS_POLICIES: readonly EgressPolicy[] = ["open", "blocked", "allowlist"];

async function withLane<T>(
	lane: Lane,
	options: LaneOptions,
	run: (harness: LaneHarness) => Promise<T>,
): Promise<T> {
	const harness = lane.open(options);
	try {
		return await run(harness);
	} finally {
		harness.dispose();
	}
}

async function rejectsWith(
	label: string,
	run: () => Promise<unknown>,
	kind: MuxError["kind"],
	substrate: SubstrateKind,
): Promise<MuxError> {
	let captured: MuxError | null = null;
	await assert.rejects(run, (error: unknown) => {
		assert.ok(error instanceof MuxError, `${label}: not a MuxError: ${String(error)}`);
		assert.equal(error.kind, kind, `${label}: kind for "${error.message}"`);
		assert.equal(
			error.substrate,
			substrate,
			`${label}: error must name its substrate, got ${String(error.substrate)}`,
		);
		captured = error;
		return true;
	});
	assert.ok(captured, `${label}: no error captured`);
	return captured as unknown as MuxError;
}

/** Provision one machine through the contract's own entry point. */
async function machineFor(harness: LaneHarness): Promise<SandboxHandle> {
	return harness.provider.create({ name: "conf" });
}

test("every substrate kind has a conformance fixture", () => {
	const covered = LANES.map((lane) => lane.substrate).sort();
	assert.deepEqual(
		covered,
		Object.keys(ALL_SUBSTRATES).sort(),
		"a SubstrateKind without a fixture in ./conformance.ts is an untested adapter",
	);
	assert.equal(new Set(covered).size, covered.length, "duplicate lane fixture");
});

// ---------------------------------------------------------------------------
// The credential gate. Nothing may reach a vendor SDK in front of it.
// ---------------------------------------------------------------------------

for (const lane of LANES) {
	test(`${lane.substrate}: ready() reports missing credentials instead of throwing`, () => {
		const harness = lane.openUncredentialed();
		try {
			const readiness = harness.provider.ready();
			assert.equal(readiness.ok, false, "an uncredentialed lane must not report ok");
			assert.ok(readiness.missing.length > 0, "ready() named nothing to fix");
			for (const pattern of lane.expect.missingCredentials) {
				assert.ok(
					readiness.missing.some((entry) => pattern.test(entry)),
					`ready().missing must name ${String(pattern)}, got ${readiness.missing.join(", ")}`,
				);
			}
			// A credential probe is a synchronous local read; touching the vendor
			// here would make a fleet render pay for four API calls.
			assert.deepEqual(harness.spy.touches, [], "ready() touched the vendor SDK");
			assert.equal(harness.provider.kind, lane.substrate);
		} finally {
			harness.dispose();
		}
	});

	test(`${lane.substrate}: create/connect/list refuse before touching the SDK`, async () => {
		const harness = lane.openUncredentialed();
		try {
			const { provider, spy } = harness;
			await rejectsWith(
				"create",
				() => provider.create(),
				"missing_credentials",
				lane.substrate,
			);
			await rejectsWith(
				"connect",
				() => provider.connect(lane.expect.sampleId),
				"missing_credentials",
				lane.substrate,
			);
			await rejectsWith("list", () => provider.list(), "missing_credentials", lane.substrate);
			// The optional members share the gate: a no-wake read of an
			// uncredentialed lane must fail closed too, not answer "unknown".
			if (provider.describe) {
				await rejectsWith(
					"describe",
					() => provider.describe?.(lane.expect.sampleId) as Promise<unknown>,
					"missing_credentials",
					lane.substrate,
				);
			}
			if (provider.remove) {
				await rejectsWith(
					"remove",
					() => provider.remove?.(lane.expect.sampleId) as Promise<unknown>,
					"missing_credentials",
					lane.substrate,
				);
			}
			if (provider.park) {
				await rejectsWith(
					"park",
					() => provider.park?.(lane.expect.sampleId) as Promise<unknown>,
					"missing_credentials",
					lane.substrate,
				);
			}
			assert.deepEqual(
				spy.touches,
				[],
				"a vendor member was read before the credential gate",
			);
		} finally {
			harness.dispose();
		}
	});

	test(`${lane.substrate}: the same calls DO reach the SDK once credentialed`, async () => {
		// Guard against a vacuous gate test: an adapter that never calls the
		// vendor at all would satisfy "touches is empty" above.
		await withLane(lane, {}, async ({ provider, spy }) => {
			await provider.list();
			assert.ok(
				spy.touches.length > 0,
				"list() never reached the vendor, so the gate assertion proves nothing",
			);
		});
	});
}

// ---------------------------------------------------------------------------
// Error taxonomy. One table, four lanes, four different vendor error shapes.
// ---------------------------------------------------------------------------

const TAXONOMY: readonly { status: number; kind: MuxError["kind"] }[] = [
	{ status: 429, kind: "rate_limited" },
	{ status: 500, kind: "transient" },
	{ status: 400, kind: "fatal" },
	{ status: 403, kind: "fatal" },
	{ status: 404, kind: "fatal" },
];

for (const lane of LANES) {
	for (const { status, kind } of TAXONOMY) {
		test(`${lane.substrate}: ${status} classifies as ${kind}`, async () => {
			await withLane(lane, { failStatus: status }, async ({ provider }) => {
				// list() is the cheapest member every lane implements, and the one
				// with no id-specific 404 shortcut to hide behind.
				await rejectsWith(`list ${status}`, () => provider.list(), kind, lane.substrate);
			});
		});
	}
}

// ---------------------------------------------------------------------------
// Lazy vendor imports. Importing an adapter must not load its SDK.
// ---------------------------------------------------------------------------

/**
 * Resolve-hook that refuses the vendor packages. Registered in a child process,
 * it turns "the SDK was loaded" into a hard failure instead of something a test
 * has to infer.
 *
 * Subpaths are blocked too, not just the bare name. An exact-match Set stopped
 * proving anything the moment ./e2b.ts started loading `e2b/dist/index.mjs`
 * (2026-08-02): the real SDK would have resolved, `list()` would have failed on
 * the fake API key, and e2b's own message contains "e2b" -- so the probe below
 * would have printed GATED and this suite would have gone green while no longer
 * gating anything. A skip is how a regression hides, and so is a stale matcher.
 */
const BLOCKER_SOURCE = `const BLOCKED = ["e2b", "@fly/sprites", "@vercel/sandbox"];
export async function resolve(specifier, context, next) {
	if (BLOCKED.some((pkg) => specifier === pkg || specifier.startsWith(pkg + "/"))) {
		throw new Error("VENDOR_SDK_RESOLVED:" + specifier);
	}
	return next(specifier, context);
}
`;

/**
 * Import every adapter with the blocker live, then force each one's lazy load.
 *
 * The forced load is the non-vacuity guard: it proves the hook really does
 * intercept that specifier from inside that module, so a clean import can only
 * mean the SDK was never reached at import time.
 */
const PROBE_SOURCE = `import { register } from "node:module";
register(new URL("./blocker.mjs", import.meta.url));
const dir = process.argv[2];
const lanes = [
	{ name: "e2b", file: "e2b.ts", specifier: "e2b", make: (m) => m.createE2bProvider({ apiKey: "k" }) },
	{ name: "sprites", file: "sprites.ts", specifier: "@fly/sprites", make: (m) => m.createSpritesProvider({ token: "t" }) },
	{ name: "vercel", file: "vercel.ts", specifier: "@vercel/sandbox", make: (m) => m.createVercelProvider({ token: "t", teamId: "team", projectId: "prj" }) },
	{ name: "dedalus", file: "dedalus.ts", specifier: null, make: null },
];
for (const lane of lanes) {
	const mod = await import(new URL(lane.file, "file://" + dir + "/").href);
	console.log("IMPORTED " + lane.name);
	if (!lane.specifier) continue;
	try {
		await lane.make(mod).list();
		console.log("REACHED_SDK " + lane.name);
	} catch (error) {
		const message = String(error && error.message).replace(/\\s+/g, " ");
		const shape = [error && error.name, error && error.kind, error && error.substrate].join("/");
		console.log(
			(message.includes(lane.specifier) ? "GATED " : "UNEXPECTED ") +
				lane.name + " " + shape + " " + message,
		);
	}
}
`;

test("importing an adapter does not load its vendor SDK", () => {
	const providersDir = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(providersDir, "..", "..", "..");
	const tsx = join(repoRoot, "node_modules", ".bin", "tsx");
	assert.ok(
		existsSync(tsx),
		`this probe needs a fresh process to observe module loading; run an install first (${tsx} is missing)`,
	);
	const scratch = mkdtempSync(join(tmpdir(), "am-conformance-"));
	let output: string;
	try {
		writeFileSync(join(scratch, "blocker.mjs"), BLOCKER_SOURCE, "utf8");
		writeFileSync(join(scratch, "probe.mjs"), PROBE_SOURCE, "utf8");
		output = execFileSync(tsx, [join(scratch, "probe.mjs"), providersDir], {
			cwd: repoRoot,
			encoding: "utf8",
			timeout: 120_000,
		});
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
	const lines = output.trim().split("\n");

	for (const lane of LANES) {
		assert.ok(
			lines.includes(`IMPORTED ${lane.substrate}`),
			`${lane.substrate} could not be imported with its vendor SDK blocked:\n${output}`,
		);
	}
	// Three lanes drive a vendor SDK; dedalus is raw REST and has none to load,
	// which is why it is absent from this list rather than exempted from a check.
	for (const substrate of ["e2b", "sprites", "vercel"]) {
		assert.ok(
			lines.some((line) => line.startsWith(`GATED ${substrate} `)),
			`${substrate} never attempted its lazy SDK import, so the blocker proves nothing:\n${output}`,
		);
	}
	assert.ok(
		!lines.some((line) => line.startsWith("REACHED_SDK")),
		`an adapter loaded a blocked vendor SDK:\n${output}`,
	);
	assert.ok(
		!lines.some((line) => line.startsWith("UNEXPECTED")),
		`a lazy SDK load failed for the wrong reason:\n${output}`,
	);
	// A blocked load must arrive as a fatal MuxError attributed to the right
	// substrate, AND it must carry the hook's own marker.
	//
	// The marker is what closes a hole this suite had until 2026-08-02. The
	// blocker matched specifiers exactly, so when ./e2b.ts started importing
	// `e2b/dist/index.mjs` the hook stopped intercepting it: the real SDK
	// loaded, `list()` failed on the fake API key, and e2b's own message
	// contains "e2b", so the lane still printed GATED and this test still went
	// green -- measured, by reverting the matcher and watching it pass. Nothing
	// here distinguished "the hook refused the SDK" from "the SDK loaded and
	// then failed". VENDOR_SDK_RESOLVED does, because only the hook emits it.
	//
	// This also replaces an assertion on the literal string "is not installed".
	// That string stopped being the right property the same day: the loaders
	// relabelled EVERY load failure that way, so on a Node without require(ESM)
	// they told callers to reinstall an e2b that was already installed and threw
	// the real ERR_REQUIRE_ESM away -- which is also why the marker survives to
	// be asserted on now. "Not installed" is claimed only for
	// ERR_MODULE_NOT_FOUND, and the taxonomy below is what the contract needs.
	for (const substrate of ["e2b", "sprites", "vercel"]) {
		const gated = lines.find((line) =>
			line.startsWith(`GATED ${substrate} MuxError/fatal/${substrate} `),
		);
		assert.ok(
			gated,
			`${substrate}'s blocked SDK load must surface as a fatal MuxError scoped to ${substrate}:\n${output}`,
		);
		assert.match(
			gated,
			/VENDOR_SDK_RESOLVED:/,
			`${substrate} failed for some reason other than the blocker, so the SDK was reachable and this test proves nothing. Check that BLOCKER_SOURCE still matches the specifier the adapter imports:\n${output}`,
		);
	}
});

// ---------------------------------------------------------------------------
// Capability coherence: a declared value must match observable behavior.
// ---------------------------------------------------------------------------

for (const lane of LANES) {
	test(`${lane.substrate}: declared capabilities match the table and the handle`, async () => {
		await withLane(lane, {}, async (harness) => {
			const caps = harness.provider.capabilities;
			assert.equal(caps.pty, lane.expect.pty);
			assert.equal(caps.streamingExec, lane.expect.streamingExec);
			assert.ok(PTY_SUPPORTS.has(caps.pty), `pty ${caps.pty} is not a declared value`);
			assert.ok(
				caps.detachedWork === "reliable" || caps.detachedWork === "throttled",
				`detachedWork ${caps.detachedWork} is not a declared value`,
			);
			const machine = await machineFor(harness);
			assert.equal(
				machine.capabilities,
				caps,
				"the handle must declare the SAME capabilities object as the provider; two objects drift",
			);
			assert.equal(machine.substrate, lane.substrate);
			assert.ok(machine.id.length > 0, "a handle must carry the vendor's id");
		});
	});

	test(`${lane.substrate}: streamingExec matches the delivery the lane provides`, async () => {
		await withLane(lane, {}, async (harness) => {
			const machine = await machineFor(harness);
			const events: string[] = [];
			const stdout: string[] = [];
			for await (const event of machine.execStream("emit-two-chunks")) {
				events.push(event.type);
				if (event.type === "stdout") stdout.push(event.data);
			}
			assert.equal(
				events.at(-1),
				"exit",
				"a stream must end with exactly one exit event so a consumer can stop",
			);
			assert.equal(events.filter((type) => type === "exit").length, 1);
			if (lane.expect.streamingExec) {
				// Two vendor chunks must arrive as two events, in order.
				assert.deepEqual(
					stdout,
					[...STREAM_CHUNKS],
					"a lane declaring streamingExec must deliver incrementally",
				);
			} else {
				// Declared false: the batch API only exposes output once the
				// execution is terminal, so the same two chunks arrive as one event.
				// The contract member still exists and still terminates.
				assert.deepEqual(
					stdout,
					[STREAM_CHUNKS.join("")],
					"a lane declaring streamingExec=false must still deliver the whole output once",
				);
			}
		});
	});

	test(`${lane.substrate}: pty support routes the way it is declared`, async () => {
		await withLane(lane, {}, async (harness) => {
			const machine = await machineFor(harness);
			const tmuxSetup = /tmux has-session/;
			if (lane.expect.pty === "none") {
				// No lane declares "none" today. If one does, openPty must refuse
				// rather than hand back a handle that cannot carry a terminal.
				await rejectsWith(
					"openPty",
					() => machine.openPty(),
					"not_supported",
					lane.substrate,
				);
				return;
			}
			const anonymous = await machine.openPty({ cols: 80, rows: 24 });
			await anonymous.close();
			const anonymousPayloads = harness.spy.payloads().join("\n");
			if (lane.expect.pty === "native") {
				assert.ok(
					!tmuxSetup.test(anonymousPayloads),
					"a native-pty lane must not route an anonymous pty through openTmuxPty",
				);
			} else {
				assert.match(
					anonymousPayloads,
					tmuxSetup,
					"a tmux-pty lane must host the session in tmux on the sandbox",
				);
			}

			// A NAMED session is a separate axis: it needs reattach-with-scrollback,
			// which a pid-addressed native pty cannot provide.
			const named = lane.open();
			try {
				const second = await machineFor(named);
				const session = await second.openPty({ session: "conf-session" });
				await session.close();
				const namedPayloads = named.spy.payloads().join("\n");
				if (lane.expect.namedPtyUsesTmux) {
					assert.match(
						namedPayloads,
						tmuxSetup,
						"a named session must be durable; this lane declares tmux hosting",
					);
				} else {
					assert.ok(
						!tmuxSetup.test(namedPayloads),
						"this lane declares server-side detachable sessions, so tmux must not be used",
					);
					assert.ok(
						named.spy.touches.some((touch) => /createSession|attachSession/.test(touch)),
						"a native named session must use the vendor's own session primitive",
					);
				}
			} finally {
				named.dispose();
			}
		});
	});

	test(`${lane.substrate}: publicUrl answers exactly what the port model claims`, async () => {
		await withLane(lane, {}, async (harness) => {
			const machine = await machineFor(harness);
			const ports = harness.provider.capabilities.publicPorts;
			for (const probe of lane.expect.publicUrlProbes) {
				const url = await machine.publicUrl(probe.port);
				if (probe.url) {
					assert.ok(
						typeof url === "string" && url.startsWith("https://"),
						`port ${probe.port} must map to an https URL, got ${String(url)}`,
					);
				} else {
					assert.equal(
						url,
						null,
						`port ${probe.port} has no public route and must resolve to null, not a URL that 404s`,
					);
				}
			}
			// The declared model has to agree with the probes above, so a lane
			// cannot claim any-port while refusing ports.
			if (ports?.model === "any-port") {
				assert.ok(
					lane.expect.publicUrlProbes.every((probe) => probe.url),
					"model any-port cannot have a port that resolves to null",
				);
			}
			if (ports?.fixed && ports.fixed.length > 0) {
				for (const probe of lane.expect.publicUrlProbes) {
					assert.equal(
						probe.url,
						ports.fixed.includes(probe.port),
						`fixed ports ${ports.fixed.join(", ")} must be exactly the ports that resolve`,
					);
				}
			}
		});
	});

	test(`${lane.substrate}: detached work is launched the way detachedWork declares`, async () => {
		await withLane(lane, {}, async (harness) => {
			const machine = await machineFor(harness);
			await machine.execBackground("sleep 45");
			const payloads = harness.spy.payloads().join("\n");
			const detachedWork = harness.provider.capabilities.detachedWork;
			switch (lane.expect.backgroundLauncher) {
				case "vendor-native":
					assert.ok(
						harness.spy.shell.some((call) => call.detached),
						"this lane declares the vendor's own detach flag; none was sent",
					);
					assert.ok(
						!/tmux|setsid|nohup/.test(payloads),
						"a vendor-native detach must not smuggle in a shell daemonizer",
					);
					break;
				case "detachable-session":
					// Measured 2026-08-01: setsid/nohup still blocked on the process
					// group here, and a detached curl that takes 0.11s interactively
					// stalled indefinitely. Only the tmux server survives.
					assert.match(
						payloads,
						/tmux new-session -d/,
						"throttled detached work needs a detachable session, not nohup",
					);
					assert.equal(
						detachedWork,
						"throttled",
						"only a throttled lane should need a detachable session",
					);
					break;
				case "process-detach":
					assert.match(
						payloads,
						/setsid|nohup/,
						"this lane declares process-level detachment; none was applied",
					);
					break;
			}
		});
	});
}

// ---------------------------------------------------------------------------
// Constraint cross-check: an unknown fact must REJECT, never pass optimistically.
// ---------------------------------------------------------------------------

/**
 * A one-key constraint, written out rather than computed: a computed key widens
 * to an index signature and stops type-checking against RouteConstraints.
 */
function booleanConstraint(
	key: "reattach" | "publicUrl" | "streamingExec",
): RouteConstraints {
	if (key === "reattach") return { reattach: true };
	if (key === "publicUrl") return { publicUrl: true };
	return { streamingExec: true };
}

type SizeAxis = {
	key: Extract<RouteConstraintKey, "minVcpu" | "minMemoryMib" | "minDiskGib">;
	base: number | "unknown";
	ceiling: number | "unknown";
	/** Whether the mux can ask for more of THIS axis and be sure it took. */
	request: string;
	make(value: number): RouteConstraints;
};

for (const lane of LANES) {
	test(`${lane.substrate}: an unknown limit rejects a constraint that needs it`, () => {
		const harness = lane.openUncredentialed();
		try {
			const caps = harness.provider.capabilities;
			const profile = profileFor(lane.substrate, caps);
			const limits = caps.limits ?? UNKNOWN_LIMITS;

			const fails = (constraints: RouteConstraints, key: RouteConstraintKey): void => {
				const failures = checkConstraints(profile, constraints);
				assert.ok(
					failures.some((failure) => failure.constraint === key),
					`${key} must be rejected here: ${JSON.stringify(constraints)}`,
				);
			};
			const passes = (constraints: RouteConstraints, key: RouteConstraintKey): void => {
				const failures = checkConstraints(profile, constraints);
				assert.ok(
					!failures.some((failure) => failure.constraint === key),
					`${key} must be satisfiable here: ${JSON.stringify(constraints)} -- ${failures
						.map((failure) => failure.reason)
						.join("; ")}`,
				);
			};

			// Runtime ceiling. Unknown must not read as unbounded.
			if (limits.maxRuntimeMs === "unknown") {
				fails({ maxRuntimeMs: 1 }, "maxRuntimeMs");
			} else {
				passes({ maxRuntimeMs: limits.maxRuntimeMs }, "maxRuntimeMs");
				fails({ maxRuntimeMs: limits.maxRuntimeMs + 1 }, "maxRuntimeMs");
			}

			// Concurrency. Unknown must not read as unlimited.
			if (limits.maxConcurrentSandboxes === "unknown") {
				fails({ minConcurrency: 1 }, "minConcurrency");
			} else {
				passes({ minConcurrency: limits.maxConcurrentSandboxes }, "minConcurrency");
				fails({ minConcurrency: limits.maxConcurrentSandboxes + 1 }, "minConcurrency");
			}

			// Size floors. Asking only counts when the request is honored.
			const axes: readonly SizeAxis[] = [
				{
					key: "minVcpu",
					base: limits.baseVcpu,
					ceiling: limits.maxVcpu,
					request: limits.resourceRequest,
					make: (value) => ({ minVcpu: value }),
				},
				{
					key: "minMemoryMib",
					base: limits.baseMemoryMib,
					ceiling: limits.maxMemoryMib,
					request: limits.resourceRequest,
					make: (value) => ({ minMemoryMib: value }),
				},
				{
					// CreateSandboxOptions.resources carries no disk axis, so no lane
					// can be asked for a bigger disk however the vendor feels about it.
					key: "minDiskGib",
					base: limits.baseDiskGib,
					ceiling: limits.maxDiskGib,
					request: "unsupported",
					make: (value) => ({ minDiskGib: value }),
				},
			];
			for (const axis of axes) {
				if (typeof axis.base === "number") {
					passes(axis.make(axis.base), axis.key);
					if (axis.request !== "honored") {
						fails(axis.make(axis.base + 1), axis.key);
					}
				} else {
					// No published baseline: a floor of ONE must already lose the lane.
					fails(axis.make(1), axis.key);
					if (axis.request === "honored" && typeof axis.ceiling === "number") {
						assert.fail(
							`${axis.key}: an honored request with no baseline is incoherent -- routing would promise a size nothing measured`,
						);
					}
				}
			}

			// GPU: having accelerators is not enough, the mux must be able to ask.
			const gpu = caps.gpu;
			if (gpu?.available === true && gpu.request === "honored") {
				passes({ gpu: true }, "gpu");
			} else {
				fails({ gpu: true }, "gpu");
			}

			// Region: placement counts, "close to you" does not.
			const region = caps.region?.default ?? "unknown";
			if (region === "unknown") {
				// The literal absent value is not a region and must never satisfy.
				fails({ region: "unknown" }, "region");
				fails({ region: "iad1" }, "region");
			} else {
				passes({ region }, "region");
				fails({ region: `${region}-not-a-region` }, "region");
			}

			// Egress: only the posture a fresh sandbox actually has, unless the
			// adapter can change it and forwards the change.
			const egress = caps.network?.egress ?? "unknown";
			const control = caps.network?.control ?? "unknown";
			for (const policy of EGRESS_POLICIES) {
				if (egress === policy || control === "honored") {
					passes({ egress: policy }, "egress");
				} else {
					fails({ egress: policy }, "egress");
				}
			}

			// Fork: the mux exposes no fork operation, so no lane may satisfy one.
			if (caps.fork?.vendor === true && caps.fork.exposed) {
				passes({ fork: true }, "fork");
			} else {
				fails({ fork: true }, "fork");
			}

			// Public ports.
			const ports = caps.publicPorts;
			const model = ports?.model ?? "unknown";
			const muxMax = ports?.muxMax ?? "unknown";
			if (model === "any-port") {
				passes({ minPublicPorts: 4 }, "minPublicPorts");
			} else if (typeof muxMax === "number") {
				passes({ minPublicPorts: muxMax }, "minPublicPorts");
				fails({ minPublicPorts: muxMax + 1 }, "minPublicPorts");
			} else {
				fails({ minPublicPorts: 1 }, "minPublicPorts");
			}

			// The five behavioral axes are always declared, so each must satisfy
			// itself and refuse anything stronger.
			passes({ pty: caps.pty }, "pty");
			if (caps.pty !== "native") fails({ pty: "native" }, "pty");
			passes({ persistence: caps.persistence }, "persistence");
			for (const key of ["reattach", "publicUrl", "streamingExec"] as const) {
				const constraint = booleanConstraint(key);
				if (caps[key]) passes(constraint, key);
				else fails(constraint, key);
			}
		} finally {
			harness.dispose();
		}
	});
}

// ---------------------------------------------------------------------------
// Optional members: absent, or honoring their contract. Never a stub.
// ---------------------------------------------------------------------------

for (const lane of LANES) {
	test(`${lane.substrate}: optional members are present exactly where declared`, async () => {
		await withLane(lane, {}, async (harness) => {
			const { provider } = harness;
			// describe and remove are not optional in practice: every lane must
			// offer a status read and a destroy that do not resume.
			assert.equal(typeof provider.describe, "function", "no describe()");
			assert.equal(typeof provider.remove, "function", "no remove()");
			assert.equal(
				typeof provider.park,
				lane.expect.park ? "function" : "undefined",
				lane.expect.park
					? "this lane can pause by id and must expose park()"
					: "no vendor call can park by id here; a park() that resolved without parking would be a false claim",
			);
			const machine = await machineFor(harness);
			assert.equal(
				typeof machine.keepAlive,
				lane.expect.keepAlive ? "function" : "undefined",
				lane.expect.keepAlive
					? "this lane can extend the idle budget and must expose keepAlive()"
					: "this substrate parks on its own schedule; keepAlive must be absent, not a no-op",
			);
			if (machine.keepAlive) {
				const before = harness.spy.touches.length;
				await machine.keepAlive(600_000);
				const after = harness.spy.touches.slice(before);
				assert.ok(
					after.some((touch) => touch.includes("600000")),
					`keepAlive must forward the budget to the vendor, saw ${after.join(", ")}`,
				);
			}
		});
	});

	test(`${lane.substrate}: connect() then use DOES resume, so the guard is not vacuous`, async () => {
		await withLane(lane, { parked: true }, async ({ provider, spy }) => {
			const machine = await provider.connect(lane.expect.sampleId);
			await machine.exec("true");
			assert.ok(
				spy.resumed(),
				"the fixture must record a resume when the resuming path runs, or the no-wake assertions prove nothing",
			);
		});
	});

	test(`${lane.substrate}: describe/remove/park never reach the resuming entry point`, async () => {
		for (const member of ["describe", "remove", "park"] as const) {
			// Parked on purpose: a wake against a machine that is already running
			// is a no-op on some lanes, so only a parked one can prove anything.
			await withLane(lane, { parked: true }, async ({ provider, spy }) => {
				const call = provider[member];
				if (!call) {
					assert.equal(
						member,
						"park",
						`${member} is not optional; only park() may be absent`,
					);
					return;
				}
				const invoke = call as (id: string) => Promise<unknown>;
				const result = await invoke.call(provider, lane.expect.sampleId);
				assert.ok(
					spy.touches.length > 0,
					`${member}() never called the vendor at all, so "did not resume" proves nothing`,
				);
				assert.equal(
					spy.resumed(),
					false,
					`${member}() resumed a parked sandbox: ${spy.touches.join(", ")}`,
				);
				if (member === "describe") {
					const description = result as SandboxDescription;
					assert.ok(
						MACHINE_STATES.has(description.state),
						`describe() returned an invented state ${description.state}`,
					);
					// All four vendor words for "parked" -- paused, stopped, cold,
					// sleeping -- must normalize to the same state, or a fleet view
					// cannot be rendered from the union.
					assert.equal(
						description.state,
						"sleeping",
						`a parked machine must describe as sleeping, got ${description.state} (rawPhase ${String(description.rawPhase)})`,
					);
					assert.equal(
						typeof description.rawPhase,
						"string",
						"the vendor's own status word must survive, since sleeping is deliberately coarse",
					);
				}
			});
		}
	});

	test(`${lane.substrate}: remove is idempotent for an id the vendor forgot`, async () => {
		// A 404 on remove means the requested end state already holds. Throwing
		// here is what left orphaned quota in POSTMORTEM-2026-05-18 item 5.
		await withLane(lane, { failStatus: 404 }, async ({ provider }) => {
			await provider.remove?.(lane.expect.sampleId);
		});
	});
}

// ---------------------------------------------------------------------------
// exec: arbitrary shell must survive the transport verbatim.
// ---------------------------------------------------------------------------

for (const lane of LANES) {
	test(`${lane.substrate}: exec wraps arbitrary shell in the base64 pattern`, async () => {
		await withLane(lane, {}, async (harness) => {
			const machine = await machineFor(harness);
			const result = await machine.exec(NASTY_COMMAND);
			assert.equal(result.exitCode, 0);
			assert.equal(typeof result.durationMs, "number");
			assert.ok(result.durationMs >= 0, "durationMs must be measured, never negative");

			const sent = harness.spy.shell.filter((call) => call.mode === "exec");
			assert.ok(sent.length > 0, "exec() sent nothing to the vendor");
			const script = sent.at(-1)?.script ?? "";
			assert.match(
				script,
				BASE64_WRAPPER,
				"arbitrary shell must ride base64 through bash; JSON-style quoting turns real newlines into literal \\n and breaks heredocs",
			);
			assert.ok(
				!script.includes(NASTY_COMMAND),
				"the raw command reached the vendor unwrapped, so quoting can break it",
			);
			// Round trip: what the sandbox will run has to be the command asked for.
			assert.ok(
				harness.spy.payloads("exec").some((payload) => payload.includes(NASTY_COMMAND)),
				`no payload decoded back to the command; got ${harness.spy.payloads("exec").join(" | ")}`,
			);
		});
	});

	test(`${lane.substrate}: writeFile never puts file content in a shell script`, async () => {
		// Two lanes hand bytes to a vendor file API and two build a shell
		// redirect; either way the content must not be able to break out of it.
		await withLane(lane, {}, async (harness) => {
			const machine = await machineFor(harness);
			await machine.writeFile("/tmp/am-conf.txt", NASTY_COMMAND);
			for (const call of harness.spy.shell) {
				assert.ok(
					!call.script.includes(NASTY_COMMAND),
					`raw file content reached the shell verbatim: ${call.script.slice(0, 120)}`,
				);
				// One layer down as well: a lane that writes through exec wraps the
				// whole redirect, so the content must still be encoded INSIDE it.
				assert.ok(
					!decodedPayload(call.script).includes(NASTY_COMMAND),
					`raw file content was interpolated into a wrapped shell script: ${decodedPayload(
						call.script,
					).slice(0, 160)}`,
				);
			}
		});
	});

	test(`${lane.substrate}: state() answers from the normalized vocabulary`, async () => {
		await withLane(lane, {}, async (harness) => {
			const machine = await machineFor(harness);
			const state = await machine.state();
			assert.ok(MACHINE_STATES.has(state), `state() invented ${state}`);
			// The exact value legitimately differs -- a warm sprite reads
			// `sleeping` because it auto-suspends and auto-wakes -- but a machine
			// that was just provisioned is never gone.
			assert.notEqual(
				state,
				"destroyed",
				"a machine create() just returned cannot report destroyed",
			);
		});
	});

	test(`${lane.substrate}: list() returns normalized SandboxInfo`, async () => {
		await withLane(lane, {}, async ({ provider }) => {
			const infos = await provider.list();
			assert.ok(infos.length > 0, "the fixture serves one sandbox; list() dropped it");
			for (const info of infos) {
				assert.equal(info.substrate, lane.substrate, "list() mislabeled the substrate");
				assert.ok(info.id.length > 0, "a listed sandbox needs an id to act on");
				assert.ok(
					MACHINE_STATES.has(info.state),
					`list() invented the state ${info.state}`,
				);
			}
		});
	});
}

/**
 * Fixtures for the substrate conformance suite (./conformance.test.ts).
 *
 * Four adapters implement one contract (`SandboxProvider` in ../types.ts) and
 * until now nothing proved they AGREE. Every behavioral difference found this
 * session -- Sprites throttling detached work, the nvm-shim node hang, tmux
 * pipe-pane reattach, secrets in Sprites exec URLs, connect() resuming a parked
 * sandbox -- was found by hand on live infrastructure, one substrate at a time.
 * This module supplies one vendor double per lane so a single set of assertions
 * can run against all four with no network and no vendor SDK.
 *
 * Two rules shape everything here:
 *
 *   1. A lane may only DIFFER where the difference is declared. `LANES[i].expect`
 *      is that declaration, with the reason beside each value. A conformance test
 *      reads the table; it never skips an assertion, because a skip is how a
 *      regression hides.
 *   2. Every double RECORDS rather than merely responds. "describe() did not
 *      resume" has to be provable, and it is only provable if the double would
 *      have recorded a resume had one happened -- so `VendorSpy.resumed()` is
 *      driven positive by the resuming path in the suite itself.
 */

import { Buffer } from "node:buffer";

import { createDedalusProvider } from "./dedalus.js";
import { createE2bProvider, type E2bSdk } from "./e2b.js";
import { createSpritesProvider } from "./sprites.js";
import { createVercelProvider } from "./vercel.js";
import type { PtySupport, SandboxProvider, SubstrateKind } from "../types.js";

/** A command the substrate was asked to run, as the vendor surface saw it. */
export type ShellCall = {
	/** Which contract member issued it. */
	mode: "exec" | "stream" | "background" | "pty";
	/** Verbatim script handed to the vendor, before any decoding. */
	script: string;
	/** The vendor's own detach flag rode along (E2B `background`, Vercel `detached`). */
	detached: boolean;
};

/** Promise protocol, not a vendor API: `await Promise.resolve(proxy)` probes these. */
const PROMISE_PROBES = new Set(["then", "catch", "finally"]);

/**
 * Records every vendor-surface touch for one provider instance.
 *
 * `touches` exists for the credential gate: an uncredentialed provider must
 * reject before ANY vendor member is read, and only an empty list proves that.
 */
export class VendorSpy {
	readonly touches: string[] = [];
	readonly shell: ShellCall[] = [];
	private wokeSomething = false;

	/**
	 * Whether the machine the doubles describe is currently parked.
	 *
	 * The no-wake members are only testable against a PARKED machine: on dedalus
	 * the wake path short-circuits when the machine is already running, so a
	 * describe() that called wake() went undetected until this existed.
	 */
	constructor(public parked = false) {}

	touch(member: string): void {
		this.touches.push(member);
	}

	shellCall(call: ShellCall): void {
		this.shell.push(call);
	}

	/**
	 * Called by the double from the lane's RESUMING entry point only -- which is
	 * also what un-parks the machine, exactly as the substrate behaves.
	 */
	markResumed(): void {
		this.wokeSomething = true;
		this.parked = false;
	}

	resumed(): boolean {
		return this.wokeSomething;
	}

	/** Scripts of one kind, decoded out of their base64 wrapper. */
	payloads(mode?: ShellCall["mode"]): string[] {
		return this.shell
			.filter((call) => mode === undefined || call.mode === mode)
			.map((call) => decodedPayload(call.script));
	}
}

/**
 * Wrap a vendor surface so reading any member is recorded.
 *
 * Methods come back bound to the real target: an unbound method would run with
 * the proxy as `this` and fill `touches` with the double's own bookkeeping.
 */
function recordAccess<T extends object>(target: T, spy: VendorSpy, label: string): T {
	return new Proxy(target, {
		get(object, property): unknown {
			if (typeof property === "string" && !PROMISE_PROBES.has(property)) {
				spy.touch(`${label}.${property}`);
			}
			const value = Reflect.get(object, property, object);
			return typeof value === "function" ? (value as () => unknown).bind(object) : value;
		},
	});
}

/**
 * The one quoting-safe wrapper every adapter must use for arbitrary shell.
 *
 * The base64 alphabet contains no quote, so the single-quoted literal cannot be
 * broken out of; JSON-style escaping turns real newlines into literal `\n` and
 * silently breaks heredocs, which is a bug this repo has already paid for.
 */
export const BASE64_WRAPPER = /printf '%s' '[A-Za-z0-9+/]+={0,2}' \| base64 -d \| bash/;

/** Every base64 blob in a wrapped script, decoded and joined. */
export function decodedPayload(script: string): string {
	const decoded: string[] = [];
	for (const match of script.matchAll(/'([A-Za-z0-9+/]{16,}={0,2})'/g)) {
		decoded.push(Buffer.from(match[1], "base64").toString("utf8"));
	}
	return decoded.length > 0 ? decoded.join("\n") : script;
}

/**
 * A command that breaks every naive quoting scheme at once: an escaped single
 * quote, a heredoc that needs real newlines, command substitution, backticks
 * and a trailing backslash.
 */
export const NASTY_COMMAND = [
	`printf '%s\\n' 'it'\\''s fine'`,
	"cat <<'EOF'",
	'$(whoami) `hostname` "double" \'single\' back\\slash',
	"EOF",
].join("\n");

/** Two output chunks, so incremental delivery is distinguishable from batching. */
export const STREAM_CHUNKS = ["chunk-a", "chunk-b"] as const;

/** How a lane launches work that must outlive the launching connection. */
export type BackgroundLauncher =
	/** The vendor's own detach flag; no shell wrapper involved. */
	| "vendor-native"
	/** setsid/nohup: the process leaves the connection's group. */
	| "process-detach"
	/** A detachable session (tmux server), the only thing that works when
	 *  detached work is throttled. */
	| "detachable-session";

/**
 * Where one lane is allowed to differ, and why.
 *
 * Anything not in this table is a SHARED assertion and must hold identically on
 * all four lanes.
 */
export type LaneExpectation = {
	/** Vars `ready()` must name when the lane holds no credentials. */
	readonly missingCredentials: readonly RegExp[];
	/** An id shaped like this lane's own (E2B sandbox id, sprite name, ...). */
	readonly sampleId: string;
	readonly pty: PtySupport;
	/**
	 * Whether a NAMED pty session is hosted in tmux even on a native-pty lane.
	 *
	 * E2B's native pty is addressed by pid, which is not a durable name, so
	 * named sessions deliberately fall back to tmux-over-exec. Sprites has
	 * server-side detachable sessions (createSession / attachSession) and must
	 * NOT route through tmux -- routing it there would silently drop the
	 * scrollback reattach the vendor already provides.
	 */
	readonly namedPtyUsesTmux: boolean;
	readonly streamingExec: boolean;
	readonly backgroundLauncher: BackgroundLauncher;
	/** Provider-level `park()`; absent where no vendor call can park by id. */
	readonly park: boolean;
	/** Handle-level `keepAlive()`; absent where the substrate owns the schedule. */
	readonly keepAlive: boolean;
	/** What `publicUrl(port)` must answer, given the declared port model. */
	readonly publicUrlProbes: readonly { readonly port: number; readonly url: boolean }[];
};

export type LaneHarness = {
	readonly provider: SandboxProvider;
	readonly spy: VendorSpy;
	/** Restores anything global the double patched (dedalus stubs fetch). */
	dispose(): void;
};

export type LaneOptions = {
	/**
	 * Make every vendor call fail with this HTTP status, in the shape this
	 * vendor really produces (a `statusCode` field, an `error.response.status`,
	 * a real Response, a message the SDK writes the code into).
	 */
	readonly failStatus?: number;
	/**
	 * Start the machine parked, reporting this lane's own parked phase (E2B
	 * "paused", Vercel "stopped", Sprites "cold", Dedalus "sleeping").
	 *
	 * Required for the no-wake assertions: a wake against an already-running
	 * machine is a no-op on some lanes, so only a parked machine can prove a
	 * status read did not cause one.
	 */
	readonly parked?: boolean;
};

export type Lane = {
	readonly substrate: SubstrateKind;
	readonly expect: LaneExpectation;
	/** Credentialed provider over a recording double. */
	open(options?: LaneOptions): LaneHarness;
	/** Same double, no credentials: it must stay untouched. */
	openUncredentialed(): LaneHarness;
};

// ---------------------------------------------------------------------------
// Minimal event emitter, for the Sprites SDK's process objects.
// ---------------------------------------------------------------------------

type Listener = (value?: unknown) => void;

class FakeEmitter {
	private readonly listeners = new Map<
		string,
		Array<{ fn: Listener; once: boolean }>
	>();

	on(event: string, fn: Listener): this {
		this.add(event, fn, false);
		return this;
	}

	once(event: string, fn: Listener): this {
		this.add(event, fn, true);
		return this;
	}

	off(event: string, fn: Listener): this {
		const entries = this.listeners.get(event);
		if (entries) {
			this.listeners.set(
				event,
				entries.filter((entry) => entry.fn !== fn),
			);
		}
		return this;
	}

	emit(event: string, value?: unknown): void {
		for (const entry of [...(this.listeners.get(event) ?? [])]) {
			if (entry.once) this.off(event, entry.fn);
			entry.fn(value);
		}
	}

	private add(event: string, fn: Listener, once: boolean): void {
		const entries = this.listeners.get(event) ?? [];
		entries.push({ fn, once });
		this.listeners.set(event, entries);
	}
}

// ---------------------------------------------------------------------------
// e2b. Resuming entry point: Sandbox.connect (it auto-resumes a paused VM).
// ---------------------------------------------------------------------------

const CREATED_AT = "2026-08-02T00:00:00.000Z";

function e2bError(status: number): Error {
	// The SDK writes the status into the message; the adapter classifies on it.
	return new Error(`${status} vendor said no`);
}

class FakeE2bSandbox {
	readonly sandboxId: string;
	readonly commands: {
		run(script: string, options?: Record<string, unknown>): Promise<unknown>;
	};
	readonly pty: {
		create(options: Record<string, unknown>): Promise<unknown>;
		sendInput(pid: number, bytes: Uint8Array): Promise<void>;
		resize(pid: number, size: Record<string, number>): Promise<void>;
		kill(pid: number): Promise<void>;
	};
	readonly files: { write(path: string, data: unknown): Promise<void> };

	constructor(
		private readonly spy: VendorSpy,
		id: string,
	) {
		this.sandboxId = id;
		this.commands = {
			run: async (script, options) => {
				const onStdout = options?.["onStdout"] as ((data: string) => void) | undefined;
				const onStderr = options?.["onStderr"] as ((data: string) => void) | undefined;
				const background = options?.["background"] === true;
				spy.shellCall({
					mode: background ? "background" : onStdout ? "stream" : "exec",
					script,
					detached: background,
				});
				spy.touch("commands.run");
				if (background) return { disconnect: async (): Promise<void> => undefined };
				if (onStdout) {
					for (const chunk of STREAM_CHUNKS) onStdout(chunk);
					onStderr?.("");
				}
				return { stdout: "ok", stderr: "", exitCode: 0 };
			},
		};
		let killPty: (() => void) | null = null;
		this.pty = {
			create: async (options) => {
				spy.touch("pty.create");
				void options;
				// A native pty runs no shell of ours; the script is a marker so a
				// tmux-payload search over `spy.shell` cannot match by accident.
				spy.shellCall({ mode: "pty", script: "native-pty", detached: false });
				const exit = new Promise<{ exitCode: number }>((resolve) => {
					killPty = () => resolve({ exitCode: 0 });
				});
				return {
					pid: 4242,
					wait: () => exit,
					kill: async () => {
						killPty?.();
					},
				};
			},
			sendInput: async () => {
				spy.touch("pty.sendInput");
			},
			resize: async () => {
				spy.touch("pty.resize");
			},
			kill: async () => {
				spy.touch("pty.kill");
				killPty?.();
			},
		};
		this.files = {
			write: async () => {
				spy.touch("files.write");
			},
		};
	}

	getHost(port: number): string {
		this.spy.touch("getHost");
		// Any port maps to a host with no declaration: capabilities.publicPorts
		// declares model "any-port", and this is what has to back that claim.
		return `${port}-${this.sandboxId}.e2b.app`;
	}

	async setTimeout(ms: number): Promise<void> {
		this.spy.touch(`setTimeout:${ms}`);
	}
}

class FakeE2bStatics {
	constructor(
		private readonly spy: VendorSpy,
		private readonly failStatus?: number,
	) {}

	async create(): Promise<FakeE2bSandbox> {
		this.spy.touch("Sandbox.create");
		this.fail();
		return new FakeE2bSandbox(this.spy, "sbx-conf");
	}

	async connect(id: string): Promise<FakeE2bSandbox> {
		this.spy.touch("Sandbox.connect");
		// THE resuming call on this lane.
		this.spy.markResumed();
		this.fail();
		return new FakeE2bSandbox(this.spy, id);
	}

	async getInfo(id: string): Promise<Record<string, unknown>> {
		this.spy.touch("Sandbox.getInfo");
		this.fail();
		return {
			sandboxId: id,
			state: this.spy.parked ? "paused" : "running",
			startedAt: new Date(CREATED_AT),
			cpuCount: 2,
			memoryMB: 478,
		};
	}

	async kill(): Promise<boolean> {
		this.spy.touch("Sandbox.kill");
		this.fail();
		return true;
	}

	async pause(): Promise<boolean> {
		this.spy.touch("Sandbox.pause");
		this.fail();
		return true;
	}

	list(): { hasNext: boolean; nextItems(): Promise<unknown[]> } {
		this.spy.touch("Sandbox.list");
		this.fail();
		const page = {
			hasNext: true,
			nextItems: async (): Promise<unknown[]> => {
				page.hasNext = false;
				return [
					{
						sandboxId: "sbx-conf",
						state: "running",
						startedAt: new Date(CREATED_AT),
						metadata: { name: "conf" },
					},
				];
			},
		};
		return page;
	}

	private fail(): void {
		if (this.failStatus !== undefined) throw e2bError(this.failStatus);
	}
}

const e2bLane: Lane = {
	substrate: "e2b",
	expect: {
		missingCredentials: [/E2B_API_KEY/],
		sampleId: "sbx-conf",
		pty: "native",
		namedPtyUsesTmux: true,
		streamingExec: true,
		backgroundLauncher: "vendor-native",
		park: true,
		keepAlive: true,
		// model "any-port": getHost(port) needs no create-time declaration.
		publicUrlProbes: [
			{ port: 8642, url: true },
			{ port: 4242, url: true },
		],
	},
	open(options = {}): LaneHarness {
		const spy = new VendorSpy(options.parked);
		const sdk = recordAccess(
			{ Sandbox: new FakeE2bStatics(spy, options.failStatus) },
			spy,
			"sdk",
		);
		return {
			provider: createE2bProvider({ apiKey: "e2b-conf" }, sdk as unknown as E2bSdk),
			spy,
			dispose: () => undefined,
		};
	},
	openUncredentialed(): LaneHarness {
		const spy = new VendorSpy();
		const sdk = recordAccess({ Sandbox: new FakeE2bStatics(spy) }, spy, "sdk");
		return {
			provider: createE2bProvider({}, sdk as unknown as E2bSdk),
			spy,
			dispose: () => undefined,
		};
	},
};

// ---------------------------------------------------------------------------
// sprites. Resuming entry point: any request to the SPRITE (an exec, a session,
// its proxy URL). The control-plane REST surface does not wake it.
// ---------------------------------------------------------------------------

function spritesError(status: number): Error {
	const error = new Error(`sprites said ${status}`) as Error & { statusCode: number };
	error.statusCode = status;
	return error;
}

class FakeSpriteCommand extends FakeEmitter {
	readonly stdout = new FakeEmitter();
	readonly stderr = new FakeEmitter();
	readonly stdin = {
		write(_chunk: unknown, callback?: (error?: Error) => void): void {
			callback?.();
		},
	};

	resize(): void {}

	kill(): void {}
}

class FakeSprite {
	readonly name: string;
	readonly createdAt = new Date(CREATED_AT);
	config: { cpus?: number } | undefined = { cpus: 2 };
	readonly url = "https://conf.sprites.dev";

	constructor(
		private readonly spy: VendorSpy,
		name: string,
		private readonly failStatus?: number,
	) {
		this.name = name;
	}

	/**
	 * Measured live 2026-08-01: a sprite still answering in ~60ms reads "warm",
	 * and one left idle for ten minutes reads "cold" and 502s its next exec.
	 * Both normalize to `sleeping`, which is why the raw word has to survive.
	 */
	get status(): string {
		return this.spy.parked ? "cold" : "warm";
	}

	async execFileHTTP(
		_file: string,
		args: string[],
		_options?: Record<string, unknown>,
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		this.spy.touch("sprite.execFileHTTP");
		// An exec is what starts a suspended sprite.
		this.spy.markResumed();
		this.spy.shellCall({ mode: "exec", script: args[1] ?? "", detached: false });
		this.fail();
		return { stdout: "ok", stderr: "", exitCode: 0 };
	}

	spawn(
		_file: string,
		args: string[],
		options?: Record<string, unknown>,
	): FakeSpriteCommand {
		this.spy.touch("sprite.spawn");
		this.spy.markResumed();
		const tty = options?.["tty"] === true;
		this.spy.shellCall({
			mode: tty ? "pty" : "stream",
			script: args[1] ?? "",
			detached: false,
		});
		const proc = new FakeSpriteCommand();
		setTimeout(() => {
			if (tty) {
				proc.emit("spawn");
				return;
			}
			for (const chunk of STREAM_CHUNKS) proc.stdout.emit("data", chunk);
			proc.emit("exit", 0);
		}, 0);
		return proc;
	}

	createSession(
		_file: string,
		args: string[],
		_options?: Record<string, unknown>,
	): FakeSpriteCommand {
		this.spy.touch("sprite.createSession");
		this.spy.markResumed();
		this.spy.shellCall({ mode: "pty", script: args[1] ?? "", detached: false });
		const proc = new FakeSpriteCommand();
		setTimeout(() => {
			// The server announces the assigned session id, which is what makes a
			// later reattach possible without tmux.
			proc.emit("message", { type: "session_info", session_id: "sess-conf" });
			proc.emit("spawn");
		}, 0);
		return proc;
	}

	attachSession(): FakeSpriteCommand {
		this.spy.touch("sprite.attachSession");
		this.spy.markResumed();
		const proc = new FakeSpriteCommand();
		setTimeout(() => proc.emit("spawn"), 0);
		return proc;
	}

	async listSessions(): Promise<Array<{ id: string }>> {
		this.spy.touch("sprite.listSessions");
		return [];
	}

	filesystem(): {
		writeFile(path: string, content: unknown): Promise<void>;
		mkdir(path: string): Promise<void>;
		readFile(path: string): Promise<string>;
	} {
		return {
			writeFile: async () => {
				this.spy.touch("sprite.writeFile");
			},
			mkdir: async () => undefined,
			readFile: async () => {
				// No recorded session id: the named-pty path must then create one.
				throw new Error("ENOENT: no such file");
			},
		};
	}

	async updateURLSettings(): Promise<void> {
		this.spy.touch("sprite.updateURLSettings");
	}

	async destroy(): Promise<void> {
		this.spy.touch("sprite.destroy");
		this.fail();
	}

	private fail(): void {
		if (this.failStatus !== undefined) throw spritesError(this.failStatus);
	}
}

class FakeSpritesClient {
	constructor(
		private readonly spy: VendorSpy,
		private readonly failStatus?: number,
	) {}

	async createSprite(name: string): Promise<FakeSprite> {
		this.spy.touch("client.createSprite");
		this.fail();
		return new FakeSprite(this.spy, name, this.failStatus);
	}

	async getSprite(name: string): Promise<FakeSprite> {
		this.spy.touch("client.getSprite");
		this.fail();
		return new FakeSprite(this.spy, name, this.failStatus);
	}

	async deleteSprite(): Promise<void> {
		this.spy.touch("client.deleteSprite");
		this.fail();
	}

	async listAllSprites(): Promise<FakeSprite[]> {
		this.spy.touch("client.listAllSprites");
		this.fail();
		return [new FakeSprite(this.spy, "am-mux-conf")];
	}

	private fail(): void {
		if (this.failStatus !== undefined) throw spritesError(this.failStatus);
	}
}

type SpritesClientLike = Parameters<typeof createSpritesProvider>[1];

const spritesLane: Lane = {
	substrate: "sprites",
	expect: {
		missingCredentials: [/SPRITES_TOKEN/],
		sampleId: "am-mux-conf",
		pty: "native",
		// Server-side detachable sessions, so a named pty must NOT go via tmux.
		namedPtyUsesTmux: false,
		streamingExec: true,
		// detachedWork: "throttled" -- measured 2026-08-01. Only a detachable
		// session survives; setsid/nohup still blocked on the process group.
		backgroundLauncher: "detachable-session",
		park: false,
		keepAlive: false,
		// model "single-fixed": the sprite URL proxies to 8080 and nothing else.
		publicUrlProbes: [
			{ port: 8080, url: true },
			{ port: 4242, url: false },
		],
	},
	open(options = {}): LaneHarness {
		const spy = new VendorSpy(options.parked);
		const client = recordAccess(
			new FakeSpritesClient(spy, options.failStatus),
			spy,
			"client",
		);
		return {
			provider: createSpritesProvider(
				{ token: "sprites-conf" },
				client as unknown as SpritesClientLike,
			),
			spy,
			dispose: () => undefined,
		};
	},
	openUncredentialed(): LaneHarness {
		const spy = new VendorSpy();
		const client = recordAccess(new FakeSpritesClient(spy), spy, "client");
		return {
			provider: createSpritesProvider({}, client as unknown as SpritesClientLike),
			spy,
			dispose: () => undefined,
		};
	},
};

// ---------------------------------------------------------------------------
// vercel. Resuming entry point: Sandbox.get, which DEFAULTS to resume: true --
// so the flag as passed is the whole assertion.
// ---------------------------------------------------------------------------

const VERCEL_PORTS = new Set([3000, 8642, 18789]);

function vercelError(status: number): Error {
	const error = new Error(`vercel said ${status}`) as Error & {
		response: { status: number };
	};
	error.response = { status };
	return error;
}

class FakeVercelSandbox {
	readonly createdAt = new Date(CREATED_AT);
	readonly vcpus = 2;

	constructor(
		private readonly spy: VendorSpy,
		readonly name: string,
	) {}

	get status(): string {
		// The instance proxies the CURRENT SESSION's status; a parked sandbox has
		// a stopped one, and `Sandbox.get` defaults to resuming it.
		return this.spy.parked ? "stopped" : "running";
	}

	async runCommand(params: Record<string, unknown>): Promise<unknown> {
		const args = params["args"] as string[] | undefined;
		const detached = params["detached"] === true;
		const script = args?.[1] ?? "";
		this.spy.touch("sandbox.runCommand");
		if (!detached) {
			this.spy.shellCall({ mode: "exec", script, detached: false });
			return {
				stdout: async () => "ok",
				stderr: async () => "",
				exitCode: 0,
			};
		}
		// One vendor call serves two contract members. execStream passes the
		// caller's budget through, execBackground sends cmd/args/detached only,
		// so the presence of the key is what tells them apart here.
		this.spy.shellCall({
			mode: "timeoutMs" in params ? "stream" : "background",
			script,
			detached: true,
		});
		return {
			logs: async function* (): AsyncGenerator<{ stream: string; data: string }> {
				for (const chunk of STREAM_CHUNKS) yield { stream: "stdout", data: chunk };
			},
			wait: async () => ({ exitCode: 0 }),
			kill: async () => undefined,
		};
	}

	async writeFiles(): Promise<void> {
		this.spy.touch("sandbox.writeFiles");
	}

	domain(port: number): string {
		this.spy.touch("sandbox.domain");
		// Ports are declared at create time; an undeclared one has no route.
		if (!VERCEL_PORTS.has(port)) throw new Error("port not declared");
		return `https://${port}-${this.name}.vercel.run`;
	}

	async stop(): Promise<void> {
		this.spy.touch("sandbox.stop");
	}

	async delete(): Promise<void> {
		this.spy.touch("sandbox.delete");
	}
}

class FakeVercelStatics {
	constructor(
		private readonly spy: VendorSpy,
		private readonly failStatus?: number,
	) {}

	async getOrCreate(params: Record<string, unknown>): Promise<FakeVercelSandbox> {
		this.spy.touch("Sandbox.getOrCreate");
		this.fail();
		return new FakeVercelSandbox(this.spy, String(params["name"]));
	}

	async get(params: { name: string; resume?: boolean }): Promise<FakeVercelSandbox> {
		this.spy.touch(`Sandbox.get:resume=${String(params.resume)}`);
		// resume defaults to true upstream, so anything but an explicit false is
		// a resume -- including an omitted flag.
		if (params.resume !== false) this.spy.markResumed();
		this.fail();
		return new FakeVercelSandbox(this.spy, params.name);
	}

	async list(): Promise<AsyncIterable<Record<string, unknown>>> {
		this.spy.touch("Sandbox.list");
		this.fail();
		return {
			async *[Symbol.asyncIterator](): AsyncGenerator<Record<string, unknown>> {
				yield { name: "box-conf", status: "running", createdAt: CREATED_AT };
			},
		};
	}

	private fail(): void {
		if (this.failStatus !== undefined) throw vercelError(this.failStatus);
	}
}

type VercelSandboxClass = NonNullable<Parameters<typeof createVercelProvider>[1]>;

const vercelLane: Lane = {
	substrate: "vercel",
	expect: {
		missingCredentials: [
			/VERCEL_TOKEN/,
			/VERCEL_TEAM_ID/,
			/VERCEL_PROJECT_ID/,
			/VERCEL_OIDC_TOKEN/,
		],
		sampleId: "box-conf",
		// No native pty and no stdin after a command starts, so every pty is
		// tmux-over-exec, named or not.
		pty: "tmux",
		namedPtyUsesTmux: true,
		streamingExec: true,
		backgroundLauncher: "vendor-native",
		park: true,
		keepAlive: false,
		// model "declared-at-create": only the ports the adapter declares route.
		publicUrlProbes: [
			{ port: 3000, url: true },
			{ port: 4242, url: false },
		],
	},
	open(options = {}): LaneHarness {
		const spy = new VendorSpy(options.parked);
		const statics = recordAccess(
			new FakeVercelStatics(spy, options.failStatus),
			spy,
			"Sandbox",
		);
		return {
			provider: createVercelProvider(
				{ token: "vercel-conf", teamId: "team_conf", projectId: "prj_conf" },
				statics as unknown as VercelSandboxClass,
			),
			spy,
			dispose: () => undefined,
		};
	},
	openUncredentialed(): LaneHarness {
		const spy = new VendorSpy();
		const statics = recordAccess(new FakeVercelStatics(spy), spy, "Sandbox");
		return {
			provider: createVercelProvider({}, statics as unknown as VercelSandboxClass),
			spy,
			dispose: () => undefined,
		};
	},
};

// ---------------------------------------------------------------------------
// dedalus. No SDK at all: raw REST over global fetch. Resuming entry point:
// POST /executions, because submitting one is what makes the scheduler call the
// signed admit/wake gate.
// ---------------------------------------------------------------------------

const DEDALUS_BASE = "https://dcs.conf.test";

function dedalusMachine(id: string, parked: boolean): Record<string, unknown> {
	return {
		machine_id: id,
		vcpu: 1,
		memory_mib: 2048,
		storage_gib: 10,
		created_at: CREATED_AT,
		desired_state: "running",
		// Submitting an execution is what wakes a sleeping machine here, so the
		// phase follows the spy's parked flag rather than being fixed.
		status: { phase: parked ? "sleeping" : "running", revision: 7 },
	};
}

/**
 * Route the Dedalus REST surface, recording every request. The execution flow
 * is answered as already-terminal so no poll interval is ever waited on.
 */
function dedalusFetch(spy: VendorSpy, failStatus?: number): typeof globalThis.fetch {
	return (async (input: unknown, init?: RequestInit): Promise<Response> => {
		const url = new URL(String(input));
		const method = (init?.method ?? "GET").toUpperCase();
		const path = url.pathname;
		spy.touch(`${method} ${path}`);

		if (failStatus !== undefined) {
			return new Response(JSON.stringify({ error: "vendor said no" }), {
				status: failStatus,
				headers: { "content-type": "application/json" },
			});
		}

		const json = (body: unknown, status = 200): Response =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			});

		// One document, whatever produced it: this substrate's execution API only
		// exposes output once the execution is terminal, which is exactly why
		// capabilities.streamingExec is false here.
		if (path.endsWith("/output")) {
			return json({ stdout: STREAM_CHUNKS.join(""), stderr: "" });
		}
		if (path.includes("/executions")) {
			if (method === "POST") {
				const body = JSON.parse(String(init?.body ?? "{}")) as {
					command?: string[];
				};
				// Submitting an execution is the wake path on this substrate.
				spy.markResumed();
				spy.shellCall({
					mode: "exec",
					script: body.command?.[2] ?? "",
					detached: false,
				});
				return json({ execution_id: "ex-conf", status: "succeeded", exit_code: 0 });
			}
			return json({ execution_id: "ex-conf", status: "succeeded", exit_code: 0 });
		}
		if (path.endsWith("/previews")) {
			// No preview exists yet, so the adapter has to create one.
			return method === "POST"
				? json({ url: "https://preview-conf.dedalus.test" })
				: json({ items: [] });
		}
		if (path === "/v1/machines") {
			return method === "POST"
				? json(dedalusMachine("dm-conf", spy.parked))
				: json([dedalusMachine("dm-conf", spy.parked)]);
		}
		if (method === "DELETE") return new Response(null, { status: 204 });
		return json(dedalusMachine(path.split("/").pop() ?? "dm-conf", spy.parked));
	}) as typeof globalThis.fetch;
}

function dedalusHarness(
	creds: { apiKey?: string },
	options: LaneOptions = {},
): LaneHarness {
	const spy = new VendorSpy(options.parked);
	const original = globalThis.fetch;
	globalThis.fetch = dedalusFetch(spy, options.failStatus);
	return {
		provider: createDedalusProvider({ ...creds, baseUrl: DEDALUS_BASE }),
		spy,
		dispose: () => {
			globalThis.fetch = original;
		},
	};
}

const dedalusLane: Lane = {
	substrate: "dedalus",
	expect: {
		missingCredentials: [/DEDALUS_API_KEY/],
		sampleId: "dm-conf",
		pty: "tmux",
		namedPtyUsesTmux: true,
		// The execution API only exposes output once an execution is terminal,
		// so incremental delivery is impossible here and the adapter says so.
		streamingExec: false,
		backgroundLauncher: "process-detach",
		park: false,
		keepAlive: false,
		// model "unknown": the previews API answers per port, but no vendor page
		// documents the endpoint or a ceiling, so only the behavior is pinned.
		publicUrlProbes: [{ port: 4242, url: true }],
	},
	open(options = {}): LaneHarness {
		return dedalusHarness({ apiKey: "dedalus-conf" }, options);
	},
	openUncredentialed(): LaneHarness {
		return dedalusHarness({});
	},
};

/**
 * The four lanes, in the order the default route walks them.
 *
 * A fifth substrate belongs here, and the suite will then hold it to every
 * shared assertion -- which is the point.
 */
export const LANES: readonly Lane[] = [e2bLane, spritesLane, vercelLane, dedalusLane];

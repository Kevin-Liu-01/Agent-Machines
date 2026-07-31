/**
 * The mux router: compose the harness plane and the substrate plane.
 *
 * `createMux()` loads config (JSON file or object), instantiates only
 * credentialed providers, and routes `create()` calls across the
 * primary -> backups chain. Provisioning errors that another substrate
 * could avoid (transient, rate_limited, fatal) fail over; credential
 * and capability gaps are skipped up front (fail closed).
 *
 * Agent runs stream normalized MuxAgentEvents; interactive use returns
 * a PtyHandle (native where the substrate has one, tmux-over-exec
 * everywhere else).
 */

import { loadMuxConfig, resolveMuxConfig, type MuxConfig, type MuxConfigInput } from "./config.js";
import { LineBuffer, type MuxAgentEvent, type RunResult } from "./events.js";
import { getHarness } from "./harnesses/index.js";
import { getProvider } from "./providers/index.js";
import { readMuxState, rememberMachine, forgetMachine } from "./state.js";
import {
	MuxError,
	isRoutableError,
	type CreateSandboxOptions,
	type HarnessAdapter,
	type HarnessKind,
	type HarnessRunOptions,
	type PtyHandle,
	type PtyOptions,
	type SandboxHandle,
	type SandboxProvider,
	type SubstrateKind,
} from "./types.js";

export type MuxCreateOptions = {
	agent?: HarnessKind;
	/** Explicit substrate, or "auto" to follow primary -> backups. */
	sandbox?: SubstrateKind | "auto";
	name?: string;
	model?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	/** Skip harness installation (sandbox template already has it). */
	install?: boolean;
	/** Pre-baked image, where the substrate supports one. */
	template?: string;
	/** Requested sandbox size; heavy harnesses need more than defaults. */
	resources?: { vcpu?: number; memoryMib?: number };
};

export type MuxRunOptions = HarnessRunOptions & {
	timeoutMs?: number;
	signal?: AbortSignal;
	onEvent?: (event: MuxAgentEvent) => void;
};

export type RunStream = AsyncIterable<MuxAgentEvent> & {
	result(): Promise<RunResult>;
};

export type RouteAttempt = {
	substrate: SubstrateKind;
	outcome: "ok" | "skipped" | "failed";
	reason?: string;
	durationMs?: number;
};

/** Detached-install budget and poll cadence. */
const INSTALL_BUDGET_MS = 900_000;
const INSTALL_POLL_MS = 1_500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MuxMachine {
	readonly sandbox: SandboxHandle;
	readonly harness: HarnessAdapter;
	readonly name?: string;
	readonly attempts: RouteAttempt[];
	private readonly config: MuxConfig;
	private readonly model?: string;

	constructor(input: {
		sandbox: SandboxHandle;
		harness: HarnessAdapter;
		config: MuxConfig;
		name?: string;
		model?: string;
		attempts?: RouteAttempt[];
	}) {
		this.sandbox = input.sandbox;
		this.harness = input.harness;
		this.config = input.config;
		this.name = input.name;
		this.model = input.model;
		this.attempts = input.attempts ?? [];
	}

	get substrate(): SubstrateKind {
		return this.sandbox.substrate;
	}

	get agent(): HarnessKind {
		return this.harness.kind;
	}

	/**
	 * Ensure the harness CLI is present; installs on first use.
	 *
	 * Installs run detached on the sandbox and are polled for a sentinel
	 * file rather than held open on one connection. Measured 2026-07-31:
	 * a foreground install of hermes (curl installer + Python venv)
	 * outlived E2B's sandbox budget and tripped Sprites' WebSocket
	 * keepalive. Detach-and-poll makes install duration independent of
	 * any connection limit, and the sentinel makes it idempotent.
	 */
	async ensureInstalled(
		options: { timeoutMs?: number; pollMs?: number } = {},
	): Promise<void> {
		const probe = await this.sandbox.exec(this.harness.isInstalledCommand(), {
			timeoutMs: 30_000,
		});
		if (probe.exitCode === 0) return;

		const budgetMs =
			options.timeoutMs ?? this.harness.installBudgetMs ?? INSTALL_BUDGET_MS;
		const pollMs = options.pollMs ?? INSTALL_POLL_MS;
		// Optional capability: `?.()` yields undefined on substrates that
		// park on their own schedule, so the await must not assume a
		// promise. Failure to extend is not fatal -- the poll loop reports
		// it as a transient install timeout if the sandbox goes away.
		if (this.sandbox.keepAlive) {
			try {
				await this.sandbox.keepAlive(budgetMs + 120_000);
			} catch {
				// Best effort.
			}
		}

		const tag = `${this.harness.kind}-${Date.now().toString(36)}`;
		const script = `/tmp/am-install-${tag}.sh`;
		const log = `/tmp/am-install-${tag}.log`;
		const done = `/tmp/am-install-${tag}.done`;
		await this.sandbox.writeFile(
			script,
			`#!/usr/bin/env bash\n${this.harness.installCommand()}\n`,
		);
		await this.sandbox.execBackground(
			`bash ${script} > ${log} 2>&1; echo $? > ${done}`,
		);

		const deadline = Date.now() + budgetMs;
		let exitCode: number | null = null;
		while (Date.now() < deadline) {
			await sleep(pollMs);
			const check = await this.sandbox.exec(`cat ${done} 2>/dev/null`, {
				timeoutMs: 30_000,
			});
			const value = check.stdout.trim();
			if (value.length > 0) {
				exitCode = Number.parseInt(value, 10);
				break;
			}
		}
		if (exitCode === null) {
			const tail = await this.tailInstallLog(log);
			throw new MuxError(
				"transient",
				`${this.harness.kind} install did not finish within ${budgetMs}ms on ${this.substrate}${tail}`,
				{ substrate: this.substrate, harness: this.harness.kind },
			);
		}
		if (exitCode !== 0) {
			const tail = await this.tailInstallLog(log);
			throw new MuxError(
				"fatal",
				`${this.harness.kind} install failed on ${this.substrate} (exit ${exitCode})${tail}`,
				{ substrate: this.substrate, harness: this.harness.kind },
			);
		}
	}

	private async tailInstallLog(log: string): Promise<string> {
		const result = await this.sandbox
			.exec(`tail -c 800 ${log} 2>/dev/null`, { timeoutMs: 30_000 })
			.catch(() => null);
		const text = result?.stdout.trim();
		return text ? `: ${text}` : "";
	}

	/** One agent turn, streamed as normalized events. */
	run(prompt: string, options: MuxRunOptions = {}): RunStream {
		const { command, env } = this.harness.runCommand(prompt, this.config.keys, {
			model: options.model ?? this.model ?? this.config.defaults.model,
			cwd: options.cwd,
			extraArgs: options.extraArgs,
			sessionId: options.sessionId,
		});
		const harness = this.harness;
		const sandbox = this.sandbox;
		const timeoutMs = options.timeoutMs ?? this.config.defaults.timeoutMs;
		const startedAt = Date.now();

		let resultResolve: (value: RunResult) => void = () => {};
		let resultReject: (reason: unknown) => void = () => {};
		const resultPromise = new Promise<RunResult>((res, rej) => {
			resultResolve = res;
			resultReject = rej;
		});
		// A caller may consume only the iterator or only result().
		resultPromise.catch(() => {});

		const lines = new LineBuffer();
		const stderrTail: string[] = [];
		let exitCode = 0;
		let finalText = "";
		let costUsd: number | undefined;
		let sessionId: string | undefined;
		let eventCount = 0;
		let sawError: string | undefined;
		let completed = false;
		let settled = false;

		/** Fold one event into the run result. */
		const absorb = (event: MuxAgentEvent): void => {
			if (event.type === "result") {
				finalText = event.text || finalText;
				costUsd = event.costUsd ?? costUsd;
				sessionId = event.sessionId ?? sessionId;
			}
			if (event.type === "text") finalText += event.delta;
			if (event.type === "error") sawError = event.message;
		};

		/**
		 * Resolve exactly once, from either the normal end of the stream or
		 * the generator being closed early. `truncated` tells the caller the
		 * text is partial, so an aborted run is never mistaken for success.
		 */
		const settle = (): void => {
			if (settled) return;
			settled = true;
			resultResolve({
				text: finalText,
				exitCode,
				costUsd,
				durationMs: Date.now() - startedAt,
				sessionId,
				events: eventCount,
				substrate: sandbox.substrate,
				harness: harness.kind,
				truncated: !completed,
			});
		};

		const iterate = async function* (): AsyncGenerator<MuxAgentEvent> {
			const parseLine =
				harness.newTurnParser?.() ??
				((line: string) => harness.parseLine(line));
			try {
				const stream = sandbox.execStream(command, {
					timeoutMs,
					env,
					signal: options.signal,
				});
				for await (const chunk of stream) {
					if (chunk.type === "stderr") {
						stderrTail.push(chunk.data);
						if (stderrTail.length > 40) stderrTail.shift();
						continue;
					}
					if (chunk.type === "exit") {
						exitCode = chunk.exitCode;
						break;
					}
					for (const line of lines.push(chunk.data)) {
						for (const event of parseLine(line)) {
							eventCount += 1;
							absorb(event);
							options.onEvent?.(event);
							yield event;
						}
					}
				}
				for (const line of lines.flush()) {
					for (const event of parseLine(line)) {
						eventCount += 1;
						absorb(event);
						options.onEvent?.(event);
						yield event;
					}
				}
				if (exitCode !== 0 && !sawError) {
					const message = `${harness.kind} exited ${exitCode}: ${stderrTail.join("").slice(-500)}`;
					const event: MuxAgentEvent = { type: "error", message };
					options.onEvent?.(event);
					yield event;
				}
				completed = true;
				const done: MuxAgentEvent = { type: "done", exitCode };
				options.onEvent?.(done);
				yield done;
				settle();
			} catch (error) {
				resultReject(error);
				throw error;
			} finally {
				// A caller that breaks out of the iteration closes this
				// generator, which resumes the suspended yield with a return
				// completion and skips both the resolve above and the catch.
				// Settling here is what keeps result() from hanging forever.
				settle();
			}
		};

		const iterator = iterate();
		return {
			[Symbol.asyncIterator]() {
				return iterator;
			},
			async result() {
				// Drain whatever is left; a closed generator returns at once.
				for await (const _event of iterator) {
					void _event;
				}
				settle();
				return resultPromise;
			},
		};
	}

	/** Interactive agent terminal (native PTY or tmux fallback). */
	async pty(options: PtyOptions = {}): Promise<PtyHandle> {
		const { command, env } = this.harness.interactiveCommand(this.config.keys, {
			model: this.model ?? this.config.defaults.model,
		});
		return this.sandbox.openPty({
			...options,
			command: options.command ?? command,
			env: { ...env, ...options.env },
		});
	}

	/** Raw shell PTY on the sandbox. */
	async shell(options: PtyOptions = {}): Promise<PtyHandle> {
		return this.sandbox.openPty(options);
	}

	async destroy(): Promise<void> {
		await this.sandbox.destroy();
		if (this.name) forgetMachine(this.name);
	}
}

export class Mux {
	readonly config: MuxConfig;
	private readonly providers = new Map<SubstrateKind, SandboxProvider>();

	constructor(config: MuxConfig) {
		this.config = config;
	}

	provider(kind: SubstrateKind): SandboxProvider {
		let provider = this.providers.get(kind);
		if (!provider) {
			provider = getProvider(kind, this.config);
			this.providers.set(kind, provider);
		}
		return provider;
	}

	/** Dependency-injection hook for tests and custom substrates. */
	registerProvider(kind: SubstrateKind, provider: SandboxProvider): void {
		this.providers.set(kind, provider);
	}

	/** Ordered, credentialed route for a create() call. */
	routeFor(sandbox?: SubstrateKind | "auto"): {
		candidates: SubstrateKind[];
		skipped: RouteAttempt[];
	} {
		const requested =
			!sandbox || sandbox === "auto"
				? [this.config.sandboxes.primary, ...this.config.sandboxes.backups]
				: [sandbox];
		const candidates: SubstrateKind[] = [];
		const skipped: RouteAttempt[] = [];
		for (const kind of requested) {
			const readiness = this.provider(kind).ready();
			if (readiness.ok) {
				candidates.push(kind);
			} else {
				skipped.push({
					substrate: kind,
					outcome: "skipped",
					reason: `missing credentials: ${readiness.missing.join(", ")}`,
				});
			}
		}
		return { candidates, skipped };
	}

	/**
	 * Create (or reuse by name) a machine running the requested harness,
	 * failing over across the substrate route on provisioning errors.
	 */
	async create(options: MuxCreateOptions = {}): Promise<MuxMachine> {
		const agent = options.agent ?? this.config.agents.default;
		const harness = getHarness(agent);
		this.assertUpstream(harness.requiredUpstream, agent);

		const { candidates, skipped } = this.routeFor(options.sandbox);
		const attempts: RouteAttempt[] = [...skipped];
		if (candidates.length === 0) {
			throw new MuxError(
				"missing_credentials",
				`No sandbox provider is credentialed for route [${
					(options.sandbox && options.sandbox !== "auto"
						? [options.sandbox]
						: [this.config.sandboxes.primary, ...this.config.sandboxes.backups]
					).join(" -> ")
				}]. ${attempts.map((a) => `${a.substrate}: ${a.reason}`).join("; ")}`,
			);
		}

		const createOptions: CreateSandboxOptions = {
			name: options.name,
			env: options.env,
			timeoutMs: options.timeoutMs,
			template: options.template,
			resources: options.resources,
		};

		let lastError: unknown;
		for (const kind of candidates) {
			const startedAt = Date.now();
			// Tracked so a failure *after* provisioning (install, remember)
			// tears the sandbox down instead of leaving it billing while the
			// router moves on to the next lane.
			let provisioned: SandboxHandle | null = null;
			try {
				provisioned = await this.provider(kind).create(createOptions);
				const machine = new MuxMachine({
					sandbox: provisioned,
					harness,
					config: this.config,
					name: options.name,
					model: options.model,
					attempts,
				});
				if (options.install !== false) {
					await machine.ensureInstalled();
				}
				if (options.name) {
					rememberMachine(options.name, {
						substrate: kind,
						sandboxId: provisioned.id,
						agent,
					});
				}
				attempts.push({
					substrate: kind,
					outcome: "ok",
					durationMs: Date.now() - startedAt,
				});
				return machine;
			} catch (error) {
				if (provisioned) {
					// Best effort: a teardown failure must not mask the real
					// error, but it is recorded so a leak is not silent.
					await provisioned.destroy().catch((teardownError: unknown) => {
						attempts.push({
							substrate: kind,
							outcome: "failed",
							reason: `orphaned sandbox ${provisioned?.id ?? "?"}: teardown failed: ${
								teardownError instanceof Error
									? teardownError.message
									: String(teardownError)
							}`,
						});
					});
				}
				attempts.push({
					substrate: kind,
					outcome: "failed",
					reason: error instanceof Error ? error.message : String(error),
					durationMs: Date.now() - startedAt,
				});
				lastError = error;
				if (!isRoutableError(error)) throw error;
			}
		}
		void lastError;
		throw new MuxError(
			"fatal",
			`All sandbox routes failed: ${attempts
				.map((a) => `${a.substrate}=${a.outcome}${a.reason ? ` (${a.reason})` : ""}`)
				.join(", ")}`,
		);
	}

	/** Reconnect to a machine created earlier with a name. */
	async connect(name: string, agent?: HarnessKind): Promise<MuxMachine> {
		const remembered = readMuxState().machines[name];
		if (!remembered) {
			throw new MuxError("fatal", `No remembered machine named "${name}".`);
		}
		const sandbox = await this.provider(remembered.substrate).connect(
			remembered.sandboxId,
		);
		return new MuxMachine({
			sandbox,
			harness: getHarness(agent ?? remembered.agent),
			config: this.config,
			name,
		});
	}

	private assertUpstream(
		required: "anthropic" | "openai" | "any",
		agent: HarnessKind,
	): void {
		const keys = this.config.keys;
		if (required === "anthropic" && !keys.anthropic) {
			throw new MuxError(
				"missing_credentials",
				`${agent} requires an Anthropic API key (keys.anthropic / ANTHROPIC_API_KEY).`,
				{ harness: agent },
			);
		}
		if (required === "openai" && !keys.openai) {
			throw new MuxError(
				"missing_credentials",
				`${agent} requires an OpenAI API key (keys.openai / OPENAI_API_KEY).`,
				{ harness: agent },
			);
		}
		// "any" means either native key, NOT any key at all: the harness
		// adapters only inject ANTHROPIC_API_KEY / OPENAI_API_KEY into the
		// sandbox, so an aiGateway- or openrouter-only config used to pass
		// this gate, provision a machine, pay the full install, and only
		// then fail with the harness's own auth error.
		if (required === "any" && !keys.anthropic && !keys.openai) {
			const haveGatewayOnly = Boolean(keys.aiGateway || keys.openrouter);
			throw new MuxError(
				"missing_credentials",
				haveGatewayOnly
					? `${agent} needs a native Anthropic or OpenAI key: the harness receives ANTHROPIC_API_KEY / OPENAI_API_KEY in the sandbox and cannot use a gateway key on its own.`
					: `${agent} requires at least one model upstream key.`,
				{ harness: agent },
			);
		}
	}
}

/** Build a Mux from a config file path, inline object, or environment. */
export function createMux(config?: string | MuxConfigInput): Mux {
	if (typeof config === "string") {
		return new Mux(loadMuxConfig(config));
	}
	if (config) {
		return new Mux(resolveMuxConfig(config));
	}
	return new Mux(loadMuxConfig());
}

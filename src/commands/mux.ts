/**
 * Terminal surface for the multiplexer.
 *
 *   am mux run   --agent claude-code --sandbox auto "review my repo"
 *   am mux shell --name reviewer
 *   am mux term  --agent codex --name coder
 *   am mux ls
 *   am mux routes
 *   am mux rm    --name reviewer
 *
 * Same core the SDK and dashboard use: config from agent-machines.json
 * (or env), route primary -> backups, stream normalized events. `shell`
 * and `term` attach a raw PTY with local echo off, so full-screen TUIs
 * (claude, codex, vim) render correctly.
 */

import { createMux, forgetMachine, readMuxState } from "../mux/index.js";
import type { HarnessKind, MuxAgentEvent, PtyHandle, SubstrateKind } from "../mux/index.js";

type Flags = {
	agent?: HarnessKind;
	sandbox?: SubstrateKind | "auto";
	name?: string;
	model?: string;
	config?: string;
	json: boolean;
	rest: string[];
};

function parseFlags(args: string[]): Flags {
	const flags: Flags = { json: false, rest: [] };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const next = () => args[(index += 1)];
		if (arg === "--agent" || arg === "-a") flags.agent = next() as HarnessKind;
		else if (arg === "--sandbox" || arg === "-s")
			flags.sandbox = next() as SubstrateKind | "auto";
		else if (arg === "--name" || arg === "-n") flags.name = next();
		else if (arg === "--model" || arg === "-m") flags.model = next();
		else if (arg === "--config" || arg === "-c") flags.config = next();
		else if (arg === "--json") flags.json = true;
		else flags.rest.push(arg);
	}
	return flags;
}

function renderEvent(event: MuxAgentEvent): void {
	switch (event.type) {
		case "started":
			process.stderr.write(
				`[${event.harness}${event.model ? ` ${event.model}` : ""}] started\n`,
			);
			break;
		case "text":
			process.stdout.write(event.delta);
			break;
		case "thinking":
			process.stderr.write(`\x1b[2m${event.delta}\x1b[0m`);
			break;
		case "tool_call":
			process.stderr.write(`\n\x1b[36m-> ${event.name}\x1b[0m\n`);
			break;
		case "tool_result":
			if (event.isError) process.stderr.write(`\x1b[31m<- error\x1b[0m\n`);
			break;
		case "status":
			process.stderr.write(`\x1b[2m[${event.label}]\x1b[0m\n`);
			break;
		case "error":
			process.stderr.write(`\n\x1b[31m${event.message}\x1b[0m\n`);
			break;
		case "result":
		case "done":
			break;
	}
}

async function attachPty(pty: PtyHandle): Promise<void> {
	const stdin = process.stdin;
	const wasRaw = stdin.isTTY ? stdin.isRaw : false;
	if (stdin.isTTY) stdin.setRawMode(true);
	stdin.resume();

	const onInput = (chunk: Buffer) => {
		// Ctrl-] detaches without killing the remote session.
		if (chunk.length === 1 && chunk[0] === 0x1d) {
			void pty.close().finally(() => process.exit(0));
			return;
		}
		void pty.write(chunk).catch((error: unknown) => {
			process.stderr.write(`\ninput failed: ${String(error)}\n`);
		});
	};
	stdin.on("data", onInput);

	const onResize = () => {
		void pty.resize(process.stdout.columns ?? 100, process.stdout.rows ?? 30);
	};
	process.stdout.on("resize", onResize);
	onResize();

	process.stderr.write("\x1b[2m[attached -- Ctrl-] to detach]\x1b[0m\n");
	try {
		for await (const bytes of pty.output) {
			process.stdout.write(bytes);
		}
	} finally {
		stdin.off("data", onInput);
		process.stdout.off("resize", onResize);
		if (stdin.isTTY) stdin.setRawMode(wasRaw);
		stdin.pause();
	}
}

export async function mux(args: string[]): Promise<void> {
	const [subcommand = "help", ...rest] = args;
	const flags = parseFlags(rest);
	const router = createMux(flags.config);

	if (subcommand === "routes") {
		const { candidates, skipped } = router.routeFor(flags.sandbox);
		console.log(`route: ${candidates.join(" -> ") || "(none credentialed)"}`);
		for (const skip of skipped) console.log(`skipped ${skip.substrate}: ${skip.reason}`);
		for (const kind of candidates) {
			const provider = router.provider(kind);
			const caps = provider.capabilities;
			console.log(
				`  ${kind.padEnd(9)} pty=${caps.pty.padEnd(7)} persistence=${caps.persistence.padEnd(20)} stream=${caps.streamingExec}`,
			);
		}
		return;
	}

	if (subcommand === "ls") {
		const machines = readMuxState().machines;
		const names = Object.keys(machines);
		if (names.length === 0) {
			console.log("no named machines yet (create one with: am mux run --name <name> ...)");
			return;
		}
		for (const name of names) {
			const entry = machines[name];
			console.log(
				`${name.padEnd(20)} ${entry.agent.padEnd(12)} ${entry.substrate.padEnd(9)} ${entry.sandboxId}`,
			);
		}
		return;
	}

	if (subcommand === "rm") {
		if (!flags.name) throw new Error("am mux rm requires --name");
		// A remembered machine whose sandbox the substrate already reaped
		// (E2B expires paused sandboxes) must still be forgotten, or the
		// stale entry can never be removed.
		try {
			const machine = await router.connect(flags.name, flags.agent);
			await machine.destroy();
			console.log(`destroyed ${flags.name}`);
		} catch (error) {
			forgetMachine(flags.name);
			console.log(
				`forgot ${flags.name} (its sandbox was already gone: ${
					error instanceof Error ? error.message : String(error)
				})`,
			);
		}
		return;
	}

	if (subcommand === "run") {
		const prompt = flags.rest.join(" ").trim();
		if (!prompt) throw new Error('am mux run requires a prompt: am mux run "..."');
		const machine = flags.name
			? await connectOrCreate(router, flags)
			: await router.create({
					agent: flags.agent,
					sandbox: flags.sandbox,
					model: flags.model,
				});
		const stream = machine.run(prompt, { model: flags.model });
		if (flags.json) {
			for await (const event of stream) console.log(JSON.stringify(event));
			return;
		}
		for await (const event of stream) renderEvent(event);
		const result = await stream.result();
		process.stdout.write("\n");
		process.stderr.write(
			`\x1b[2m[${result.harness} on ${result.substrate}: ${result.durationMs}ms${
				result.costUsd !== undefined ? `, $${result.costUsd.toFixed(4)}` : ""
			}]\x1b[0m\n`,
		);
		if (!flags.name) await machine.destroy();
		return;
	}

	if (subcommand === "shell" || subcommand === "term") {
		const machine = await connectOrCreate(router, flags);
		const session = flags.name ?? "ammux";
		const pty =
			subcommand === "shell"
				? await machine.shell({ session, cols: process.stdout.columns, rows: process.stdout.rows })
				: await machine.pty({ session, cols: process.stdout.columns, rows: process.stdout.rows });
		await attachPty(pty);
		return;
	}

	console.log("Agent Machines multiplexer");
	console.log("");
	console.log("  am mux run    [--agent <a>] [--sandbox <s|auto>] [--name <n>] [--json] \"prompt\"");
	console.log("  am mux shell  [--name <n>] [--sandbox <s>]        raw PTY on the sandbox");
	console.log("  am mux term   [--agent <a>] [--name <n>]          interactive agent PTY");
	console.log("  am mux ls                                        named machines");
	console.log("  am mux routes [--sandbox <s>]                    resolved route + capabilities");
	console.log("  am mux rm     --name <n>                         destroy a named machine");
	console.log("");
	console.log("  agents:    claude-code | codex | openclaw | hermes");
	console.log("  sandboxes: e2b | sprites | vercel | dedalus | auto");
}

async function connectOrCreate(
	router: ReturnType<typeof createMux>,
	flags: Flags,
) {
	if (flags.name && readMuxState().machines[flags.name]) {
		return router.connect(flags.name, flags.agent);
	}
	return router.create({
		agent: flags.agent,
		sandbox: flags.sandbox,
		name: flags.name,
		model: flags.model,
	});
}

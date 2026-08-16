import { randomBytes, randomInt } from "node:crypto";

import { SpritesClient } from "@fly/sprites";
import { Sandbox } from "e2b";
import WebSocket, { type RawData } from "ws";

import { createSpritesProvider } from "../../src/mux/providers/sprites";

import directTerminalRelay from "../lib/dashboard/direct-terminal-relay";

const {
	buildDirectTerminalRelayCommand,
	buildDirectTerminalRelayServiceLaunch,
	DIRECT_TERMINAL_ACK_PROTOCOL,
	DIRECT_TERMINAL_MIN_PORT,
	DIRECT_TERMINAL_PORT_SPAN,
	DIRECT_TERMINAL_PROTOCOL,
} = directTerminalRelay;
const directTerminalLaneCount = 6;
const directTerminalRetryMs = 12;

const benchmarkProvider = process.env.AM_BENCH_PROVIDER ?? "e2b";
const machineId = process.env.AM_BENCH_MACHINE_ID;
const apiKey = process.env.E2B_API_KEY;
const spritesToken = process.env.SPRITES_TOKEN;
const origin = process.env.AM_BENCH_ORIGIN ?? "https://agentmachines.vercel.app";
const sampleCount = Number(process.env.AM_BENCH_SAMPLES ?? 20);
const budgetMs = Number(process.env.AM_BENCH_BUDGET_MS ?? 50);
const probeData = process.env.AM_BENCH_INPUT === "nul" ? "\0" : "\t";
const intervalMs = Number(process.env.AM_BENCH_INTERVAL_MS ?? 0);

const token = `amt_${randomBytes(32).toString("base64url")}`;
let url: string;
let destroyBenchmarkMachine: (() => Promise<void>) | undefined;
if (benchmarkProvider === "sprites") {
	if (!spritesToken) throw new Error("SPRITES_TOKEN is required");
	const provider = createSpritesProvider({ token: spritesToken });
	const handle = await provider.create({
		name: `terminal-latency-${Date.now().toString(36)}`,
		onNameConflict: "unique",
	});
	destroyBenchmarkMachine = () => handle.destroy();
	try {
		const tmux = await handle.exec("tmux new-session -d -s amconsole", {
			timeoutMs: 30_000,
		});
		if (tmux.exitCode !== 0) {
			throw new Error(`Could not start benchmark tmux session: ${tmux.stderr}`);
		}
		const port = 8080;
		const service = buildDirectTerminalRelayServiceLaunch({
				port,
				token,
				origin,
				cols: 120,
				rows: 32,
			});
		const staged = await handle.exec(service.setupCommand, { timeoutMs: 30_000 });
		if (staged.exitCode !== 0) {
			throw new Error(`Could not stage direct terminal service: ${staged.stderr}`);
		}
		const sprite = await new SpritesClient(spritesToken).getSprite(handle.id);
		const serviceStream = await sprite.createService(
			service.serviceName,
			{
				cmd: service.command,
				args: service.args,
				httpPort: port,
			},
			"2s",
		);
		await serviceStream.processAll(() => {});
		const listening = await handle.exec(
			"for i in $(seq 1 50); do python3 -c \"import socket,sys; s=socket.socket(); s.settimeout(.2); sys.exit(s.connect_ex(('127.0.0.1',8080)))\" && exit 0; sleep .1; done; exit 1",
			{ timeoutMs: 10_000 },
		);
		if (listening.exitCode !== 0) {
			const diagnostic = await handle.exec(
				"tmux list-sessions 2>&1; pgrep -af '[r]elay.py' || true; ls -la /tmp/agent-machines-direct-terminal 2>&1 || true",
				{ timeoutMs: 10_000 },
			);
			throw new Error(
				`Direct terminal relay did not listen on Sprite port 8080: ${diagnostic.stdout || diagnostic.stderr}`,
			);
		}
		const publicUrl = await handle.publicUrl(port);
		if (!publicUrl) throw new Error("Sprite did not return a public URL");
		const socketUrl = new URL("/terminal", publicUrl);
		socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
		url = socketUrl.toString();
	} catch (error) {
		await destroyBenchmarkMachine();
		destroyBenchmarkMachine = undefined;
		throw error;
	}
} else if (benchmarkProvider === "e2b") {
	if (!machineId) throw new Error("AM_BENCH_MACHINE_ID is required");
	if (!apiKey) throw new Error("E2B_API_KEY is required");
	const sandbox = await Sandbox.connect(machineId, { apiKey });
	const port = DIRECT_TERMINAL_MIN_PORT + randomInt(DIRECT_TERMINAL_PORT_SPAN);
	await sandbox.commands.run(
		buildDirectTerminalRelayCommand({
			port,
			token,
			origin,
			cols: 120,
			rows: 32,
		}),
		{ background: true },
	);
	url = `wss://${sandbox.getHost(port)}/terminal`;
} else {
	throw new Error(`Unsupported AM_BENCH_PROVIDER: ${benchmarkProvider}`);
}
async function openSocket(): Promise<WebSocket> {
	let lastError = "unknown WebSocket error";
	for (let attempt = 0; attempt < 25; attempt += 1) {
		try {
			return await new Promise<WebSocket>((resolve, reject) => {
				const candidate = new WebSocket(
					url,
					[
						DIRECT_TERMINAL_PROTOCOL,
						token,
						DIRECT_TERMINAL_ACK_PROTOCOL,
					],
					{ origin, handshakeTimeout: 3_000 },
				);
				candidate.once("open", () => resolve(candidate));
				candidate.once("error", reject);
			});
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	throw new Error(`Direct terminal relay did not accept a WebSocket: ${lastError}`);
}
const sockets: WebSocket[] = [];

const waiters = new Map<string, (message: { providerMs: number }) => void>();
let markReady: (() => void) | null = null;
const ready = new Promise<void>((resolve) => {
	markReady = resolve;
});
const onMessage = (raw: RawData) => {
	const message = JSON.parse(raw.toString()) as {
		type?: string;
		inputId?: string;
		providerMs?: number;
	};
	if (
		message.type === "ack" &&
		typeof message.inputId === "string" &&
		typeof message.providerMs === "number"
	) {
		waiters.get(message.inputId)?.({ providerMs: message.providerMs });
	}
	if (message.type === "ready") markReady?.();
	if (message.type === "error") {
		throw new Error(`Direct relay error: ${JSON.stringify(message)}`);
	}
};
try {
	sockets.push(
		...(await Promise.all(
			Array.from({ length: directTerminalLaneCount }, () => openSocket()),
		)),
	);
	for (const socket of sockets) socket.on("message", onMessage);
	await ready;

	const samples: Array<{ roundTripMs: number; workerMs: number }> = [];
	for (let index = 0; index < sampleCount; index += 1) {
		const inputId = `probe_${index}`;
		const ack = new Promise<{ providerMs: number }>((resolve) => {
			waiters.set(inputId, resolve);
		});
		const startedAt = performance.now();
		const frame = JSON.stringify({ type: "input", inputId, data: probeData });
		const primarySocket = sockets[0];
		if (!primarySocket) throw new Error("Direct terminal primary lane is missing");
		primarySocket.send(frame);
		const retry = setTimeout(() => {
			if (!waiters.has(inputId)) return;
			for (const socket of sockets) {
				if (socket !== primarySocket) socket.send(frame);
			}
		}, directTerminalRetryMs);
		const message = await ack;
		clearTimeout(retry);
		samples.push({
			roundTripMs: Math.round((performance.now() - startedAt) * 10) / 10,
			workerMs: message.providerMs,
		});
		waiters.delete(inputId);
		if (intervalMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, intervalMs));
		}
	}

	const ordered = samples
		.map((sample) => sample.roundTripMs)
		.sort((left, right) => left - right);
	const result = {
		provider: benchmarkProvider,
		samples,
		p50: ordered[Math.ceil(ordered.length * 0.5) - 1],
		p95: ordered[Math.ceil(ordered.length * 0.95) - 1],
		max: ordered.at(-1),
		belowBudget: ordered.filter((value) => value < budgetMs).length,
		budgetMs,
	};
	console.log(JSON.stringify(result));
	if (result.belowBudget !== sampleCount) process.exitCode = 1;
} finally {
	for (const socket of sockets) socket.close();
	await destroyBenchmarkMachine?.();
}

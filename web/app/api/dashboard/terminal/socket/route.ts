/**
 * One pinned browser-to-sandbox PTY.
 *
 * Vercel WebSocket Functions (public beta, June 2026) let the terminal keep a
 * single provider PTY open for the life of the browser connection. E2B and
 * Sprites therefore send bytes over their native PTY transport instead of
 * paying a new Function invocation plus `execBackground` for every input.
 */

import {
	experimental_upgradeWebSocket,
	type WebSocketData,
} from "@vercel/functions";
import type { WebSocket } from "ws";

import { resolveMachine } from "@/lib/dashboard/exec";
import {
	parseTerminalSocketMessage,
	type TerminalSocketServerMessage,
} from "@/lib/dashboard/terminal-socket";
import { getProvider } from "@/lib/providers";
import { getUserConfigById } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "sfo1";

function socketText(data: WebSocketData): string {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
	if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
	return data.toString("utf8");
}

function socketSend(ws: WebSocket, message: TerminalSocketServerMessage): void {
	if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

export async function GET(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const machineId = url.searchParams.get("machineId");
	const cols = Number(url.searchParams.get("cols")) || 120;
	const rows = Number(url.searchParams.get("rows")) || 32;
	const config = await getUserConfigById(userId);
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		return Response.json({ error: "machine_not_found" }, { status: 404 });
	}

	const provider = getProvider(machine.providerKind, config.providers);
	if (provider.capabilities.pty !== "native" || !provider.openPty) {
		return Response.json({ error: "pty_not_supported" }, { status: 501 });
	}

	return experimental_upgradeWebSocket((ws) => {
		let closed = false;
		let closing = false;
		let inputOperations = Promise.resolve();
		let resizeOperations = Promise.resolve();
		const ptyPromise = provider.openPty!(machine.id, {
			cols,
			rows,
			env: { TERM: "xterm-256color" },
			command: "exec env TMUX= tmux attach-session -t amconsole",
		});

		const closePty = async (): Promise<void> => {
			if (closing) return;
			closing = true;
			const pty = await ptyPromise.catch(() => null);
			await pty?.close().catch(() => undefined);
		};

		ws.on("message", (raw) => {
			const message = parseTerminalSocketMessage(socketText(raw));
			if (!message) {
				socketSend(ws, { type: "error", message: "invalid terminal frame" });
				return;
			}
			if (message.type === "resize") {
				// A slow provider resize must never head-of-line block a keystroke.
				// Keep resize ordering, but let native PTY writes use their own lane.
				resizeOperations = resizeOperations
					.then(async () => {
						const pty = await ptyPromise;
						await pty.resize(message.cols, message.rows);
					})
					.catch(() => undefined);
				return;
			}
			inputOperations = inputOperations
				.then(async () => {
					const pty = await ptyPromise;
					const startedAt = performance.now();
					await pty.write(message.data);
					socketSend(ws, {
						type: "ack",
						inputId: message.inputId,
						providerMs: Math.round(performance.now() - startedAt),
					});
				})
				.catch((error: unknown) => {
					socketSend(ws, {
						type: "error",
						message: error instanceof Error ? error.message : "PTY input failed",
					});
					ws.close(1011, "PTY input failed");
				});
		});

		ws.on("close", () => {
			closed = true;
			void closePty();
		});
		ws.on("error", () => {
			closed = true;
			void closePty();
		});

		void (async () => {
			try {
				const pty = await ptyPromise;
				if (closed) {
					await closePty();
					return;
				}
				socketSend(ws, { type: "ready", transport: "native-pty" });
				const decoder = new TextDecoder();
				for await (const bytes of pty.output) {
					const data = decoder.decode(bytes, { stream: true });
					if (data) socketSend(ws, { type: "output", data });
				}
				const tail = decoder.decode();
				if (tail) socketSend(ws, { type: "output", data: tail });
				if (!closed) ws.close(1012, "PTY ended");
			} catch (error) {
				socketSend(ws, {
					type: "error",
					message: error instanceof Error ? error.message : "PTY failed",
				});
				if (!closed) ws.close(1011, "PTY failed");
			} finally {
				void closePty();
			}
		})();
	}, { maxPayload: 16_384 });
}

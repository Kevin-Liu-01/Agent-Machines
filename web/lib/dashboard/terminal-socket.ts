import { stripTerminalDeviceResponses } from "./terminal-input";

export const TERMINAL_LATENCY_BUDGET_MS = 50;
export const TERMINAL_LATENCY_WINDOW = 20;
/** One display lane plus five ack lanes: the browser's per-host WS ceiling. */
export const DIRECT_TERMINAL_LANE_COUNT = 6;
/** Re-send the same deduplicated input id before a transient can consume the SLO. */
export const DIRECT_TERMINAL_RETRY_MS = 12;

const MAX_INPUT_BYTES = 8_192;
const INPUT_ID = /^[A-Za-z0-9_-]{1,64}$/;

function clampDim(value: unknown, min: number, max: number, fallback: number): number {
	const number = Math.floor(Number(value));
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}

export type TerminalSocketClientMessage =
	| { type: "input"; data: string; inputId: string }
	| { type: "resize"; cols: number; rows: number };

export type TerminalSocketServerMessage =
	| { type: "ready"; transport: "native-pty" | "worker-pty" }
	| { type: "output"; data: string }
	| { type: "ack"; inputId: string; providerMs: number }
	| { type: "error"; message: string };

export function parseTerminalSocketMessage(
	raw: string,
): TerminalSocketClientMessage | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const message = parsed as Record<string, unknown>;
	if (message.type === "input") {
		const data =
			typeof message.data === "string"
				? stripTerminalDeviceResponses(message.data)
				: "";
		if (
			!data ||
			new TextEncoder().encode(data).byteLength > MAX_INPUT_BYTES ||
			typeof message.inputId !== "string" ||
			!INPUT_ID.test(message.inputId)
		) {
			return null;
		}
		return { type: "input", data, inputId: message.inputId };
	}
	if (message.type === "resize") {
		return {
			type: "resize",
			cols: clampDim(message.cols, 20, 500, 120),
			rows: clampDim(message.rows, 5, 200, 32),
		};
	}
	return null;
}

/** Nearest-rank p95: the same conservative percentile used by the SLO gate. */
export function terminalLatencyP95(samples: readonly number[]): number | null {
	const finite = samples.filter(
		(value) => Number.isFinite(value) && value >= 0,
	);
	if (finite.length === 0) return null;
	const ordered = [...finite].sort((left, right) => left - right);
	return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? null;
}

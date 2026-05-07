/**
 * GET /api/dashboard/logs?n=200
 *
 * Tails the Hermes gateway log on the live machine. PR2 keeps it as
 * a polled tail; SSE streaming is a future hardening (would need a
 * Cloudflare-friendly long-poll or a separate admin daemon, both bigger
 * than this PR's scope).
 */

import { auth } from "@clerk/nextjs/server";

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import type {
	LiveDataEnvelope,
	LogLine,
	LogsPayload,
} from "@/lib/dashboard/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_N = 200;
const MAX_N = 500;

function parseLevel(message: string): LogLine["level"] {
	const upper = message.slice(0, 80).toUpperCase();
	if (upper.includes("ERROR") || upper.includes("FATAL")) return "error";
	if (upper.includes("WARN")) return "warn";
	if (upper.includes("DEBUG")) return "debug";
	if (upper.includes("INFO")) return "info";
	return "other";
}

const TS_PATTERN = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/;

function parseLine(raw: string, source: string): LogLine {
	const match = raw.match(TS_PATTERN);
	const at = match ? match[1] : null;
	const message = at ? raw.slice(match![0].length).trimStart() : raw;
	return {
		at,
		level: parseLevel(message),
		source,
		message: message.slice(0, 1000),
	};
}

export async function GET(request: Request): Promise<Response> {
	const { userId } = await auth();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const requested = Number(url.searchParams.get("n") ?? DEFAULT_N);
	const tailLines = Number.isFinite(requested)
		? Math.min(MAX_N, Math.max(20, Math.floor(requested)))
		: DEFAULT_N;

	if (!process.env.HERMES_MACHINE_ID || !process.env.DEDALUS_API_KEY) {
		const envelope: LiveDataEnvelope<LogsPayload> = {
			ok: false,
			reason: "config_missing",
			message: "DEDALUS_API_KEY or HERMES_MACHINE_ID is not set",
		};
		return Response.json(envelope);
	}

	if (!(await isMachineRunning())) {
		const envelope: LiveDataEnvelope<LogsPayload> = {
			ok: false,
			reason: "machine_offline",
			message: "Machine is not running. Wake it with `npm run wake`.",
		};
		return Response.json(envelope);
	}

	try {
		// `find -printf` is GNU-only and the VM image ships with it. We pull
		// the file list + sizes in one shot so the UI can show "you have N
		// log files totalling X MiB".
		const inventoryOut = await execOnMachine(
			`mkdir -p $HOME/.hermes/logs && find $HOME/.hermes/logs -maxdepth 2 -type f -printf '%p\\t%s\\n' 2>/dev/null | sort`,
		);
		const files = inventoryOut.stdout
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [path, size] = line.split("\t");
				return {
					path: path.replace(`${process.env.HOME ?? "/home/machine"}/.hermes`, "~/.hermes"),
					bytes: Number.parseInt(size ?? "0", 10) || 0,
				};
			});

		const tailOut = await execOnMachine(
			`if compgen -G "$HOME/.hermes/logs/*.log" > /dev/null; then tail -n ${tailLines} $HOME/.hermes/logs/*.log 2>/dev/null; else echo ""; fi`,
		);
		const lines = tailOut.stdout
			.split("\n")
			.filter((line) => line.length > 0 && !line.startsWith("=="))
			.slice(-tailLines)
			.map((line) => parseLine(line, "gateway.log"));

		const envelope: LiveDataEnvelope<LogsPayload> = {
			ok: true,
			data: { lines, files, tailLines },
			fetchedAt: new Date().toISOString(),
		};
		return Response.json(envelope, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const envelope: LiveDataEnvelope<LogsPayload> = {
			ok: false,
			reason: "exec_failed",
			message: err instanceof Error ? err.message : "exec failed",
		};
		return Response.json(envelope);
	}
}

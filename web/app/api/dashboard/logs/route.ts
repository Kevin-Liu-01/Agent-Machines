/**
 * GET /api/dashboard/logs?n=200
 *
 * Tails the agent gateway log on the live machine. PR2 keeps it as
 * a polled tail; SSE streaming is a future hardening (would need a
 * Cloudflare-friendly long-poll or a separate admin daemon, both bigger
 * than this PR's scope).
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import type {
	LiveDataEnvelope,
	LogLine,
	LogsPayload,
} from "@/lib/dashboard/types";
import { getUserConfig } from "@/lib/user-config/clerk";

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
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const requested = Number(url.searchParams.get("n") ?? DEFAULT_N);
	const tailLines = Number.isFinite(requested)
		? Math.min(MAX_N, Math.max(20, Math.floor(requested)))
		: DEFAULT_N;

	const config = await getUserConfig();
	const active = config.machines.find((m) => m.id === config.activeMachineId);
	if (!active || !config.providers.dedalus?.apiKey) {
		const envelope: LiveDataEnvelope<LogsPayload> = {
			ok: false,
			reason: "config_missing",
			message:
				"No machine configured. Complete /dashboard/setup to provision.",
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
		// Inventory: list every log file under the agent runtime
		// (~/.agent-machines/logs/*) plus their sizes in one shot so the
		// UI can show "you have N log files totalling X MiB". `find -printf`
		// is GNU-only; the VM image ships GNU findutils so we lean on it.
		const inventoryOut = await execOnMachine(
			[
				"mkdir -p $HOME/.agent-machines/logs",
				"find $HOME/.agent-machines/logs -maxdepth 2 -type f \\( -name '*.log' -o -name 'gateway.log' \\) -printf '%p\\t%s\\n' 2>/dev/null | sort",
			].join(" && "),
		);
		const files = inventoryOut.stdout
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [rawPath, size] = line.split("\t");
				const path = rawPath
					.replace(/\/home\/[^/]+\/\.agent-machines/, "~/.agent-machines");
				return {
					path,
					bytes: Number.parseInt(size ?? "0", 10) || 0,
				};
			});

		// Tail agent log files. tailLines is the budget -- so the caller
		// asking for n=200 can see up to 200 lines from the runtime.
		const agentOut = await execOnMachine(
			`if compgen -G "$HOME/.agent-machines/logs/*.log" > /dev/null; then tail -n ${tailLines} $HOME/.agent-machines/logs/*.log 2>/dev/null; else echo ""; fi`,
		);

		function tailToLines(stdout: string, source: string): LogLine[] {
			return stdout
				.split("\n")
				.filter((line) => line.length > 0 && !line.startsWith("=="))
				.map((line) => parseLine(line, source));
		}

		const hermesLines = tailToLines(agentOut.stdout, "agent");
		const openclawLines: LogLine[] = [];

		// Merge by parsed timestamp. Lines without a parseable
		// timestamp keep their relative position within their agent
		// stream so they don't bunch at the top. We allocate the
		// merged result up to the requested tailLines so the response
		// stays bounded regardless of how chatty either agent is.
		const merged = [...hermesLines, ...openclawLines]
			.sort((a, b) => {
				const aT = a.at ?? "";
				const bT = b.at ?? "";
				if (!aT && !bT) return 0;
				if (!aT) return -1;
				if (!bT) return 1;
				return aT.localeCompare(bT);
			})
			.slice(-tailLines);

		const envelope: LiveDataEnvelope<LogsPayload> = {
			ok: true,
			data: { lines: merged, files, tailLines },
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

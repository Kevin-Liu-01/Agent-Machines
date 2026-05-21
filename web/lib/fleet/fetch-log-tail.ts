import type { LogLine } from "@/lib/dashboard/types";

const LOG_TAIL = 20;

type LogsEnvelope = {
	ok: boolean;
	data?: { lines: LogLine[] };
};

export async function fetchLogTail(machineId: string, n = LOG_TAIL): Promise<LogLine[]> {
	const res = await fetch(
		`/api/dashboard/logs?machineId=${encodeURIComponent(machineId)}&n=${n}`,
		{ cache: "no-store" },
	);
	if (!res.ok) return [];
	const body = (await res.json()) as LogsEnvelope;
	return body.data?.lines ?? [];
}

export function headlineFromLogs(lines: LogLine[]): string | null {
	const gw = lines.find(
		(l) => l.source === "gateway" && l.message.toLowerCase().includes("gateway healthy"),
	);
	if (!gw) return null;
	const parts = gw.message.split("—");
	return parts.length > 1 ? parts.slice(1).join("—").trim() : null;
}

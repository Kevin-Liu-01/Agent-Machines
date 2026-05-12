/**
 * GET /api/dashboard/sessions
 *
 * Lists recent agent session SQLite files in `~/.agent-machines/sessions/`.
 * The agent stores one DB per session by default. We don't crack the SQLite
 * open here -- that requires a binary on the VM. Instead, we treat each
 * `.db` file as one session and surface size + mtime + filename. PR2.5
 * would add a session detail view that runs a small `sqlite3` query
 * remotely to dump the transcript.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import type {
	LiveDataEnvelope,
	SessionRecord,
	SessionsPayload,
} from "@/lib/dashboard/types";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 80;

type RawSession = {
	path: string;
	size: number;
	mtime: number;
};

function parseRows(stdout: string): RawSession[] {
	return stdout
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [path, size, mtime] = line.split("\t");
			return {
				path: (path ?? "").trim(),
				size: Number.parseInt(size ?? "0", 10) || 0,
				mtime: Number.parseInt(mtime ?? "0", 10) || 0,
			};
		})
		.filter((row) => row.path);
}

function toSummary(row: RawSession): SessionRecord {
	const filename = row.path.split("/").pop() ?? row.path;
	const id = filename.replace(/\.db(?:-(?:wal|shm|journal))?$/, "");
	const updatedAt = row.mtime ? new Date(row.mtime * 1000).toISOString() : null;
	return {
		id,
		preview: filename,
		updatedAt,
		bytes: row.size,
	};
}

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const config = await getUserConfig();
	const active = config.machines.find((m) => m.id === config.activeMachineId);
	if (!active || !config.providers.dedalus?.apiKey) {
		const envelope: LiveDataEnvelope<SessionsPayload> = {
			ok: false,
			reason: "config_missing",
			message:
				"No machine configured. Complete /dashboard/setup to provision.",
		};
		return Response.json(envelope);
	}

	if (!(await isMachineRunning())) {
		const envelope: LiveDataEnvelope<SessionsPayload> = {
			ok: false,
			reason: "machine_offline",
			message: "Machine is not running. Wake it with `npm run wake`.",
		};
		return Response.json(envelope);
	}

	try {
		const command = `find $HOME/.agent-machines/sessions -maxdepth 2 -type f -name '*.db' -printf '%p\\t%s\\t%T@\\n' 2>/dev/null | sort -t$'\\t' -k3,3nr | head -n ${LIST_LIMIT}`;
		const { stdout } = await execOnMachine(command);
		const rows = parseRows(stdout);
		const sessions = rows.map(toSummary);
		const totalBytes = rows.reduce((acc, r) => acc + r.size, 0);

		const envelope: LiveDataEnvelope<SessionsPayload> = {
			ok: true,
			data: {
				sessions,
				totalSessions: sessions.length,
				totalBytes,
				dbPath: "~/.agent-machines/sessions/",
			},
			fetchedAt: new Date().toISOString(),
		};
		return Response.json(envelope, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const envelope: LiveDataEnvelope<SessionsPayload> = {
			ok: false,
			reason: "exec_failed",
			message: err instanceof Error ? err.message : "exec failed",
		};
		return Response.json(envelope);
	}
}

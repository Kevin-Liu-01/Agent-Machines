/**
 * POST|GET /api/internal/cron/tick -- server-side cron scheduler.
 *
 * Invoked by Vercel Cron (see web/vercel.json). Enumerates users, finds the
 * crons that became due, and dispatches each on its machine in the
 * background, recording lastRunAt/lastStatus on the cron entry.
 *
 * Auth: Vercel attaches `Authorization: Bearer $CRON_SECRET` (and an
 * `x-vercel-cron` header) to scheduled invocations. We accept either, plus
 * the local dev bypass. Anything else is rejected so the endpoint can't be
 * triggered by the public.
 */

import { clerkClient } from "@clerk/nextjs/server";

import {
	getUserConfigById,
	setUserConfigById,
} from "@/lib/user-config/clerk";
import { authorizedInternalRequest } from "@/lib/cron/auth";
import { listDueCrons, runCronOnMachine } from "@/lib/crons/service";
import { ingestRunTracesForUser } from "@/lib/learning/ingest";
import { collectMetricsForUser } from "@/lib/metrics/collector";
import { DEV_USER_ID, isDevBypassEnabled } from "@/lib/user-config/identity";
import type { CronEntry } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_PAGE_LIMIT = 500;
// Seconds this tick represents -- must match the vercel.json cron schedule
// (*/5 == 300s) so usage accumulation (awake/CPU/memory/storage) is accurate.
const TICK_INTERVAL_SECONDS = 300;

async function listUserIds(): Promise<string[]> {
	if (isDevBypassEnabled() || !process.env.CLERK_SECRET_KEY) {
		return [DEV_USER_ID];
	}
	const client = await clerkClient();
	const res = await client.users.getUserList({ limit: USER_PAGE_LIMIT });
	return res.data.map((u) => u.id);
}

type UserTick = {
	fired: number;
	failed: number;
	collected: number;
	transitions: number;
	ingested: number;
};

async function tickUser(userId: string): Promise<UserTick> {
	const config = await getUserConfigById(userId);
	const now = Date.now();

	// Usage + activity tracking runs every tick (independent of crons): probe
	// running machines, store resource samples, roll up daily usage/cost, and
	// record phase transitions. Best-effort -- never let it abort the tick.
	let collected = 0;
	let transitions = 0;
	try {
		const m = await collectMetricsForUser(userId, config, TICK_INTERVAL_SECONDS);
		collected = m.collected;
		transitions = m.transitions;
	} catch {
		// metrics collection is best-effort
	}

	// Loop 0: read each cron machine's on-box runs.jsonl and emit normalized
	// traces. Best-effort so learning never blocks usage collection or cron
	// dispatch.
	let ingested = 0;
	try {
		ingested = await ingestRunTracesForUser(userId, config);
	} catch {
		// trace ingest is best-effort
	}

	const due = listDueCrons(config, now);
	if (due.length === 0) {
		return { fired: 0, failed: 0, collected, transitions, ingested };
	}

	const dueIds = new Set(due.map((c) => c.id));
	const results = await Promise.all(
		due.map((cron) => runCronOnMachine(config, cron, { wait: false })),
	);
	const statusById = new Map<string, (typeof results)[number]>();
	due.forEach((cron, i) => statusById.set(cron.id, results[i]));

	const ranAt = new Date().toISOString();
	const nextCrons: CronEntry[] = (config.crons ?? []).map((cron) => {
		if (!dueIds.has(cron.id)) return cron;
		const r = statusById.get(cron.id);
		return {
			...cron,
			lastRunAt: ranAt,
			lastStatus: r?.status ?? "running",
			lastSummary: r?.message ?? "dispatched",
		};
	});
	await setUserConfigById(userId, { crons: nextCrons });

	const failed = results.filter((r) => !r.ok).length;
	return { fired: due.length, failed, collected, transitions, ingested };
}

async function handle(req: Request): Promise<Response> {
	if (!authorizedInternalRequest(req)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let users: string[];
	try {
		users = await listUserIds();
	} catch (err) {
		return Response.json(
			{ ok: false, error: err instanceof Error ? err.message : "enumerate_failed" },
			{ status: 500 },
		);
	}

	let fired = 0;
	let failed = 0;
	let collected = 0;
	let transitions = 0;
	let ingested = 0;
	let scanned = 0;
	for (const userId of users) {
		try {
			const r = await tickUser(userId);
			fired += r.fired;
			failed += r.failed;
			collected += r.collected;
			transitions += r.transitions;
			ingested += r.ingested;
			scanned += 1;
		} catch {
			// One user's failure must not abort the whole tick.
		}
	}

	return Response.json({
		ok: true,
		users: scanned,
		fired,
		failed,
		collected,
		transitions,
		ingested,
		at: new Date().toISOString(),
	});
}

export async function POST(req: Request): Promise<Response> {
	return handle(req);
}

export async function GET(req: Request): Promise<Response> {
	return handle(req);
}

/**
 * POST|GET /api/internal/cron/tick — server-side cron scheduler.
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
import { DEV_USER_ID, isDevBypassEnabled } from "@/lib/user-config/identity";
import { listDueCrons, runCronOnMachine } from "@/lib/crons/service";
import type { CronEntry } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_PAGE_LIMIT = 500;

function authorized(req: Request): boolean {
	if (isDevBypassEnabled()) return true;
	if (req.headers.get("x-vercel-cron") != null) return true;
	const secret = process.env.CRON_SECRET;
	if (secret && req.headers.get("authorization") === `Bearer ${secret}`) {
		return true;
	}
	return false;
}

async function listUserIds(): Promise<string[]> {
	if (isDevBypassEnabled() || !process.env.CLERK_SECRET_KEY) {
		return [DEV_USER_ID];
	}
	const client = await clerkClient();
	const res = await client.users.getUserList({ limit: USER_PAGE_LIMIT });
	return res.data.map((u) => u.id);
}

async function tickUser(userId: string): Promise<{ fired: number; failed: number }> {
	const config = await getUserConfigById(userId);
	const now = Date.now();
	const due = listDueCrons(config, now);
	if (due.length === 0) return { fired: 0, failed: 0 };

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
	return { fired: due.length, failed };
}

async function handle(req: Request): Promise<Response> {
	if (!authorized(req)) {
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
	let scanned = 0;
	for (const userId of users) {
		try {
			const r = await tickUser(userId);
			fired += r.fired;
			failed += r.failed;
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
		at: new Date().toISOString(),
	});
}

export async function POST(req: Request): Promise<Response> {
	return handle(req);
}

export async function GET(req: Request): Promise<Response> {
	return handle(req);
}

/**
 * GET / POST /api/dashboard/machines/[id]/migrate -- move this machine's load
 * to another substrate (sandbox router, hosted plane).
 *
 *   GET  -- the lanes this machine could move to: credentialed lanes enabled,
 *           uncredentialed lanes listed with their missing keys (the same
 *           fail-closed explanation the mux prints), plus the STATIC
 *           state-move contract (what moves / is re-derived / is lost),
 *           value-imported from "agent-machines/mux" so every surface quotes
 *           one wording.
 *   POST -- validate, persist migrationState "running", schedule the
 *           background orchestration (lib/dashboard/migrate.ts), 202. The
 *           dashboard polls migrationState at the existing 5s cadence; the
 *           terminal state carries the full MigrationReport -- the report IS
 *           the API response, not a log line.
 */

import { after } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";

// VALUES via the compiled package; see lib/dashboard/migrate.ts header.
import { MOVE_ALLOWLIST, MOVE_NOTES, REDERIVED, lostState } from "agent-machines/mux";

import { runMachineMigration, type MigrationSourceOption } from "@/lib/dashboard/migrate";
import { resolveRoute } from "@/lib/mux/route";
import { getProvider } from "@/lib/providers";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import {
	PROVIDER_KINDS,
	type MigrationState,
	type ProviderKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

type PostBody = {
	to?: ProviderKind;
	moveState?: boolean;
	source?: MigrationSourceOption;
};

function isProvider(value: unknown): value is ProviderKind {
	return typeof value === "string" && (PROVIDER_KINDS as ReadonlyArray<string>).includes(value);
}

const SOURCE_OPTIONS: ReadonlyArray<MigrationSourceOption> = ["destroy", "park", "keep"];

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;

	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === id);
	if (!machine) return Response.json({ error: "not_found" }, { status: 404 });

	const { route, skipped } = resolveRoute(config);
	const lanes = route
		.filter((kind) => kind !== machine.providerKind)
		.map((kind) => ({ substrate: kind }));

	// Whether "park the old sandbox" is offerable is a capability fact of the
	// SOURCE provider (the disposition acts on the machine being left), read
	// from the facade, never guessed.
	let canParkSource = false;
	try {
		canParkSource = getProvider(machine.providerKind, config.providers).capabilities.canSleep;
	} catch {
		canParkSource = false;
	}

	return Response.json({
		ok: true,
		machineId: machine.id,
		current: machine.providerKind,
		agentKind: machine.agentKind,
		lanes,
		skipped,
		canParkSource,
		migrationState: machine.migrationState ?? null,
		// The static contract, one wording everywhere (the SDK's statemove
		// constants): rendered verbatim by the confirm dialog.
		contract: {
			moves: MOVE_ALLOWLIST(machine.agentKind).include,
			rederived: REDERIVED(machine.agentKind),
			lost: lostState(machine.providerKind),
			notes: MOVE_NOTES(machine.agentKind),
		},
	});
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;

	let body: PostBody;
	try {
		body = (await request.json()) as PostBody;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	if (!isProvider(body.to)) {
		return Response.json(
			{ error: "invalid_substrate", message: `to must be one of ${PROVIDER_KINDS.join(", ")}` },
			{ status: 400 },
		);
	}
	const to = body.to;
	const moveState = body.moveState !== false;
	const source: MigrationSourceOption =
		body.source !== undefined && SOURCE_OPTIONS.includes(body.source)
			? body.source
			: "destroy";
	if (body.source !== undefined && !SOURCE_OPTIONS.includes(body.source)) {
		return Response.json(
			{ error: "invalid_source", message: `source must be one of ${SOURCE_OPTIONS.join(", ")}` },
			{ status: 400 },
		);
	}

	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === id);
	if (!machine) return Response.json({ error: "not_found" }, { status: 404 });

	if (machine.providerKind === to) {
		// A same-lane no-op that reported "migrated" would lie; a same-lane
		// rebuild is a different feature.
		return Response.json(
			{ error: "same_substrate", message: `already on ${to}; migrate moves between substrates` },
			{ status: 400 },
		);
	}

	// Fail closed, visibly: the target lane's missing keys are NAMED.
	const { route, skipped } = resolveRoute(config, { primary: to, order: [to] });
	if (route.length === 0) {
		const missing = skipped.find((entry) => entry.substrate === to);
		return Response.json(
			{
				error: "missing_provider_credentials",
				missing: missing?.missing ?? [],
				message: `No ${to} credentials on file. Missing: ${missing?.missing.join(", ") ?? "unknown"}`,
			},
			{ status: 409 },
		);
	}

	// One operation per machine at a time -- a migration racing a bootstrap
	// (or another migration) interleaves writes on the same state machines.
	if (machine.bootstrapState.phase === "running") {
		return Response.json(
			{ error: "operation_running", message: "A bootstrap is already running on this machine." },
			{ status: 409 },
		);
	}
	if (machine.migrationState?.phase === "running") {
		return Response.json(
			{ error: "operation_running", message: "A migration of this machine is already in flight." },
			{ status: 409 },
		);
	}

	// No vercel special case. An earlier version refused vercel + moveState,
	// justified by "vercel has no persistent disk" -- which the repo's own
	// capability record contradicts (persistence: filesystem-snapshot, wake
	// resumes from the snapshot, hasPersistentDisk derives true; caught by an
	// adversarial review 2026-08-03). The migrate machinery's verify step is
	// the real guard: if a target genuinely cannot hold the state, the marker
	// check fails, the new box is torn down, and the original stays intact.
	const migrationState: MigrationState = {
		phase: "running",
		step: "validate",
		startedAt: new Date().toISOString(),
		finishedAt: null,
		lastError: null,
		targetSubstrate: to,
		newMachineId: null,
		report: null,
	};
	await setUserConfig({ patchMachine: { id, patch: { migrationState } } });

	// userId is captured HERE, from this request, and carried into the background
	// task: the placement re-point after commit is a tenant-scoped write, and
	// re-resolving identity inside `after()` is how such a write lands under the
	// wrong tenant.
	after(() => runMachineMigration({ machineId: id, to, moveState, source, userId }));

	return Response.json({ ok: true, machineId: id, migration: "scheduled" }, { status: 202 });
}

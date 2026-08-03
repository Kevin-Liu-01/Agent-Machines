/**
 * POST /api/dashboard/machines/[id]/agent -- switch WHICH HARNESS ANSWERS on
 * this machine (agent router, hosted plane).
 *
 * This is an explicit action endpoint, not a PATCH side effect, because a
 * label write that silently becomes a ~10-minute install is the trap the old
 * PATCH agentKind path shipped: it wrote the DB record and never touched the
 * sandbox, so the dashboard label and the installed harness disagreed. That
 * PATCH now 400s and points here.
 *
 * Effect: ONE setUserConfig (agentKind + bootstrapState reset), then a
 * force bootstrap in the background. Force re-runs every phase keyed off the
 * NEW agentKind (runner.ts commandFor), which is the only correct hosted
 * swap path -- a non-force run skips the completed start-gateway phase and
 * the new agent's gateway never starts. Progress rides the existing polled
 * bootstrapState idiom (AgentViewScreen / BootstrapPhaseBadge) for free.
 *
 * Rollback contract: POST again with the old agentKind. The old harness is
 * never uninstalled, so the force re-run hits idempotent installs and is
 * fast; both harnesses stay on disk.
 */

import crypto from "node:crypto";
import { after } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { validateAgentCredentials, agentCredentialRequirements } from "@/lib/agents/credentials";
import { scheduleWebBootstrap } from "@/lib/bootstrap/schedule-bootstrap";
import { getProvider } from "@/lib/providers";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import {
	AGENT_KINDS,
	INITIAL_BOOTSTRAP_STATE,
	type AgentKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

type Body = { agentKind?: AgentKind };

function isAgent(value: unknown): value is AgentKind {
	return typeof value === "string" && (AGENT_KINDS as ReadonlyArray<string>).includes(value);
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	if (!isAgent(body.agentKind)) {
		return Response.json(
			{ error: "invalid_agent_kind", message: `agentKind must be one of ${AGENT_KINDS.join(", ")}` },
			{ status: 400 },
		);
	}
	const agentKind = body.agentKind;

	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === id) ?? null;
	if (!machine) return Response.json({ error: "not_found" }, { status: 404 });

	if (machine.agentKind === agentKind) {
		return Response.json(
			{
				error: "agent_unchanged",
				message: `${agentKind} is already the agent on this machine.`,
			},
			{ status: 400 },
		);
	}

	// Fail closed BEFORE any write: a harness whose upstream key is missing
	// must not cost a bootstrap run that dies at the credential gate. The
	// missing key is NAMED so the 409 body is actionable, not just red.
	const credCheck = validateAgentCredentials(agentKind, config);
	if (!credCheck.ok) {
		const missing = agentCredentialRequirements(agentKind)
			.filter((req) => req.required)
			.map((req) => req.field);
		return Response.json(
			{ error: "missing_agent_credentials", missing, message: credCheck.message },
			{ status: 409 },
		);
	}

	// One operation at a time per machine: a swap racing a bootstrap or a
	// migration would interleave phase writes on the same state machine.
	if (machine.bootstrapState.phase === "running") {
		return Response.json(
			{ error: "operation_running", message: "A bootstrap is already running on this machine." },
			{ status: 409 },
		);
	}
	if (machine.migrationState?.phase === "running") {
		return Response.json(
			{ error: "operation_running", message: "A migration is already running on this machine." },
			{ status: 409 },
		);
	}

	// Provider resolution can fail (substrate credentials revoked since
	// provisioning); check before writing so the record never flips without a
	// scheduled install behind it.
	let provider: ReturnType<typeof getProvider>;
	try {
		provider = getProvider(machine.providerKind, config.providers);
	} catch (err) {
		return Response.json(
			{
				error: "missing_credentials",
				message: err instanceof Error ? err.message : "Provider credentials missing.",
			},
			{ status: 400 },
		);
	}

	// ONE config write: the new agentKind and a reset bootstrapState land
	// together, so a poller never sees "openclaw + succeeded" before the
	// install ran. apiUrl/apiKey are cleared -- both derive from the agent
	// (gateway port/env-file key differ per harness) and the force bootstrap
	// re-derives them; a stale hermes URL on an openclaw box is a lie.
	await setUserConfig({
		patchMachine: {
			id,
			patch: {
				agentKind,
				apiUrl: null,
				apiKey: crypto.randomUUID(),
				bootstrapState: { ...INITIAL_BOOTSTRAP_STATE },
			},
		},
	});

	const latestConfig = await getUserConfig();
	const machineForBootstrap = latestConfig.machines.find((m) => m.id === id);
	if (!machineForBootstrap) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}

	after(() =>
		scheduleWebBootstrap(machineForBootstrap, provider, latestConfig, { force: true }),
	);

	return Response.json(
		{ ok: true, machineId: id, agentKind, bootstrap: "scheduled" },
		{ status: 202 },
	);
}

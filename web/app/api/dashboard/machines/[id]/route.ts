/**
 * GET / PATCH / DELETE /api/dashboard/machines/[id]
 *
 *   GET    -- single machine + live state
 *   PATCH  -- mutate stored fields (name, model, apiUrl, apiKey)
 *             or set this machine as active via { active: true }.
 *             agentKind is NOT patchable: relabeling without installing was
 *             the trap (a Hermes box labeled OpenClaw with no OpenClaw on
 *             it); POST machines/[id]/agent installs, verifies, relabels.
 *   DELETE -- archive (default) or hard-destroy via ?destroy=1
 *
 * DELETE also prunes this machine's mux placement on the two paths that end the
 * record (?destroy=1, ?remove=1), never on archive: an archived machine is
 * still addressable and unarchivable, so its placement must survive. The prune
 * is guarded by sandbox id (lib/mux/placements.ts) -- after a migration the
 * name points at the NEW sandbox, and destroying the old record must not
 * strand it.
 */

import { after } from "next/server";

import { isRemovedDedalusRouter } from "@/lib/agents/upstreams";
import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { getEffectiveUserId } from "@/lib/user-config/identity";

import { forgetHostedPlacement } from "@/lib/mux/placements";
import { MachineProviderError, getProvider } from "@/lib/providers";
import {
	getUserConfigById,
	setOperationalUserConfigById,
} from "@/lib/user-config/clerk";
import type { MachineRef, UserConfig } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

type PatchBody = {
	name?: string;
	/** Rejected with 400 -- see PATCH below. */
	agentKind?: unknown;
	model?: string;
	apiUrl?: string | null;
	apiKey?: string | null;
	active?: boolean;
	gatewayProfileId?: string | null;
	environmentProfileId?: string | null;
};

async function find(
	userId: string,
	id: string,
): Promise<{ config: UserConfig; machine: MachineRef } | null> {
	const config = await getUserConfigById(userId);
	const machine = config.machines.find((candidate) => candidate.id === id);
	return machine ? { config, machine } : null;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const found = await find(userId, id);
	if (!found) return Response.json({ error: "not_found" }, { status: 404 });
	const { config, machine } = found;
	let live: unknown = null;
	try {
		const provider = getProvider(machine.providerKind, config.providers);
		live = await provider.state(machine.id);
	} catch (err) {
		const reason =
			err instanceof MachineProviderError ? err.message : err instanceof Error ? err.message : "probe failed";
		live = { error: reason };
	}
	const { apiKey, ...rest } = machine;
	return Response.json({
		ok: true,
		machine: { ...rest, hasApiKey: Boolean(apiKey) },
		live,
	});
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const found = await find(userId, id);
	if (!found) return Response.json({ error: "not_found" }, { status: 404 });
	const { config } = found;

	let body: PatchBody;
	try {
		body = (await request.json()) as PatchBody;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	const patch: Partial<MachineRef> = {};
	const setActive = body.active === true;
	if (typeof body.name === "string" && body.name.trim().length > 0) {
		patch.name = body.name.trim().slice(0, 80);
	}
	if (body.agentKind !== undefined) {
		// PATCH used to accept this and write ONLY the DB record -- the sandbox
		// kept running the old harness, so the label and the machine disagreed.
		// The action endpoint installs the harness, verifies it answers, and
		// only then relabels.
		return Response.json(
			{
				error: "agent_kind_immutable",
				message: `agentKind changes install a harness; POST /api/dashboard/machines/${id}/agent`,
			},
			{ status: 400 },
		);
	}
	if (typeof body.model === "string") {
		patch.model = body.model.trim();
	}
	if (body.apiUrl !== undefined) {
		patch.apiUrl =
			typeof body.apiUrl === "string" && body.apiUrl.trim().length > 0
				? body.apiUrl.trim().replace(/\/$/, "")
				: null;
	}
	if (body.apiKey !== undefined) {
		patch.apiKey =
			typeof body.apiKey === "string" && body.apiKey.trim().length > 0
				? body.apiKey.trim()
				: null;
	}
	if (body.gatewayProfileId !== undefined) {
		if (isRemovedDedalusRouter(body.gatewayProfileId)) {
			return Response.json(
				{
					error: "unsupported_gateway",
					message:
						"Dedalus is a sandbox provider only; choose Vercel AI Gateway or OpenRouter.",
				},
				{ status: 400 },
			);
		}
		patch.gatewayProfileId =
			typeof body.gatewayProfileId === "string" && body.gatewayProfileId.trim().length > 0
				? body.gatewayProfileId.trim()
				: null;
	}
	if (body.environmentProfileId !== undefined) {
		patch.environmentProfileId =
			typeof body.environmentProfileId === "string" && body.environmentProfileId.trim().length > 0
				? body.environmentProfileId.trim()
				: null;
	}

	if (Object.keys(patch).length === 0 && !setActive) {
		return Response.json({ error: "no_changes" }, { status: 422 });
	}

	const next = await setOperationalUserConfigById(userId, config, {
		...(setActive ? { activeMachineId: id } : {}),
		...(Object.keys(patch).length > 0 ? { patchMachine: { id, patch } } : {}),
	});
	const updated = next.machines.find((m) => m.id === id);
	if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
	const { apiKey, ...rest } = updated;
	return Response.json({
		ok: true,
		machine: { ...rest, hasApiKey: Boolean(apiKey) },
	});
}

/**
 * DELETE modes via query params:
 *   (none)       -- soft archive (sets archived: true, recoverable)
 *   ?destroy=1   -- hard destroy on provider + remove from config
 *   ?remove=1    -- force-remove from config without calling provider
 *                   (for stuck/already-destroyed machines)
 *   ?unarchive=1 -- restore an archived machine (un-sets archived flag)
 */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const found = await find(userId, id);
	if (!found) return Response.json({ error: "not_found" }, { status: 404 });
	const { config, machine } = found;
	const url = new URL(request.url);

	if (url.searchParams.get("unarchive") === "1") {
		await setOperationalUserConfigById(userId, config, { unarchiveMachine: id });
		return Response.json({ ok: true, action: "unarchived" });
	}

	if (url.searchParams.get("remove") === "1") {
		// Prune the mux placement BEFORE the record goes: once the row is gone
		// nothing on this plane could ever identify the placement again, and the
		// store deliberately has no TTL (src/mux/state.ts "Staleness"), so it
		// would be an unprunable entry pointing at a sandbox no dashboard row
		// explains. Guarded by sandbox id inside, and best-effort -- see below.
		const placement = await forgetHostedPlacement({ userId, machine });
		await setOperationalUserConfigById(userId, config, { removeMachine: id });
		return Response.json({ ok: true, action: "removed", placement });
	}

	const hardDestroy = url.searchParams.get("destroy") === "1";
	if (hardDestroy) {
		try {
			const submitted = await submitMachineIntent(userId, machine.id, {
				desiredState: "deleted",
				idempotencyKey:
					request.headers?.get?.("idempotency-key") ??
					`destroy:${machine.id}:${crypto.randomUUID()}`,
			});
			after(async () => {
				await submitted.controlPlane.reconcileNext(submitted.accepted.worker.id);
			});
			return Response.json(
				{
					ok: true,
					action: "destroy_scheduled",
					operation: submitted.accepted.operation,
					statusUrl: `/api/dashboard/control-plane/operations/${submitted.accepted.operation.id}`,
				},
				{ status: 202 },
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "destroy failed";
			return Response.json(
				{ error: "destroy_failed", message },
				{ status: 502 },
			);
		}
	}

	await setOperationalUserConfigById(userId, config, { archiveMachine: id });
	return Response.json({ ok: true, action: "archived" });
}

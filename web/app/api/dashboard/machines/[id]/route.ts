/**
 * GET / PATCH / DELETE /api/dashboard/machines/[id]
 *
 *   GET    -- single machine + live state
 *   PATCH  -- journal model/router changes for runtime reconciliation;
 *             mutate stored metadata (name, apiUrl, apiKey)
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
import { DEFAULT_ROUTER_ID } from "@/lib/agents/upstreams";
import { initialWorkerModel, modelForEndpoint } from "@/lib/agents/model-endpoint";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { modelEndpointForSelection } from "@/lib/bootstrap/runner";
import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { deletionStorageWarning } from "@/lib/dashboard/deletion-warning";

import { forgetHostedPlacement } from "@/lib/mux/placements";
import { MachineProviderError, getProvider, type ProviderCapabilities } from "@/lib/providers";
import {
	getUserConfigById,
	setOperationalUserConfigById,
} from "@/lib/user-config/clerk";
import type { MachineRef, UserConfig } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
	let capabilities: ProviderCapabilities | null = null;
	try {
		const provider = getProvider(machine.providerKind, config.providers);
		capabilities = provider.capabilities;
		live = await provider.state(machine.id);
	} catch (err) {
		const reason =
			err instanceof MachineProviderError ? err.message : err instanceof Error ? err.message : "probe failed";
		live = { error: reason };
	}
	const { apiKey, ...rest } = machine;
	return Response.json({
		ok: true,
		machine: { ...rest, hasApiKey: Boolean(apiKey), capabilities },
		live,
	});
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;
	const found = await find(userId, id);
	if (!found) return Response.json({ error: "not_found" }, { status: 404 });
	const { config, machine } = found;

	let body: PatchBody;
	try {
		body = (await request.json()) as PatchBody;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	if (!body || typeof body !== "object" || Array.isArray(body)
		|| (body.model !== undefined && typeof body.model !== "string")
		|| (body.gatewayProfileId !== undefined && body.gatewayProfileId !== null && typeof body.gatewayProfileId !== "string")) {
		return Response.json({ error: "invalid_body" }, { status: 400 });
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
						"Dedalus providers and model gateways are retired. Choose a configured model upstream.",
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

	if (body.model !== undefined || body.gatewayProfileId !== undefined) {
		if (machine.archived) return Response.json({ error: "not_found" }, { status: 404 });
		if (machine.bootstrapState.phase === "running" || machine.migrationState?.phase === "running") {
			return Response.json({ error: "operation_running", message: "Wait for the current bootstrap or migration before changing runtime configuration." }, { status: 409 });
		}
		const gatewayProfileId = body.gatewayProfileId !== undefined
			? patch.gatewayProfileId ?? DEFAULT_ROUTER_ID
			: machine.gatewayProfileId;
		let model: string;
		try {
			const endpoint = modelEndpointForSelection({ agentKind: machine.agentKind, gatewayProfileId }, config);
			model = initialWorkerModel(machine.agentKind, endpoint, body.model, machine.model);
			// Native CLIs must not silently replace an explicit incompatible choice
			// with a default while the picker claims to have applied that choice.
			if (body.model?.trim() && (machine.agentKind === "claude-code" || machine.agentKind === "codex")
				&& model !== modelForEndpoint(body.model.trim(), endpoint)) {
				throw new Error(`Choose a model supported by ${machine.agentKind}.`);
			}
		} catch (error) {
			return Response.json({ error: "model_required", message: error instanceof Error ? error.message : "Choose a model for this endpoint." }, { status: 400 });
		}
		const credentialCheck = validateAgentCredentials(machine.agentKind, config);
		if (!credentialCheck.ok) return Response.json({ error: "missing_agent_credentials", message: credentialCheck.message }, { status: 409 });
		try {
			const linked = config.workers.find((worker) => worker.lastMachineId === id);
			const managed = await createHostedControlPlane(userId).store.getWorker(linked?.id ?? id);
			if (managed?.desiredState === "deleted") return Response.json({ error: "worker_deleted", message: "This Worker is being deleted." }, { status: 409 });
			// Existing desired state stays authoritative. Legacy adoption has no
			// desired state yet, so inspect without waking before choosing one.
			let legacyDesiredState: "sleeping" | "running" | undefined;
			if (!managed) {
				const observed = await getProvider(machine.providerKind, config.providers).state(id);
				if (observed.state !== "sleeping" && observed.state !== "ready") {
					return Response.json({ error: "machine_not_ready", message: "Verify the machine is running or paused before changing its runtime configuration." }, { status: 409 });
				}
				legacyDesiredState = observed.state === "sleeping" ? "sleeping" : "running";
			}
			const submitted = await submitMachineIntent(userId, id, {
				...(legacyDesiredState ? { desiredState: legacyDesiredState } : {}),
				idempotencyKey: request.headers.get("idempotency-key") ?? `model:${id}:${crypto.randomUUID()}`,
				spec: { model, gatewayProfileId, ...(patch.environmentProfileId !== undefined ? { environmentProfileId: patch.environmentProfileId } : {}) },
			});
			// The driver updates observed model/router fields only after bootstrap
			// succeeds. Never erase that drift signal by pre-writing their labels.
			delete patch.model;
			delete patch.gatewayProfileId;
			delete patch.environmentProfileId;
			let updated = machine;
			let metadataWarning: string | undefined;
			if (Object.keys(patch).length > 0 || setActive) {
				try {
					const next = await setOperationalUserConfigById(userId, config, {
						...(setActive ? { activeMachineId: id } : {}),
						...(Object.keys(patch).length ? { patchMachine: { id, patch } } : {}),
					});
					updated = next.machines.find((entry) => entry.id === id) ?? machine;
				} catch {
					metadataWarning = "Runtime update was accepted, but other metadata changes could not be saved. Retry those separately.";
				}
			}
			const operation = submitted.accepted.operation;
			const deferredUntilWake = submitted.accepted.worker.desiredState === "sleeping";
			if (operation.status !== "succeeded" && operation.status !== "failed") {
				after(async () => { await submitted.controlPlane.reconcileNext(submitted.accepted.worker.id); });
			}
			const { apiKey, ...rest } = updated;
			return Response.json({
				ok: operation.status !== "failed", machine: { ...rest, hasApiKey: Boolean(apiKey) },
				requested: { model, gatewayProfileId }, operation, deferredUntilWake, metadataWarning,
				statusUrl: `/api/dashboard/control-plane/operations/${operation.id}`,
				message: operation.status === "failed" ? operation.error ?? "Runtime update failed."
					: deferredUntilWake ? "Configuration saved for the next wake. The Worker remains paused."
						: operation.status === "succeeded" ? "Runtime configuration is reconciled." : "Runtime update queued. The current model remains shown until configuration succeeds.",
			}, { status: operation.status === "failed" ? 502 : operation.status === "succeeded" ? 200 : 202 });
		} catch (error) {
			return Response.json({ error: "runtime_update_failed", message: error instanceof Error ? error.message : "Could not submit runtime configuration." }, { status: 502 });
		}
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
					storageWarning: deletionStorageWarning(machine.providerKind),
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

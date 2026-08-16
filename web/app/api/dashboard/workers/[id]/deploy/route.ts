/**
 * POST /api/dashboard/workers/[id]/deploy — provision a machine from a worker
 * template (its agentKind + model + router), record it as the worker's
 * machine, and report it. The worker's memory bundle is installed during
 * bootstrap (see lib/memory/install + the bootstrap runner).
 *
 * Body (optional): { providerKind, spec } — the substrate to deploy onto,
 * defaulting to the user's wizard drafts.
 */

import { after } from "next/server";

import { validateAgentCredentials } from "@/lib/agents/credentials";
import { runtimeModel } from "@/lib/agents/runtime-model";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { resolveRoute, toSubstrateKind } from "@/lib/mux/route";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	DEFAULT_MACHINE_SPEC,
	PROVIDER_KINDS,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function isProvider(v: unknown): v is ProviderKind {
	return typeof v === "string" && (PROVIDER_KINDS as ReadonlyArray<string>).includes(v);
}

function asSpec(value: unknown, fallback: MachineSpec): MachineSpec {
	if (!value || typeof value !== "object") return fallback;
	const v = value as Record<string, unknown>;
	const vcpu = Number(v.vcpu);
	const mem = Number(v.memoryMib);
	const stor = Number(v.storageGib);
	if (!Number.isFinite(vcpu) || vcpu < 1 || vcpu > 16) return fallback;
	if (!Number.isFinite(mem) || mem < 512 || mem > 65_536) return fallback;
	if (!Number.isFinite(stor) || stor < 5 || stor > 200) return fallback;
	return { vcpu, memoryMib: mem, storageGib: stor };
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await ctx.params;

	const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

	const config = await getUserConfig();
	const worker = (config.workers ?? []).find((w) => w.id === id);
	if (!worker) return Response.json({ error: "not_found" }, { status: 404 });

	const providerKind: ProviderKind = isProvider(body.providerKind)
		? body.providerKind
		: config.draftProviderKind;
	const spec = asSpec(body.spec, config.draftSpec ?? DEFAULT_MACHINE_SPEC);
	const agentCredentials = validateAgentCredentials(worker.agentKind, config);
	if (!agentCredentials.ok) {
		return Response.json(
			{ error: "missing_ai_credentials", message: agentCredentials.message },
			{ status: 400 },
		);
	}

	const primaryMissing = resolveRoute(config, {
		primary: toSubstrateKind(providerKind),
		order: [toSubstrateKind(providerKind)],
	}).skipped[0];
	if (primaryMissing) {
		return Response.json(
			{
				error: "missing_provider_credentials",
				message: `No ${providerKind} credentials on file. Add them in /dashboard/setup. Missing: ${primaryMissing.missing.join(", ")}`,
			},
			{ status: 400 },
		);
	}

	const controlPlane = createHostedControlPlane(userId);
	const accepted = await controlPlane.apply({
		id: worker.id,
		desiredState: "running",
		spec: {
			name: worker.name,
			runtime: worker.agentKind,
			sandbox: providerKind,
			model: runtimeModel(worker.agentKind, worker.model),
			memoryBundleId: worker.memoryBundleId,
			rolePrompt: worker.rolePrompt,
			gatewayProfileId: worker.gatewayProfileId,
			resources: {
				vcpu: spec.vcpu,
				memoryMib: spec.memoryMib,
				diskGib: spec.storageGib,
			},
			migrationPolicy: "live",
		},
	});
	after(async () => {
		await controlPlane.reconcileNext(worker.id);
	});
	return Response.json(
		{
			ok: true,
			operation: accepted.operation,
			statusUrl: `/api/dashboard/control-plane/operations/${accepted.operation.id}`,
			message: "Worker intent accepted. Provisioning and bootstrap are journaled.",
		},
		{ status: 202 },
	);
}

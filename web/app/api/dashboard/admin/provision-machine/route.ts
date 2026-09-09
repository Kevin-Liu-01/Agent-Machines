import { after } from "next/server";

import { validateAgentCredentials } from "@/lib/agents/credentials";
import { initialWorkerModel } from "@/lib/agents/model-endpoint";
import { modelEndpointForSelection } from "@/lib/bootstrap/runner";
import { agentUsesRouter, isRemovedDedalusRouter } from "@/lib/agents/upstreams";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { recommendArm } from "@/lib/learning/recommend";
import { resolveRoute, toSubstrateKind } from "@/lib/mux/route";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import {
	AGENT_KINDS,
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MEMORY_BUNDLE_ID,
	PROVIDER_KINDS,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";
import { newWorker } from "@/lib/workers/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
	providerKind?: ProviderKind;
	agentKind?: AgentKind;
	workerId?: string;
	spec?: MachineSpec;
	model?: string;
	name?: string;
	force?: boolean;
	gatewayProfileId?: string;
	environmentProfileId?: string | null;
	autoRoute?: boolean;
	failover?: boolean;
};

function isProvider(value: unknown): value is ProviderKind {
	return typeof value === "string" && (PROVIDER_KINDS as readonly string[]).includes(value);
}

function isAgent(value: unknown): value is AgentKind {
	return typeof value === "string" && (AGENT_KINDS as readonly string[]).includes(value);
}

function asSpec(value: unknown, fallback: MachineSpec): MachineSpec {
	if (!value || typeof value !== "object") return fallback;
	const raw = value as Record<string, unknown>;
	const vcpu = Number(raw.vcpu);
	const memoryMib = Number(raw.memoryMib);
	const storageGib = Number(raw.storageGib);
	if (!Number.isFinite(vcpu) || vcpu < 1 || vcpu > 16) return fallback;
	if (!Number.isFinite(memoryMib) || memoryMib < 512 || memoryMib > 65_536) return fallback;
	if (!Number.isFinite(storageGib) || storageGib < 5 || storageGib > 200) return fallback;
	return { vcpu, memoryMib, storageGib };
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const body = ((await request.json().catch(() => ({}))) ?? {}) as Body;
	if (body.providerKind !== undefined && !isProvider(body.providerKind)) return Response.json({ error: "invalid_provider_kind", message: "Choose Daytona, E2B, Sprites, or Vercel." }, { status: 400 });
	if (isRemovedDedalusRouter(body.gatewayProfileId)) {
		return Response.json(
			{
				error: "unsupported_gateway",
				message: "This model gateway is retired. Choose a supported model endpoint.",
			},
			{ status: 400 },
		);
	}
	let config: Awaited<ReturnType<typeof getUserConfig>>;
	try {
		config = await getUserConfig();
	} catch (error) {
		return Response.json(
			{
				error: "config_read_failed",
				message: error instanceof Error ? error.message : "config read failed",
			},
			{ status: 500 },
		);
	}
	const existingWorker = body.workerId
		? config.workers.find((worker) => worker.id === body.workerId)
		: undefined;
	if (body.workerId && !existingWorker) {
		return Response.json({ error: "worker_not_found" }, { status: 404 });
	}

	const explicitModel = typeof body.model === "string" ? body.model.trim() || undefined : undefined;
	const recommendation =
		body.autoRoute === true
			? await recommendArm(config, {
					runtime: isAgent(body.agentKind) ? body.agentKind : undefined,
					substrate: isProvider(body.providerKind) ? body.providerKind : undefined,
					model: explicitModel,
					routerId: body.gatewayProfileId,
				}).catch(() => null)
			: null;
	const providerKind = isProvider(body.providerKind)
		? body.providerKind
		: recommendation?.arm.substrate ?? config.draftProviderKind;
	const agentKind = existingWorker?.agentKind ?? (isAgent(body.agentKind)
		? body.agentKind
		: recommendation?.arm.runtime ?? config.draftAgentKind);
	const credentialState = validateAgentCredentials(agentKind, config);
	if (!credentialState.ok) {
		return Response.json(
			{ error: "missing_ai_credentials", message: credentialState.message },
			{ status: 400 },
		);
	}
	const primary = toSubstrateKind(providerKind);
	const resolved = resolveRoute(
		config,
		body.failover === false ? { primary, order: [primary] } : { primary },
	);
	const primaryMissing = resolved.skipped.find((entry) => entry.substrate === primary);
	if (primaryMissing) {
		return Response.json(
			{
				error: "missing_provider_credentials",
				message: `No ${providerKind} credentials on file. Missing: ${primaryMissing.missing.join(", ")}`,
				attempts: resolved.skipped,
			},
			{ status: 400 },
		);
	}

	const spec = asSpec(body.spec, config.draftSpec ?? DEFAULT_MACHINE_SPEC);
	const gatewayProfileId =
		existingWorker?.gatewayProfileId.trim() ||
		(typeof body.gatewayProfileId === "string" ? body.gatewayProfileId.trim() : "") ||
		(agentUsesRouter(agentKind) ? recommendation?.arm.routerId?.trim() || "vercel-ai-gateway" : null);
	let model: string;
	try {
		model = initialWorkerModel(
			agentKind,
			modelEndpointForSelection({ agentKind, gatewayProfileId }, config),
			existingWorker?.model ?? explicitModel ?? recommendation?.arm.model,
			config.draftModel,
		);
	} catch (error) {
		return Response.json({ error: "model_required", message: error instanceof Error ? error.message : "Choose a model for the selected endpoint." }, { status: 400 });
	}
	const worker =
		existingWorker ??
		newWorker({
			name: body.name?.trim().slice(0, 80) || `${agentKind} worker`,
			agentKind,
			model,
			gatewayProfileId: gatewayProfileId ?? "vercel-ai-gateway",
			memoryBundleId: DEFAULT_MEMORY_BUNDLE_ID,
			rolePrompt: null,
			source: "custom",
		});
	if (!existingWorker) {
		await setUserConfig({ workers: [...config.workers, worker] });
	}

	const controlPlane = createHostedControlPlane(userId);
	const accepted = await controlPlane.apply(
		{
			id: worker.id,
			desiredState: "running",
			spec: {
				name: worker.name,
				runtime: agentKind,
				sandbox: providerKind,
				sandboxRoute:
					body.failover === false ? [primary] : resolved.route,
				model,
				memoryBundleId: worker.memoryBundleId,
				rolePrompt: worker.rolePrompt,
				gatewayProfileId,
				environmentProfileId: body.environmentProfileId ?? null,
				resources: {
					vcpu: spec.vcpu,
					memoryMib: spec.memoryMib,
					diskGib: spec.storageGib,
				},
				migrationPolicy: "live",
			},
		},
		{
			idempotencyKey:
				request.headers?.get?.("idempotency-key") ??
				(body.force ? `provision:${worker.id}:${crypto.randomUUID()}` : undefined),
		},
	);
	after(async () => {
		await controlPlane.reconcileNext(worker.id);
	});
	return Response.json(
		{
			ok: true,
			workerId: worker.id,
			machineId: accepted.worker.status.placement?.sandboxId ?? null,
			providerKind,
			phase: accepted.worker.status.phase,
			operation: accepted.operation,
			statusUrl: `/api/dashboard/control-plane/operations/${accepted.operation.id}`,
			attempts: [],
			bootstrapScheduled: true,
			message: "Worker intent accepted. Placement and runtime bootstrap are journaled.",
		},
		{ status: 202 },
	);
}

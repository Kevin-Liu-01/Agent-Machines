/**
 * POST /api/dashboard/control-plane/workers
 *
 * One worker intent in, one live console target out. The route deliberately
 * does not expose provision -> persist -> bootstrap as separate client steps.
 */

import {
	agentUsesRouter,
	DEFAULT_ROUTER_ID,
	isRemovedDedalusRouter,
} from "@/lib/agents/upstreams";
import { after } from "next/server";

import { validateAgentCredentials } from "@/lib/agents/credentials";
import { initialWorkerModel } from "@/lib/agents/model-endpoint";
import { modelEndpointForSelection } from "@/lib/bootstrap/runner";
import { createHostedControlPlane } from "@/lib/control-plane/service";
import { resolveRoute, toSubstrateKind } from "@/lib/mux/route";
import { newWorker } from "@/lib/workers/resolve";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	AGENT_KINDS,
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MEMORY_BUNDLE_ID,
	PROVIDER_KINDS,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const controlPlane = createHostedControlPlane(userId);
	return Response.json({ ok: true, workers: await controlPlane.store.listWorkers() });
}

function isAgent(value: unknown): value is AgentKind {
	return (
		typeof value === "string" &&
		(AGENT_KINDS as ReadonlyArray<string>).includes(value)
	);
}

function isProvider(value: unknown): value is ProviderKind {
	return (
		typeof value === "string" &&
		(PROVIDER_KINDS as ReadonlyArray<string>).includes(value)
	);
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

	const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
	if (!isAgent(body.runtime)) {
		return Response.json({ error: "invalid_runtime" }, { status: 400 });
	}
	if (!isProvider(body.sandbox)) {
		return Response.json({ error: "invalid_sandbox" }, { status: 400 });
	}
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

	const config = await getUserConfig();
	const agentCredentials = validateAgentCredentials(body.runtime, config);
	if (!agentCredentials.ok) {
		return Response.json(
			{ error: "missing_ai_credentials", message: agentCredentials.message },
			{ status: 400 },
		);
	}
	const primaryMissing = resolveRoute(config, {
		primary: toSubstrateKind(body.sandbox),
		order: [toSubstrateKind(body.sandbox)],
	}).skipped[0];
	if (primaryMissing) {
		return Response.json(
			{
				error: "missing_provider_credentials",
				message: `Add ${body.sandbox} credentials in Settings before launching. Missing: ${primaryMissing.missing.join(", ")}`,
			},
			{ status: 400 },
		);
	}

	const name =
		typeof body.name === "string" && body.name.trim()
			? body.name.trim().slice(0, 80)
			: `${body.runtime} worker`;
	const gatewayProfileId =
		agentUsesRouter(body.runtime) &&
		typeof body.gatewayProfileId === "string" &&
		body.gatewayProfileId
			? body.gatewayProfileId
			: DEFAULT_ROUTER_ID;
	let model: string;
	try {
		model = initialWorkerModel(body.runtime, modelEndpointForSelection({ agentKind: body.runtime, gatewayProfileId }, config), typeof body.model === "string" ? body.model : null, config.draftModel);
	} catch (error) {
		return Response.json({ error: "model_required", message: error instanceof Error ? error.message : "Choose a model for the selected endpoint." }, { status: 400 });
	}
	const worker = newWorker({
		name,
		agentKind: body.runtime,
		model,
		gatewayProfileId,
		memoryBundleId:
			typeof body.memoryBundleId === "string" && body.memoryBundleId
				? body.memoryBundleId
				: DEFAULT_MEMORY_BUNDLE_ID,
		rolePrompt: typeof body.rolePrompt === "string" ? body.rolePrompt : null,
		source: "custom",
	});

	try {
		const spec = asSpec(body.spec, config.draftSpec ?? DEFAULT_MACHINE_SPEC);
		const controlPlane = createHostedControlPlane(userId, config);
		const accepted = await controlPlane.apply({
			id: worker.id,
			desiredState: "running",
			spec: {
				name: worker.name,
				runtime: worker.agentKind,
				sandbox: body.sandbox,
				model: worker.model,
				memoryBundleId: worker.memoryBundleId,
				rolePrompt: worker.rolePrompt,
				gatewayProfileId: worker.gatewayProfileId,
				resources: {
					vcpu: spec.vcpu,
					memoryMib: spec.memoryMib,
					diskGib: spec.storageGib,
				},
				migrationPolicy: body.migrationPolicy === "copy" ? "copy" : "live",
			},
		});
		after(async () => {
			await controlPlane.reconcileNext(worker.id);
		});
		return Response.json(
			{
				ok: true,
				worker: accepted.worker,
				operation: accepted.operation,
				statusUrl: `/api/dashboard/control-plane/operations/${accepted.operation.id}`,
				intent: {
					runtime: body.runtime,
					sandbox: body.sandbox,
					desiredState: "running",
					migrationPolicy: "live",
				},
			},
			{ status: 202 },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "worker launch failed";
		console.error(`[control-plane/workers] launch failed for ${worker.id}:`, message);
		return Response.json(
			{ error: "launch_failed", message, workerId: worker.id },
			{ status: 502 },
		);
	}
}

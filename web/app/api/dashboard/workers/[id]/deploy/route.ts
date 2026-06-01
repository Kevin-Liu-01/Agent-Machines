/**
 * POST /api/dashboard/workers/[id]/deploy — provision a machine from a worker
 * template (its agentKind + model + router), record it as the worker's
 * machine, and report it. The worker's memory bundle is installed during
 * bootstrap (see lib/memory/install + the bootstrap runner).
 *
 * Body (optional): { providerKind, spec } — the substrate to deploy onto,
 * defaulting to the user's wizard drafts.
 */

import { MachineProviderError } from "@/lib/providers";
import { createMachineForConfig } from "@/lib/dashboard/provision";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import {
	DEFAULT_MACHINE_SPEC,
	PROVIDER_KINDS,
	type MachineSpec,
	type ProviderKind,
	type Worker,
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

	if (!config.providers[providerKind]) {
		return Response.json(
			{
				error: "missing_provider_credentials",
				message: `No ${providerKind} credentials on file. Add them in /dashboard/setup.`,
			},
			{ status: 400 },
		);
	}

	const name = `${worker.name}-${new Date().toISOString().slice(0, 10)}`.slice(0, 80);

	try {
		const created = await createMachineForConfig(config, {
			providerKind,
			agentKind: worker.agentKind,
			spec,
			model: worker.model,
			name,
			gatewayProfileId: worker.gatewayProfileId,
		});

		// Record the deployment on the worker so its detail page links the machine.
		const next: Worker[] = (config.workers ?? []).map((w) =>
			w.id === id ? { ...w, lastMachineId: created.machineId, updatedAt: new Date().toISOString() } : w,
		);
		await setUserConfig({ workers: next });

		return Response.json({
			ok: true,
			machineId: created.machineId,
			phase: created.phase,
			state: created.state,
			message:
				"Machine provisioned. Run bootstrap from the machine to install the worker's runtime + memory bundle.",
		});
	} catch (err) {
		const message =
			err instanceof MachineProviderError
				? err.message
				: err instanceof Error
					? err.message
					: "deploy failed";
		const status =
			err instanceof MachineProviderError && err.kind === "not_supported" ? 501 : 502;
		console.error(`[workers/deploy] ${worker.agentKind} deploy failed (${status}):`, message);
		return Response.json({ error: "deploy_failed", message }, { status });
	}
}

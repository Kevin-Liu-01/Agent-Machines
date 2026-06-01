/**
 * POST /api/dashboard/admin/provision-machine
 *
 * Creates a fresh machine for the calling user using their saved
 * provider credentials, appends it to their machines list, and marks
 * it as the new active machine.
 *
 * Body (all optional, falls back to wizard-saved drafts on UserConfig):
 *   { providerKind, agentKind, spec, model, name, force }
 *
 * Idempotency note: previously we refused if any machine existed.
 * The new model supports many machines per user, so we always create
 * unless the user passes the *same* (provider, agent, spec) combo
 * within the last 60 seconds (cheap dedupe to absorb double-clicks).
 */

import { randomUUID } from "node:crypto";

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { MachineProviderError } from "@/lib/providers";
import { createMachineForConfig } from "@/lib/dashboard/provision";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	AGENT_KINDS,
	DEFAULT_MACHINE_SPEC,
	PROVIDER_KINDS,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
	providerKind?: ProviderKind;
	agentKind?: AgentKind;
	spec?: MachineSpec;
	model?: string;
	name?: string;
	force?: boolean;
	/** Chosen model router (gateway profile id) for hermes/openclaw. */
	gatewayProfileId?: string;
};

function isProvider(value: unknown): value is ProviderKind {
	return (
		typeof value === "string" &&
		(PROVIDER_KINDS as ReadonlyArray<string>).includes(value)
	);
}

function isAgent(value: unknown): value is AgentKind {
	return (
		typeof value === "string" &&
		(AGENT_KINDS as ReadonlyArray<string>).includes(value)
	);
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

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let body: Body = {};
	try {
		const parsed = await request.json().catch(() => ({}));
		body = (parsed ?? {}) as Body;
	} catch {
		body = {};
	}

	let config: Awaited<ReturnType<typeof getUserConfig>>;
	try {
		config = await getUserConfig();
	} catch (err) {
		const message = err instanceof Error ? err.message : "config read failed";
		return Response.json(
			{ error: "config_read_failed", message },
			{ status: 500 },
		);
	}

	const providerKind: ProviderKind = isProvider(body.providerKind)
		? body.providerKind
		: config.draftProviderKind;
	const agentKind: AgentKind = isAgent(body.agentKind)
		? body.agentKind
		: config.draftAgentKind;
	const spec = asSpec(body.spec, config.draftSpec ?? DEFAULT_MACHINE_SPEC);
	const model =
		typeof body.model === "string" && body.model.trim().length > 0
			? body.model.trim()
			: config.draftModel;
	const name =
		typeof body.name === "string" && body.name.trim().length > 0
			? body.name.trim().slice(0, 80)
			: `${agentKind}-${providerKind}-${new Date()
					.toISOString()
					.slice(0, 10)}`;

	if (!config.providers[providerKind]) {
		return Response.json(
			{
				error: "missing_provider_credentials",
				message: `No ${providerKind} credentials on file. Add them in /dashboard/setup step 1.`,
			},
			{ status: 400 },
		);
	}

	if (!body.force) {
		const recent = config.machines.find(
			(m) =>
				m.providerKind === providerKind &&
				m.agentKind === agentKind &&
				m.spec.vcpu === spec.vcpu &&
				m.spec.memoryMib === spec.memoryMib &&
				m.spec.storageGib === spec.storageGib &&
				Date.now() - new Date(m.createdAt).getTime() < 60_000,
		);
		if (recent) {
			return Response.json({
				ok: true,
				deduped: true,
				machineId: recent.id,
				message: "Returning the machine you just provisioned (same spec, <60s).",
			});
		}
	}

	try {
		const created = await createMachineForConfig(config, {
			providerKind,
			agentKind,
			spec,
			model,
			name,
			gatewayProfileId: body.gatewayProfileId ?? null,
		});
		return Response.json({
			ok: true,
			machineId: created.machineId,
			phase: created.phase,
			state: created.state,
			message:
				"Machine accepted. Run browser bootstrap from the dashboard to install the selected agent runtime, or use the CLI deploy path for the full production bootstrap.",
		});
	} catch (err) {
		const message =
			err instanceof MachineProviderError
				? err.message
				: err instanceof Error
					? err.message
					: "provision failed";
		const status = err instanceof MachineProviderError && err.kind === "not_supported" ? 501 : 502;
		// Surface the real reason in Vercel logs — the client only sees the HTTP
		// status, so an opaque 502 is otherwise undiagnosable in production.
		console.error(
			`[provision-machine] ${providerKind}/${agentKind} provision failed (${status}):`,
			message,
		);
		return Response.json(
			{ error: "provision_failed", message },
			{ status },
		);
	}
}

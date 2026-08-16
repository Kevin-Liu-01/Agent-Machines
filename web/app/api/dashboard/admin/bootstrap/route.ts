/**
 * Compatibility bootstrap endpoint. V2 records repair/reconfigure requests in
 * the same operation journal as launches and runtime switches; the request no
 * longer owns a long provider exec that can disappear with a serverless host.
 */

import { after } from "next/server";

import { validateAgentCredentials } from "@/lib/agents/credentials";
import { submitMachineIntent } from "@/lib/control-plane/adopt-machine";
import { getProvider } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
	machineId?: string;
	force?: boolean;
	background?: boolean;
};

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const body = (await request.json().catch(() => ({}))) as Body;

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
	const machineId = body.machineId ?? config.activeMachineId;
	const machine = config.machines.find(
		(candidate) => candidate.id === machineId && !candidate.archived,
	);
	if (!machine) {
		return Response.json(
			{
				error: "not_found",
				message: "No machine found. Provision one first via /dashboard/setup.",
			},
			{ status: 404 },
		);
	}

	try {
		getProvider(machine.providerKind, config.providers);
	} catch (error) {
		return Response.json(
			{
				error: "missing_credentials",
				message:
					error instanceof Error ? error.message : "Provider credentials missing.",
			},
			{ status: 400 },
		);
	}
	const credentialState = validateAgentCredentials(machine.agentKind, config);
	if (!credentialState.ok) {
		return Response.json(
			{
				error: "missing_agent_credentials",
				message: credentialState.message,
			},
			{ status: 400 },
		);
	}

	try {
		const submitted = await submitMachineIntent(userId, machine.id, {
			desiredState: "running",
			forceBootstrap: body.force === true,
			idempotencyKey:
				request.headers?.get?.("idempotency-key") ??
				(body.force ? `bootstrap:${machine.id}:${crypto.randomUUID()}` : undefined),
		});
		after(async () => {
			await submitted.controlPlane.reconcileNext(submitted.accepted.worker.id);
		});
		return Response.json(
			{
				ok: true,
				machineId: machine.id,
				background: true,
				operation: submitted.accepted.operation,
				statusUrl: `/api/dashboard/control-plane/operations/${submitted.accepted.operation.id}`,
			},
			{ status: 202 },
		);
	} catch (error) {
		return Response.json(
			{
				ok: false,
				error: "bootstrap_submit_failed",
				message: error instanceof Error ? error.message : "bootstrap submit failed",
			},
			{ status: 502 },
		);
	}
}

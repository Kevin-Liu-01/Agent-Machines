/**
 * POST /api/dashboard/admin/bootstrap
 *
 * Browser-driven agent bootstrap. This route runs the selected machine
 * through the same named phases the onboarding UI already displays and
 * persists `bootstrapState` after every phase so dashboards can stream
 * meaningful progress while the provider execs long-running commands.
 */

import { getProvider } from "@/lib/providers";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { runWebBootstrap } from "@/lib/bootstrap/runner";
import { scheduleWebBootstrap } from "@/lib/bootstrap/schedule-bootstrap";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { INITIAL_BOOTSTRAP_STATE, type MachineRef } from "@/lib/user-config/schema";
import crypto from "node:crypto";
import { after } from "next/server";

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
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as Body;

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
	const machine = resolveMachine(config.machines, body.machineId ?? config.activeMachineId);
	if (!machine) {
		return Response.json(
			{ error: "not_found", message: "No machine found. Provision one first via /dashboard/setup." },
			{ status: 404 },
		);
	}

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

	const credCheck = validateAgentCredentials(machine.agentKind, config);
	if (!credCheck.ok) {
		return Response.json(
			{ error: "missing_agent_credentials", message: credCheck.message },
			{ status: 400 },
		);
	}

	if (body.background === true && body.force !== true) {
		if (machine.bootstrapState.phase === "running") {
			return Response.json({
				ok: true,
				machineId: machine.id,
				background: true,
				alreadyRunning: true,
			});
		}
		if (machine.bootstrapState.phase === "succeeded") {
			return Response.json({
				ok: true,
				machineId: machine.id,
				background: true,
				alreadySucceeded: true,
			});
		}
	}

	await setUserConfig({
		patchMachine: {
			id: machine.id,
			patch: {
				...(machine.apiKey || (machine.bootstrapState.completed ?? []).includes("configure-hermes")
					? {}
					: { apiKey: crypto.randomUUID() }),
				bootstrapState: {
					...machine.bootstrapState,
					phase: "running",
					current: null,
					finishedAt: null,
					lastError: null,
					startedAt: machine.bootstrapState.startedAt ?? new Date().toISOString(),
				},
			},
		},
	});

	const latestConfig = await getUserConfig();
	const machineForBootstrap =
		latestConfig.machines.find((m) => m.id === machine.id) ?? machine;

	if (body.background === true) {
		after(() => scheduleWebBootstrap(machineForBootstrap, provider, latestConfig, {
			force: body.force === true,
		}));
		return Response.json({
			ok: true,
			machineId: machine.id,
			background: true,
		});
	}

	try {
		const result = await runWebBootstrap({
			machine: machineForBootstrap,
			provider,
			config,
			force: body.force === true,
			onState: async (bootstrapState) => {
				await setUserConfig({
					patchMachine: { id: machine.id, patch: { bootstrapState } },
				});
			},
		});
		await setUserConfig({
			patchMachine: {
				id: machine.id,
				patch: {
					apiUrl: result.apiUrl,
					apiKey: result.apiKey,
				},
			},
		});
		return Response.json({ ok: true, machineId: machine.id });
	} catch (err) {
		const message = err instanceof Error ? err.message : "bootstrap failed";
		const latest = await getUserConfig().catch(() => null);
		const latestMachine = latest?.machines.find((m) => m.id === machine.id) ?? machine;
		await setUserConfig({
			patchMachine: {
				id: machine.id,
				patch: {
					bootstrapState: {
						...latestMachine.bootstrapState,
						phase: "failed",
						current: null,
						finishedAt: new Date().toISOString(),
						lastError: message,
					},
				},
			},
		}).catch(() => {});
		return Response.json(
			{ ok: false, error: "bootstrap_failed", message },
			{ status: 502 },
		);
	}
}

function resolveMachine(
	machines: MachineRef[],
	machineId: string | null,
): MachineRef | null {
	if (!machineId) return null;
	return machines.find((m) => m.id === machineId) ?? null;
}

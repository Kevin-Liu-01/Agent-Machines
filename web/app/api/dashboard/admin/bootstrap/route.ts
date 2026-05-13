/**
 * POST /api/dashboard/admin/bootstrap
 *
 * Browser-driven agent bootstrap. This route runs the selected machine
 * through the same named phases the onboarding UI already displays and
 * persists `bootstrapState` after every phase so dashboards can stream
 * meaningful progress while the provider execs long-running commands.
 */

import { getProvider } from "@/lib/providers";
import { runWebBootstrap } from "@/lib/bootstrap/runner";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { INITIAL_BOOTSTRAP_STATE, type MachineRef } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
	machineId?: string;
};

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as Body;
	const config = await getUserConfig();
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

	await setUserConfig({
		patchMachine: {
			id: machine.id,
			patch: { bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "running" } },
		},
	});

	try {
		const result = await runWebBootstrap({
			machine,
			provider,
			config,
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
		await setUserConfig({
			patchMachine: {
				id: machine.id,
				patch: {
					bootstrapState: {
						...INITIAL_BOOTSTRAP_STATE,
						phase: "failed",
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

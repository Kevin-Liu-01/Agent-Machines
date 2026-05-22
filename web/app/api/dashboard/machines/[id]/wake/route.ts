/**
 * POST /api/dashboard/machines/[id]/wake
 *
 * Per-machine wake -- works for any machine in the user's fleet, not
 * just the currently active one. Lets the fleet UIs (FleetMonitor,
 * MachineSwitcher dropdown, MachinesPanel) trigger transitions on
 * sidelined machines without first switching active.
 *
 * Idempotent: the underlying provider returns the current summary
 * unchanged if the machine is already running / mid-wake. The
 * Dedalus path actually submits a no-op execution because the
 * controlplane's /wake endpoint is HMAC-gated; see
 * `lib/providers/dedalus.ts` for the rationale.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { ensureGatewayRunning } from "@/lib/bootstrap/gateway-lifecycle";
import { getProvider, MachineProviderError } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const { id } = await ctx.params;

	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === id);
	if (!machine) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}

	try {
		const provider = getProvider(machine.providerKind, config.providers);
		const summary = await provider.wake(machine.id);
		if (
			summary.state === "ready" &&
			machine.bootstrapState.phase === "succeeded" &&
			machine.agentKind !== "claude-code" &&
			machine.agentKind !== "codex"
		) {
			await ensureGatewayRunning(machine, provider).catch((err) => {
				console.warn(
					`[wake] gateway restart skipped for ${machine.id}:`,
					err instanceof Error ? err.message : err,
				);
			});
		}
		return Response.json(
			{ ok: true, summary },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "wake failed";
		const kind = err instanceof MachineProviderError ? err.kind : "fatal";
		const status = kind === "transient" ? 502 : kind === "rate_limited" ? 429 : 400;
		return Response.json(
			{ ok: false, error: "wake_failed", message },
			{ status },
		);
	}
}

/**
 * GET /api/dashboard/machines
 *
 * Returns the user's full machine list with live state per machine
 * (where the provider is reachable). Dedalus machines are polled via
 * the Dedalus REST API; Vercel Sandbox / Fly machines are returned
 * with their stored state (those providers are PR4 stubs and we don't
 * yet have a reliable state probe for them).
 *
 * The dashboard's machines page polls this endpoint every 5s. Cheap
 * because we batch all live calls in parallel.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import {
	MachineProviderError,
	getProvider,
} from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	PROVIDER_LABEL,
	type MachineRef,
	type ProviderKind,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LiveMachine = Omit<MachineRef, "apiKey"> & {
	hasApiKey: boolean;
	providerLabel: string;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const config = await getUserConfig();
	if (config.machines.length === 0) {
		return Response.json({ ok: true, machines: [], activeMachineId: null });
	}

	const live = await Promise.all(
		config.machines.map(async (m) => probe(m, config.providers)),
	);
	return Response.json({
		ok: true,
		activeMachineId: config.activeMachineId,
		machines: live,
	});
}

async function probe(
	machine: MachineRef,
	credentials: import("@/lib/user-config/schema").ProviderCredentials,
): Promise<LiveMachine> {
	const base: Omit<LiveMachine, "live"> = {
		id: machine.id,
		providerKind: machine.providerKind,
		providerLabel: PROVIDER_LABEL[machine.providerKind],
		agentKind: machine.agentKind,
		name: machine.name,
		spec: machine.spec,
		model: machine.model,
		createdAt: machine.createdAt,
		apiUrl: machine.apiUrl,
		bootstrapState: machine.bootstrapState,
		archived: machine.archived,
		hasApiKey: Boolean(machine.apiKey),
	};
	try {
		const provider = getProvider(machine.providerKind as ProviderKind, credentials);
		const summary = await provider.state(machine.id);
		return {
			...base,
			live: {
				ok: true,
				state: summary.state,
				rawPhase: summary.rawPhase,
				lastError: summary.lastError,
			},
		};
	} catch (err) {
		const reason =
			err instanceof MachineProviderError ? err.message : err instanceof Error ? err.message : "probe failed";
		return {
			...base,
			live: { ok: false, reason },
		};
	}
}

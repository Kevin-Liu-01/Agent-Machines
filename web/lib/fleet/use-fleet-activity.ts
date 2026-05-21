"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { LogLine } from "@/lib/dashboard/types";
import { fetchLogTail, headlineFromLogs, isFleetLogsLoaded, shouldFetchFleetLogs } from "@/lib/fleet/fetch-log-tail";
import { toFleetStreamCard, type FleetStreamCardModel } from "@/lib/fleet/view-model";
import type { AgentKind, MachineSpec, ProviderKind } from "@/lib/user-config/schema";

const FLEET_POLL_MS = 6000;

type LiveMachine = {
	id: string;
	name: string;
	providerKind: ProviderKind;
	agentKind: AgentKind;
	spec: MachineSpec;
	model: string;
	createdAt: string;
	archived?: boolean;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

type MachinesPayload = {
	ok: boolean;
	machines: LiveMachine[];
	activeMachineId: string | null;
};

export type FleetActivityState = {
	loading: boolean;
	error: string | null;
	cards: FleetStreamCardModel[];
	activeMachineId: string | null;
	machineCount: number;
};

/** Standalone fleet activity hook — MachinesPanel inlines the same polling. */
export function useFleetActivity(): FleetActivityState & { refresh: () => Promise<void> } {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [machines, setMachines] = useState<LiveMachine[]>([]);
	const [activeMachineId, setActiveMachineId] = useState<string | null>(null);
	const [logsById, setLogsById] = useState<Record<string, LogLine[]>>({});
	const [logsFetched, setLogsFetched] = useState<Record<string, boolean>>({});

	const refresh = useCallback(async () => {
		try {
			const res = await fetch("/api/dashboard/machines", { cache: "no-store" });
			if (!res.ok) {
				setError(`HTTP ${res.status}`);
				return;
			}
			const body = (await res.json()) as MachinesPayload;
			const visible = body.machines.filter((m) => !m.archived);
			setMachines(visible);
			setActiveMachineId(body.activeMachineId);
			setError(null);

			setLogsFetched((prev) => ({
				...prev,
				...Object.fromEntries(
					body.machines
						.filter((m) => !shouldFetchFleetLogs(m))
						.map((m) => [m.id, true]),
				),
			}));

			const ready = body.machines.filter(shouldFetchFleetLogs);
			const pairs = await Promise.all(
				ready.map(async (m) => [m.id, await fetchLogTail(m.id)] as const),
			);
			setLogsById(Object.fromEntries(pairs));
			setLogsFetched((prev) => ({
				...prev,
				...Object.fromEntries(ready.map((m) => [m.id, true])),
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : "fetch failed");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, FLEET_POLL_MS);
		return () => window.clearInterval(id);
	}, [refresh]);

	const cards = useMemo(
		() =>
			machines.map((machine) => {
				const logs = logsById[machine.id] ?? [];
				return toFleetStreamCard(machine, logs, {
					active: machine.id === activeMachineId,
					headline: headlineFromLogs(logs),
					logsLoaded: isFleetLogsLoaded(machine, logsFetched),
				});
			}),
		[machines, logsById, logsFetched, activeMachineId],
	);

	return {
		loading,
		error,
		cards,
		activeMachineId,
		machineCount: machines.length,
		refresh,
	};
}

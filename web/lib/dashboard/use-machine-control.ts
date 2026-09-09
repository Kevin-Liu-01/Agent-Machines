"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MachineSummary } from "@/lib/dashboard/types";
import { withMachineId } from "@/lib/dashboard/api-url";

const POLL_RUNNING_MS = 5000;
const POLL_TRANSITION_MS = 2000;
const TRANSIENT_PHASES = new Set([
	"wake_pending",
	"sleep_pending",
	"placement_pending",
	"accepted",
	"starting",
]);

export type ControlState = {
	machine: MachineSummary | null;
	error: string | null;
	pending: "wake" | "sleep" | null;
	notProvisioned: boolean;
};

/**
 * Single hook that owns machine state for the dashboard. Fetches the
 * machine summary without waking compute, exposes explicit
 * `wake()` / `sleep()` actions, and switches
 * polling cadence based on the current phase (5s when steady, 2s
 * during a transition so the pill ticks visibly).
 *
 * Viewing another page must never undo the operator's Pause action.
 */
export function useMachineControl(
	activeMachineId?: string | null,
): ControlState & {
	wake: () => Promise<void>;
	sleep: () => Promise<void>;
} {
	const [state, setState] = useState<ControlState>({
		machine: null,
		error: null,
		pending: null,
		notProvisioned: false,
	});
	const stateRef = useRef(state);
	stateRef.current = state;
	const stoppedRef = useRef(false);
	const generationRef = useRef(0);

	const fetchSummary = useCallback(async (signal: AbortSignal): Promise<MachineSummary | null> => {
		const response = await fetch(withMachineId("/api/dashboard/machine", activeMachineId), {
			cache: "no-store",
			signal,
		});
		const body = await response.json();
		if (signal.aborted) return null;
		if (response.status === 404) {
			stoppedRef.current = true;
			setState((prev) => ({ ...prev, error: "not_provisioned", machine: null, pending: null, notProvisioned: true }));
			return null;
		}
		if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
		return body as MachineSummary;
	}, [activeMachineId]);

	const submitTransition = useCallback(
		async (kind: "wake" | "sleep") => {
			const generation = generationRef.current;
			setState((prev) => ({ ...prev, pending: kind, error: null }));
			try {
				const endpoint = activeMachineId
					? `/api/dashboard/machines/${encodeURIComponent(activeMachineId)}/${kind}`
					: `/api/dashboard/machine/${kind}`;
				const response = await fetch(endpoint, {
					method: "POST",
					cache: "no-store",
				});
				if (!response.ok) {
					const body = await response.json().catch(() => ({}));
					throw new Error(body.message ?? `HTTP ${response.status}`);
				}
				const body = (await response.json()) as
					| MachineSummary
					| { summary: MachineSummary };
				const summary = "summary" in body ? body.summary : body;
				if (!stoppedRef.current && generationRef.current === generation) {
					setState((prev) => ({ ...prev, machine: summary, pending: settledTransition(prev.pending, summary.phase) }));
				}
			} catch (err) {
				if (!stoppedRef.current && generationRef.current === generation) {
					setState((prev) => ({
						...prev,
						error: err instanceof Error ? err.message : `${kind} failed`,
						pending: null,
					}));
				}
			}
		},
		[activeMachineId],
	);

	const wake = useCallback(() => submitTransition("wake"), [submitTransition]);
	const sleep = useCallback(() => submitTransition("sleep"), [submitTransition]);

	useEffect(() => {
		const generation = ++generationRef.current;
		const controller = new AbortController();
		const current = () => !controller.signal.aborted && generationRef.current === generation;
		stoppedRef.current = false;
		setState({
			machine: null,
			error: null,
			pending: null,
			notProvisioned: false,
		});
		let timer: number | null = null;

		const tick = async () => {
			if (stoppedRef.current || !current()) return;
			const summary = await fetchSummary(controller.signal).catch((error) => {
				if (current()) setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : "Machine status unavailable." }));
				return null;
			});
			if (stoppedRef.current || !current()) return;
			setState((prev) => {
				const next: ControlState = { ...prev, machine: summary ?? prev.machine, ...(summary ? { error: null } : {}) };
				const phase = summary?.phase;
				if (phase) next.pending = settledTransition(prev.pending, phase);

				return next;
			});

			const phase = stateRef.current.machine?.phase;
			const transient =
				stateRef.current.pending !== null ||
				(phase !== undefined && TRANSIENT_PHASES.has(phase));
			const interval = transient ? POLL_TRANSITION_MS : POLL_RUNNING_MS;

			if (!stoppedRef.current && current()) {
				timer = window.setTimeout(tick, interval);
			}
		};

		void tick();

		return () => {
			controller.abort();
			stoppedRef.current = true;
			if (timer !== null) window.clearTimeout(timer);
		};
		// Refetch when the active machine changes (demo switcher / router.refresh).
	}, [activeMachineId, fetchSummary, wake]);

	return { ...state, wake, sleep };
}

function settledTransition(pending: ControlState["pending"], phase: string): ControlState["pending"] {
	if (["destroyed", "destroying", "failed", "unknown"].includes(phase)) return null;
	if ((pending === "wake" && phase === "running") || (pending === "sleep" && phase === "sleeping")) return null;
	return pending;
}

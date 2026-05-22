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
	autoWokeOnce: boolean;
	notProvisioned: boolean;
};

/**
 * Single hook that owns machine state for the dashboard. Fetches the
 * machine summary, auto-wakes a sleeping machine on first authenticated
 * load, exposes manual `wake()` / `sleep()` actions, and switches
 * polling cadence based on the current phase (5s when steady, 2s
 * during a transition so the pill ticks visibly).
 *
 * Auto-wake fires at most once per page load. If the user explicitly
 * clicks Sleep we don't auto-wake again -- otherwise the dashboard
 * would fight the user's intent every poll.
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
		autoWokeOnce: false,
		notProvisioned: false,
	});
	const stateRef = useRef(state);
	stateRef.current = state;
	const userSleptRef = useRef(false);
	const stoppedRef = useRef(false);

	const fetchSummary = useCallback(async (): Promise<MachineSummary | null> => {
		const response = await fetch(withMachineId("/api/dashboard/machine", activeMachineId), {
			cache: "no-store",
		});
		if (response.status === 404) {
			stoppedRef.current = true;
			setState((prev) => ({ ...prev, error: "not_provisioned", machine: null, pending: null, notProvisioned: true }));
			return null;
		}
		if (!response.ok) return null;
		return (await response.json()) as MachineSummary;
	}, [activeMachineId]);

	const submitTransition = useCallback(
		async (kind: "wake" | "sleep") => {
			if (kind === "sleep") userSleptRef.current = true;
			else userSleptRef.current = false;
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
				if (!stoppedRef.current) {
					setState((prev) => ({ ...prev, machine: summary }));
				}
			} catch (err) {
				if (!stoppedRef.current) {
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
		stoppedRef.current = false;
		setState({
			machine: null,
			error: null,
			pending: null,
			autoWokeOnce: false,
			notProvisioned: false,
		});
		let timer: number | null = null;

		const tick = async () => {
			if (stoppedRef.current) return;
			const summary = await fetchSummary().catch(() => null);
			if (stoppedRef.current) return;

			let shouldAutoWake = false;
			setState((prev) => {
				const next: ControlState = { ...prev, machine: summary };
				const phase = summary?.phase;

				if (
					!prev.autoWokeOnce &&
					!userSleptRef.current &&
					phase === "sleeping"
				) {
					next.autoWokeOnce = true;
					next.pending = "wake";
					shouldAutoWake = true;
				}

				if (
					(prev.pending === "wake" && phase === "running") ||
					(prev.pending === "sleep" && phase === "sleeping")
				) {
					next.pending = null;
				}

				return next;
			});

			if (shouldAutoWake) void wake();

			const phase = stateRef.current.machine?.phase;
			const transient =
				stateRef.current.pending !== null ||
				(phase !== undefined && TRANSIENT_PHASES.has(phase));
			const interval = transient ? POLL_TRANSITION_MS : POLL_RUNNING_MS;

			if (!stoppedRef.current) {
				timer = window.setTimeout(tick, interval);
			}
		};

		void tick();

		return () => {
			stoppedRef.current = true;
			if (timer !== null) window.clearTimeout(timer);
		};
		// Refetch when the active machine changes (demo switcher / router.refresh).
	}, [activeMachineId, fetchSummary, wake]);

	return { ...state, wake, sleep };
}

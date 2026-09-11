"use client";

import { useEffect, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import type { LiveDataEnvelope } from "@/lib/dashboard/types";

type Props<T> = {
	endpoint: string;
	pollMs?: number;
	render: (data: T, fetchedAt: string) => ReactNode;
	offlineHint?: ReactNode;
	loadingLabel?: string;
};

/**
 * Generic client wrapper for any `/api/dashboard/*` route that returns a
 * LiveDataEnvelope<T>. Handles loading, polling, offline, and error
 * states uniformly across the three PR2 pages.
 */
export function LiveDataView<T>({
	endpoint,
	pollMs = 30_000,
	render,
	offlineHint,
	loadingLabel = "Loading workspace data…",
}: Props<T>) {
	const [envelope, setEnvelope] = useState<LiveDataEnvelope<T> | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [retry, setRetry] = useState(0);

	useEffect(() => {
		let stopped = false;
		let pending = false;
		const controller = new AbortController();
		setEnvelope(null);
		setError(null);

		async function tick() {
			if (pending || stopped) return;
			pending = true;
			try {
				const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					const detail = body?.message ?? body?.error;
					if (!stopped) setError(typeof detail === "string" && /\s/.test(detail) ? detail : "Workspace data couldn’t be loaded. Try again.");
					return;
				}
				const body = (await response.json()) as LiveDataEnvelope<T>;
				if (!body || typeof body.ok !== "boolean" || (body.ok ? !("data" in body) : typeof body.reason !== "string")) throw new Error("The response was incomplete. Please try again.");
				if (!stopped) {
					setEnvelope(body);
					setError(null);
				}
			} catch {
				if (!stopped) {
					setError("Workspace data couldn’t be loaded. Check your connection and try again.");
				}
			} finally {
				pending = false;
			}
		}

		tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") tick();
		}, pollMs);
		return () => {
			stopped = true;
			controller.abort();
			window.clearInterval(interval);
		};
	}, [endpoint, pollMs, retry]);

	if (error) {
		return (
			<EmptyState
				title="Could not load workspace data"
				description={error}
				onRetry={() => setRetry(value => value + 1)}
			/>
		);
	}

	if (!envelope) {
		return (
			<DashboardLoadingState label={loadingLabel} variant="table" className="px-[var(--dashboard-gutter,20px)] py-6" />
		);
	}

	if (!envelope.ok) {
		const titles: Record<string, string> = {
			machine_offline: "Machine is asleep",
			config_missing: "Dashboard not configured",
			exec_failed: "Couldn't read the machine",
		};
		const machineId = new URLSearchParams(endpoint.split("?")[1] ?? "").get("machineId");
		return (
			<EmptyState
				title={titles[envelope.reason] ?? "Unavailable"}
				description={envelope.message}
				hint={offlineHint}
				onRetry={envelope.reason === "config_missing" ? undefined : () => setRetry(value => value + 1)}
				action={
					envelope.reason === "config_missing"
						? { label: "Open Quickstart", href: "/dashboard/setup" }
						: { label: machineId ? "Manage this machine" : "Manage machines", href: machineId ? `/dashboard/machines/${encodeURIComponent(machineId)}` : "/dashboard/machines" }
				}
			/>
		);
	}

	return <>{render(envelope.data, envelope.fetchedAt)}</>;
}

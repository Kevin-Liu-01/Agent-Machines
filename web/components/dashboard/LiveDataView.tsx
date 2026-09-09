"use client";

import { useEffect, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LiveDataEnvelope } from "@/lib/dashboard/types";

type Props<T> = {
	endpoint: string;
	pollMs?: number;
	render: (data: T, fetchedAt: string) => ReactNode;
	offlineHint?: ReactNode;
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
}: Props<T>) {
	const [envelope, setEnvelope] = useState<LiveDataEnvelope<T> | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let stopped = false;

		async function tick() {
			try {
				const response = await fetch(endpoint, { cache: "no-store" });
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					if (!stopped) setError(body?.message || body?.error || `HTTP ${response.status}`);
					return;
				}
				const body = (await response.json()) as LiveDataEnvelope<T>;
				if (!stopped) {
					setEnvelope(body);
					setError(null);
				}
			} catch (err) {
				if (!stopped) {
					setError(err instanceof Error ? err.message : "fetch_failed");
				}
			}
		}

		tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") tick();
		}, pollMs);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, [endpoint, pollMs]);

	if (error) {
		return (
			<EmptyState
				title="Couldn't reach the dashboard API"
				description={error}
			/>
		);
	}

	if (!envelope) {
		return (
			<div className="space-y-3 px-6 py-6">
				<BrailleSpinner
					name="orbit"
					label={`fetching ${endpoint.split("/").pop() ?? "data"}`}
					className="text-[12px] text-[var(--ret-text-muted)]"
				/>
				<div className="space-y-2">
					<Skeleton className="h-3 w-1/3" />
					<Skeleton className="h-3 w-2/3" />
					<Skeleton className="h-3 w-1/2" />
					<Skeleton className="h-3 w-3/5" />
				</div>
			</div>
		);
	}

	if (!envelope.ok) {
		const titles: Record<string, string> = {
			machine_offline: "Machine is asleep",
			config_missing: "Dashboard not configured",
			exec_failed: "Couldn't read the machine",
		};
		return (
			<EmptyState
				title={titles[envelope.reason] ?? "Unavailable"}
				description={envelope.message}
				hint={offlineHint}
				action={
					envelope.reason === "machine_offline"
						? { label: "View overview", href: "/dashboard" }
						: undefined
				}
			/>
		);
	}

	return <>{render(envelope.data, envelope.fetchedAt)}</>;
}

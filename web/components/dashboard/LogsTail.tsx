"use client";

import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { cn } from "@/lib/cn";
import { formatAge, formatBytes } from "@/lib/dashboard/format";
import type { LiveDataEnvelope, LogLine, LogsPayload } from "@/lib/dashboard/types";

const POLL_MS = 7000;
const LEVEL_COLOR: Record<LogLine["level"], string> = {
	error: "text-[var(--ret-red)]",
	warn: "text-[var(--ret-amber)]",
	info: "text-[var(--ret-text)]",
	debug: "text-[var(--ret-text-muted)]",
	other: "text-[var(--ret-text-dim)]",
};

/**
 * Polled tail of `~/.agent-machines/logs/*.log`. Auto-scrolls to bottom when
 * follow-mode is on; users can pause it to scroll back through history.
 * SSE streaming is reserved for PR2.5 -- this version is good enough to
 * watch live agent activity without burning agent-machines' Vercel
 * function budget.
 */
export function LogsTail() {
	const machineCtx = useOptionalMachineContext();
	const [envelope, setEnvelope] = useState<LiveDataEnvelope<LogsPayload> | null>(null);
	const [follow, setFollow] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [retry, setRetry] = useState(0);
	const tailRef = useRef<HTMLDivElement>(null);

	const machineId = machineCtx?.machineId;

	useEffect(() => {
		let stopped = false;
		let pending = false;
		const controller = new AbortController();
		setEnvelope(null);
		setError(null);
		const params = new URLSearchParams({ n: "200" });
		if (machineId) params.set("machineId", machineId);

		async function tick() {
			if (pending || stopped) return;
			pending = true;
			try {
				const response = await fetch(`/api/dashboard/logs?${params.toString()}`, {
					cache: "no-store",
					signal: controller.signal,
				});
				if (!response.ok) {
					const body = await response.json().catch(() => null);
					const detail = body?.message ?? body?.error;
					if (!stopped) setError(typeof detail === "string" && /\s/.test(detail) ? detail : "Logs couldn’t be loaded. Try again.");
					return;
				}
				const body = (await response.json()) as LiveDataEnvelope<LogsPayload>;
				if (!body || typeof body.ok !== "boolean" || (body.ok ? !body.data || !Array.isArray(body.data.lines) || !Array.isArray(body.data.files) : typeof body.reason !== "string")) throw new Error("The log response was incomplete. Please try again.");
				if (!stopped) {
					setEnvelope(body);
					setError(null);
				}
			} catch {
				if (!stopped) setError("Logs couldn’t be loaded. Check your connection and try again.");
			} finally {
				pending = false;
			}
		}

		tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") tick();
		}, POLL_MS);
		return () => {
			stopped = true;
			controller.abort();
			window.clearInterval(interval);
		};
	}, [machineId, retry]);

	useEffect(() => {
		if (!follow) return;
		const node = tailRef.current;
		if (!node) return;
		node.scrollTo({ top: node.scrollHeight });
	}, [envelope, follow]);

	if (error) {
		return (
			<EmptyState
				title="Could not load logs"
				description={error}
				onRetry={() => setRetry(value => value + 1)}
			/>
		);
	}

	if (!envelope) {
		return (
			<DashboardLoadingState label="Loading logs…" variant="table" className="px-[var(--dashboard-gutter,20px)] py-6" />
		);
	}

	if (!envelope.ok) {
		const titles: Record<string, string> = {
			machine_offline: "Machine is asleep",
			config_missing: "Dashboard not configured",
			exec_failed: "Couldn't read the log files",
		};
		return (
			<EmptyState
				title={titles[envelope.reason] ?? "Unavailable"}
				description={envelope.message}
				hint="# tail expected at\n~/.agent-machines/logs/*.log"
				onRetry={envelope.reason === "config_missing" ? undefined : () => setRetry(value => value + 1)}
				action={
					envelope.reason === "config_missing"
						? { label: "Open Quickstart", href: "/dashboard/setup" }
						: { label: machineId ? "Manage this machine" : "Manage machines", href: machineId ? `/dashboard/machines/${encodeURIComponent(machineId)}` : "/dashboard/machines" }
				}
			/>
		);
	}

	const { lines, files, tailLines, status, message } = envelope.data;

	return (
		<div className="flex flex-col gap-5 px-[var(--dashboard-gutter,20px)] py-8">
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
				<div className="font-mono text-[13px] text-[var(--ret-text-dim)]">
					<span className="text-[var(--ret-text-muted)]">files</span>{" "}
					{files.length}
					<span className="ml-3 text-[var(--ret-text-muted)]">tail</span>{" "}
					{tailLines}
					<span className="ml-3 text-[var(--ret-text-muted)]">lines</span>{" "}
					{lines.length}
					<span className="ml-3 text-[var(--ret-text-muted)]">status</span>{" "}
					<span
						className={cn(
							status === "degraded"
								? "text-[var(--ret-amber)]"
								: "text-[var(--ret-green)]",
						)}
					>
						{status ?? "live"}
					</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<span className="text-xs font-medium text-[var(--ret-text-muted)]">
						refreshed {formatAge(envelope.fetchedAt)}
					</span>
					<ReticleButton
						aria-pressed={follow}
						aria-label="Follow new log lines"
						variant={follow ? "primary" : "ghost"}
						size="sm"
						onClick={() => setFollow((value) => !value)}
					>
						{follow ? "Following" : "Paused"}
					</ReticleButton>
				</div>
			</div>

			{status === "degraded" && message ? (
				<div className="border border-[var(--ret-amber)]/30 bg-[var(--ret-amber)]/5 px-4 py-2 font-mono text-xs text-[var(--ret-amber)]">
					{message}
				</div>
			) : null}

			<div
				ref={tailRef}
				className="max-h-[68dvh] overflow-y-auto border border-[var(--ret-border)] bg-[var(--ret-bg)] font-mono text-sm leading-relaxed"
			>
				{lines.length === 0 ? (
				<div className="px-5 py-6 font-sans text-[var(--ret-text-muted)]">
					<p>{status === "degraded" ? "No readable log lines were returned." : "No log lines yet."}</p>
					<ReticleButton as="a" href={machineId ? `/dashboard/machines/${encodeURIComponent(machineId)}/console` : "/dashboard/console"} variant="secondary" className="mt-3">Open agent console</ReticleButton>
				</div>
				) : (
					<table className="w-full border-collapse">
						<tbody>
							{lines.map((line, idx) => (
								<tr
									key={`${idx}:${line.at ?? ""}:${line.message.slice(0, 16)}`}
									className="border-b border-[var(--ret-border)] last:border-b-0 hover:bg-[var(--ret-surface)]"
								>
									<td className="w-[170px] px-3 py-1.5 align-top text-xs text-[var(--ret-text-muted)]">
										{line.at ?? ""}
									</td>
									<td
										className={cn(
											"w-[60px] px-2 py-1.5 align-top uppercase tracking-[0.18em]",
											LEVEL_COLOR[line.level],
										)}
									>
										{line.level === "other" ? "" : line.level}
									</td>
									<td className="break-all px-3 py-1.5 align-top text-[var(--ret-text-dim)]">
										{line.message}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{files.length > 0 ? (
				<div className="font-mono text-[13px] text-[var(--ret-text-muted)]">
					<span>files: </span>
					{files.map((file, idx) => (
						<span key={file.path}>
							{idx > 0 ? "." : null}
							<span className="text-[var(--ret-text-dim)]">{file.path}</span>{" "}
							<span>({formatBytes(file.bytes)})</span>
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

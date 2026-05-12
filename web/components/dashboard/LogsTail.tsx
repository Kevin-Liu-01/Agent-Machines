"use client";

import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/dashboard/EmptyState";
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
	const [envelope, setEnvelope] = useState<LiveDataEnvelope<LogsPayload> | null>(null);
	const [follow, setFollow] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const tailRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let stopped = false;

		async function tick() {
			try {
				const response = await fetch("/api/dashboard/logs?n=200", {
					cache: "no-store",
				});
				if (!response.ok) {
					if (!stopped) setError(`HTTP ${response.status}`);
					return;
				}
				const body = (await response.json()) as LiveDataEnvelope<LogsPayload>;
				if (!stopped) {
					setEnvelope(body);
					setError(null);
				}
			} catch (err) {
				if (!stopped) setError(err instanceof Error ? err.message : "fetch_failed");
			}
		}

		tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") tick();
		}, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, []);

	useEffect(() => {
		if (!follow) return;
		const node = tailRef.current;
		if (!node) return;
		node.scrollTo({ top: node.scrollHeight });
	}, [envelope, follow]);

	if (error) {
		return (
			<EmptyState
				title="Couldn't reach the logs API"
				description={`The browser request to /api/dashboard/logs failed. ${error}.`}
			/>
		);
	}

	if (!envelope) {
		return (
			<div className="px-6 py-10 font-mono text-[12px] text-[var(--ret-text-muted)]">
				Loading logs...
			</div>
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
				action={
					envelope.reason === "machine_offline"
						? { label: "View overview", href: "/dashboard" }
						: undefined
				}
			/>
		);
	}

	const { lines, files, tailLines } = envelope.data;

	return (
		<div className="flex flex-col gap-4 px-6 py-6">
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
				<div className="font-mono text-[11px] text-[var(--ret-text-dim)]">
					<span className="text-[var(--ret-text-muted)]">files</span>{" "}
					{files.length}
					<span className="ml-3 text-[var(--ret-text-muted)]">tail</span>{" "}
					{tailLines}
					<span className="ml-3 text-[var(--ret-text-muted)]">lines</span>{" "}
					{lines.length}
				</div>
				<div className="ml-auto flex items-center gap-2">
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						refreshed {formatAge(envelope.fetchedAt)}
					</span>
					<ReticleButton
						variant={follow ? "primary" : "ghost"}
						size="sm"
						onClick={() => setFollow((value) => !value)}
					>
						{follow ? "Following" : "Paused"}
					</ReticleButton>
				</div>
			</div>

			<div
				ref={tailRef}
				className="max-h-[68vh] overflow-y-auto border border-[var(--ret-border)] bg-[var(--ret-bg)] font-mono text-[12px] leading-relaxed"
			>
				{lines.length === 0 ? (
					<div className="px-5 py-6 text-[var(--ret-text-muted)]">
						No log lines yet. Send a message in chat and they'll show up here.
					</div>
				) : (
					<table className="w-full border-collapse">
						<tbody>
							{lines.map((line, idx) => (
								<tr
									key={`${idx}:${line.at ?? ""}:${line.message.slice(0, 16)}`}
									className="border-b border-[var(--ret-border)] last:border-b-0 hover:bg-[var(--ret-surface)]"
								>
									<td className="w-[170px] px-3 py-1.5 align-top text-[10px] text-[var(--ret-text-muted)]">
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
				<div className="font-mono text-[11px] text-[var(--ret-text-muted)]">
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

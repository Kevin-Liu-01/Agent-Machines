"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type { LiveDataEnvelope, LogsPayload, MachineSummary } from "@/lib/dashboard/types";

/**
 * Live transcript of a machine boot.
 *
 * Polls /api/dashboard/machine for phase + reason fields and appends
 * a new line every time something actually changes (phase flip,
 * reason text change, last_progress_at advances). Once the machine
 * is `running` and we have a machine id, we additionally poll
 * /api/dashboard/logs and merge those lines in so the transcript
 * keeps rolling with real bootstrap output (apt installs, uv install,
 * agent install) once it's available.
 *
 * Designed to live below the `BootStep` checklist on onboarding AND
 * inside the dashboard's wake banner. Same component, same accumulator
 * logic, no duplication.
 */

const POLL_MS = 3500;
const LOGS_POLL_MS = 4000;
const SCROLLBACK_MAX = 200;

type Entry = {
	id: string;
	at: string;
	source: "controlplane" | "vm";
	level: "info" | "warn" | "error" | "debug";
	message: string;
	hint?: string;
};

type Props = {
	/** True while we're actively trying to boot this machine. Stops
	 *  the poller once the parent says we're done. */
	active?: boolean;
	/** When set, the transcript also tails on-VM logs in addition to
	 *  controlplane phase events. The boot step doesn't have a
	 *  machine until the create POST returns; passing the id from the
	 *  parent unlocks that secondary feed. */
	machineId?: string | null;
	/** Lets the consumer cap the height. Default 320px so the
	 *  transcript reads as a single live region instead of pushing
	 *  the page down forever. */
	maxHeight?: number;
};

export function BootTranscript({
	active = true,
	machineId = null,
	maxHeight = 320,
}: Props) {
	const [entries, setEntries] = useState<Entry[]>([]);
	const [error, setError] = useState<string | null>(null);
	const lastPhaseRef = useRef<string | null>(null);
	const lastReasonRef = useRef<string | null>(null);
	const lastProgressRef = useRef<string | null>(null);
	const seenLogIdsRef = useRef<Set<string>>(new Set());
	const scrollRef = useRef<HTMLDivElement>(null);

	function append(entry: Omit<Entry, "id">): void {
		setEntries((prev) => {
			const id = `${entry.at}-${entry.source}-${entry.message.slice(0, 80)}`;
			if (prev.some((e) => e.id === id)) return prev;
			const next = [...prev, { ...entry, id }];
			return next.slice(-SCROLLBACK_MAX);
		});
	}

	function appendBootstrap(): void {
		// Seed entry so the box never reads as totally empty -- at
		// minimum the operator sees "transcript is live" right away.
		append({
			at: new Date().toISOString(),
			source: "controlplane",
			level: "info",
			message: "transcript started",
			hint: "polling controlplane every 3.5s",
		});
	}

	useEffect(() => {
		if (!active) return;
		appendBootstrap();
		// Note: we DON'T cap by clearing the bootstrap entry -- it's
		// useful breadcrumb for the user to see "yes, the polling
		// kicked off at this instant".
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active]);

	// Controlplane phase poller.
	useEffect(() => {
		if (!active) return;
		let stopped = false;
		async function tick(): Promise<void> {
			try {
				const r = await fetch("/api/dashboard/machine", { cache: "no-store" });
				if (!r.ok) {
					if (r.status === 404 || r.status === 401) return; // not provisioned yet
					throw new Error(`machine HTTP ${r.status}`);
				}
				const m = (await r.json()) as MachineSummary;
				if (stopped) return;
				const at = m.lastProgressAt ?? m.lastTransitionAt ?? new Date().toISOString();
				if (m.phase !== lastPhaseRef.current) {
					append({
						at,
						source: "controlplane",
						level:
							m.phase === "failed"
								? "error"
								: m.phase === "running"
									? "info"
									: "info",
						message: `phase -> ${m.phase}`,
						hint: m.statusReason ?? undefined,
					});
					lastPhaseRef.current = m.phase;
				}
				if (m.statusReason && m.statusReason !== lastReasonRef.current) {
					append({
						at,
						source: "controlplane",
						level: "info",
						message: `reason: ${m.statusReason}`,
					});
					lastReasonRef.current = m.statusReason;
				}
				if (m.reason && m.reason !== lastReasonRef.current) {
					// last_error -> show as error line. Truncate
					// long stack traces to one line; the operator can
					// click through to /logs for full detail.
					append({
						at,
						source: "controlplane",
						level: "error",
						message: m.reason.slice(0, 240),
					});
					lastReasonRef.current = m.reason;
				}
				if (
					m.lastProgressAt &&
					m.lastProgressAt !== lastProgressRef.current &&
					lastPhaseRef.current === m.phase
				) {
					// Progress markers without phase change are a "still
					// alive" signal -- show them as debug so they don't
					// dominate but the operator knows the controlplane
					// is talking.
					append({
						at: m.lastProgressAt,
						source: "controlplane",
						level: "debug",
						message: `progress . ${m.phase}`,
					});
					lastProgressRef.current = m.lastProgressAt;
				}
				setError(null);
			} catch (err) {
				if (!stopped) {
					setError(err instanceof Error ? err.message : "poll failed");
				}
			}
		}
		void tick();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(id);
		};
	}, [active]);

	// On-VM log tail. Only meaningful once the machine reaches
	// `running` (otherwise execOnMachine returns "machine_offline").
	useEffect(() => {
		if (!active || !machineId) return;
		let stopped = false;
		async function tick(): Promise<void> {
			try {
				const r = await fetch("/api/dashboard/logs?n=20", { cache: "no-store" });
				if (!r.ok) return;
				const body = (await r.json()) as LiveDataEnvelope<LogsPayload>;
				if (!body.ok || stopped) return;
				for (const line of body.data.lines) {
					const at = line.at ?? new Date().toISOString();
					const lineId = `${at}-${line.source}-${line.message.slice(0, 80)}`;
					if (seenLogIdsRef.current.has(lineId)) continue;
					seenLogIdsRef.current.add(lineId);
					const level: Entry["level"] =
						line.level === "warn"
							? "warn"
							: line.level === "error"
								? "error"
								: line.level === "debug"
									? "debug"
									: "info";
					append({
						at,
						source: "vm",
						level,
						message: line.message,
						hint: line.source,
					});
				}
			} catch {
				// transient -- next tick will retry
			}
		}
		void tick();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, LOGS_POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(id);
		};
	}, [active, machineId]);

	// Auto-scroll to bottom whenever a new entry lands.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [entries]);

	const counts = useMemo(() => countByLevel(entries), [entries]);

	return (
		<section className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<header className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex items-center gap-2">
					<ReticleLabel>BOOT TRANSCRIPT</ReticleLabel>
					{active ? (
						<span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<BrailleSpinner className="text-[var(--ret-purple)]" />
							live
						</span>
					) : (
						<ReticleBadge variant="success">paused</ReticleBadge>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{counts.error > 0 ? (
						<span className="text-[var(--ret-red)]">! {counts.error} error</span>
					) : null}
					{counts.warn > 0 ? (
						<span className="text-[var(--ret-amber)]">{counts.warn} warn</span>
					) : null}
					<span>{entries.length} lines</span>
				</div>
			</header>
			<div
				ref={scrollRef}
				className="overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
				style={{ maxHeight }}
			>
				{entries.length === 0 ? (
					<p className="py-3 text-center text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						waiting for first event
					</p>
				) : (
					<ul className="flex flex-col gap-0.5">
						{entries.map((entry) => (
							<TranscriptRow key={entry.id} entry={entry} />
						))}
					</ul>
				)}
			</div>
			{error ? (
				<div className="border-t border-[var(--ret-border)] bg-[var(--ret-red)]/5 px-3 py-1.5 font-mono text-[10px] text-[var(--ret-red)]">
					! {error}
				</div>
			) : null}
		</section>
	);
}

function TranscriptRow({ entry }: { entry: Entry }) {
	const dotTone =
		entry.level === "error"
			? "bg-[var(--ret-red)]"
			: entry.level === "warn"
				? "bg-[var(--ret-amber)]"
				: entry.source === "vm"
					? "bg-[var(--ret-green)]"
					: "bg-[var(--ret-purple)]";
	const messageTone =
		entry.level === "error"
			? "text-[var(--ret-red)]"
			: entry.level === "warn"
				? "text-[var(--ret-amber)]"
				: entry.level === "debug"
					? "text-[var(--ret-text-muted)]"
					: "text-[var(--ret-text)]";
	return (
		<li className="flex items-baseline gap-2">
			<span
				aria-hidden="true"
				className={cn("mt-1.5 inline-block h-1.5 w-1.5 shrink-0", dotTone)}
			/>
			<time
				className="shrink-0 tabular-nums text-[10px] text-[var(--ret-text-muted)]"
				dateTime={entry.at}
				title={entry.at}
			>
				{formatTime(entry.at)}
			</time>
			<span className="shrink-0 text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{entry.source}
			</span>
			<p className={cn("min-w-0 break-words", messageTone)}>
				{entry.message}
				{entry.hint ? (
					<span className="ml-1.5 text-[10px] text-[var(--ret-text-muted)]">
						-- {entry.hint}
					</span>
				) : null}
			</p>
		</li>
	);
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso.slice(11, 19);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

function countByLevel(entries: Entry[]) {
	let info = 0;
	let warn = 0;
	let error = 0;
	let debug = 0;
	for (const e of entries) {
		if (e.level === "info") info += 1;
		else if (e.level === "warn") warn += 1;
		else if (e.level === "error") error += 1;
		else if (e.level === "debug") debug += 1;
	}
	return { info, warn, error, debug };
}

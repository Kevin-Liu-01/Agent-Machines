"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import { RefreshCcw } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { MemoryBundle } from "@/lib/user-config/schema";

type Docs = { soul: string; agentDocs: string; memory: string; user: string };
type State =
	| { phase: "idle" | "loading" }
	| { phase: "offline" }
	| { phase: "error"; message: string }
	| { phase: "ready"; docs: Docs };

const ROWS: ReadonlyArray<{ key: keyof Docs; label: string }> = [
	{ key: "soul", label: "Persona" },
	{ key: "agentDocs", label: "Rules & docs" },
	{ key: "memory", label: "Memory" },
	{ key: "user", label: "Operator" },
];

/**
 * Shows what's actually installed at ~/.agent-machines on the selected machine
 * and diffs each doc against the bundle (in sync / differs / not installed).
 */
export function OnMachineMemory({
	machineId,
	bundle,
}: {
	machineId: string | null;
	bundle: MemoryBundle;
}) {
	const [state, setState] = useState<State>({ phase: "idle" });
	const [readMachineId, setReadMachineId] = useState(machineId);
	const request = useRef<AbortController | null>(null);

	const load = useCallback(async () => {
		request.current?.abort();
		setReadMachineId(machineId);
		if (!machineId) {
			setState({ phase: "idle" });
			return;
		}
		const controller = new AbortController();
		request.current = controller;
		setState({ phase: "loading" });
		try {
			const r = await fetch("/api/dashboard/memory/on-machine", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId }),
				signal: controller.signal,
			});
			if (controller.signal.aborted) return;
			if (r.status === 503) {
				setState({ phase: "offline" });
				return;
			}
			const body = (await r.json()) as { ok?: boolean; docs?: Docs; error?: string };
			if (controller.signal.aborted) return;
			if (!r.ok || !body.ok || !body.docs || ROWS.some(row => typeof body.docs?.[row.key] !== "string")) throw new Error(body.error ?? "Could not read this machine's memory. Please try again.");
			setState({ phase: "ready", docs: body.docs });
		} catch (err) {
			if (!controller.signal.aborted) setState({ phase: "error", message: err instanceof Error ? err.message : "Could not read this machine's memory." });
		}
	}, [machineId]);

	useEffect(() => {
		void load();
		return () => request.current?.abort();
	}, [load]);

	if (!machineId) return null;
	const current = readMachineId === machineId ? state : { phase: "loading" as const };

	return (
		<ReticleFrame className="p-3">
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="text-sm font-medium text-[var(--ret-text-muted)]">
					On this machine
				</span>
				<button
					type="button"
					onClick={() => void load()}
					disabled={current.phase === "loading"}
					className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-sm text-[var(--ret-text-muted)] hover:text-[var(--ret-accent)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)] disabled:opacity-50"
				>
					<RefreshCcw size={16} aria-hidden="true" />{current.phase === "loading" ? "Reading…" : current.phase === "error" ? "Retry comparison" : "Refresh comparison"}
				</button>
			</div>
			{current.phase === "loading" || current.phase === "idle" ? (
				<div role="status" className="space-y-3"><p className="text-sm text-[var(--ret-text-muted)]">Reading this machine's memory…</p><div aria-hidden="true" className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></div>
			) : current.phase === "offline" ? (
				<p className="text-sm text-[var(--ret-text-muted)]">Machine is asleep. <Link href={`/dashboard/machines/${encodeURIComponent(machineId)}`} className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Manage this machine</Link> to wake it and compare.</p>
			) : current.phase === "error" ? (
				<p role="alert" className="text-sm text-[var(--ret-red)]">{current.message}</p>
			) : current.phase === "ready" ? (
				<div className="flex flex-col gap-1">
					{ROWS.map((row) => {
						const onMachine = current.docs[row.key] ?? "";
						const inBundle = bundle.docs[row.key] ?? "";
						const status =
							onMachine.trim().length === 0
								? "absent"
								: onMachine.trim() === inBundle.trim()
									? "synced"
									: "differs";
						return (
							<div key={row.key} className="flex items-center justify-between gap-2">
								<span className="font-mono text-xs text-[var(--ret-text)]">{row.label}</span>
								<div className="flex items-center gap-2">
									<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{onMachine.length} chars</span>
									<span
										className={cn(
											"text-xs font-medium",
											status === "synced"
												? "text-[var(--ret-green)]"
												: status === "differs"
													? "text-[var(--ret-amber)]"
													: "text-[var(--ret-text-muted)]",
										)}
									>
										{status === "synced" ? "in sync" : status === "differs" ? "differs" : "not installed"}
									</span>
								</div>
							</div>
						);
					})}
				</div>
			) : null}
		</ReticleFrame>
	);
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
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

	const load = useCallback(async () => {
		if (!machineId) {
			setState({ phase: "idle" });
			return;
		}
		setState({ phase: "loading" });
		try {
			const r = await fetch("/api/dashboard/memory/on-machine", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId }),
			});
			if (r.status === 503) {
				setState({ phase: "offline" });
				return;
			}
			const body = (await r.json()) as { ok?: boolean; docs?: Docs; error?: string };
			if (!r.ok || !body.ok || !body.docs) throw new Error(body.error ?? `HTTP ${r.status}`);
			setState({ phase: "ready", docs: body.docs });
		} catch (err) {
			setState({ phase: "error", message: err instanceof Error ? err.message : "read_failed" });
		}
	}, [machineId]);

	useEffect(() => {
		void load();
	}, [load]);

	if (!machineId) return null;

	return (
		<ReticleFrame className="p-3">
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					On this machine
				</span>
				<button
					type="button"
					onClick={() => void load()}
					className="font-mono text-[10px] text-[var(--ret-text-muted)] hover:text-[var(--ret-accent)]"
				>
					↻ refresh
				</button>
			</div>
			{state.phase === "loading" ? (
				<BrailleSpinner name="orbit" label="reading machine" className="text-[10px] text-[var(--ret-text-muted)]" />
			) : state.phase === "offline" ? (
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">Machine is asleep — wake it to compare.</p>
			) : state.phase === "error" ? (
				<p className="font-mono text-[10px] text-[var(--ret-red)]">{state.message}</p>
			) : state.phase === "ready" ? (
				<div className="flex flex-col gap-1">
					{ROWS.map((row) => {
						const onMachine = state.docs[row.key] ?? "";
						const inBundle = bundle.docs[row.key] ?? "";
						const status =
							onMachine.trim().length === 0
								? "absent"
								: onMachine.trim() === inBundle.trim()
									? "synced"
									: "differs";
						return (
							<div key={row.key} className="flex items-center justify-between gap-2">
								<span className="font-mono text-[10px] text-[var(--ret-text)]">{row.label}</span>
								<div className="flex items-center gap-2">
									<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">{onMachine.length} chars</span>
									<span
										className={cn(
											"font-mono text-[9px] uppercase tracking-[0.14em]",
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

"use client";

import { useEffect, useState } from "react";

import { InteractiveConsole, prefetchXterm } from "@/components/dashboard/InteractiveConsole";
import { TerminalPanel } from "@/components/dashboard/TerminalPanel";
import { cn } from "@/lib/cn";

type Mode = "interactive" | "oneshot";

const TABS: ReadonlyArray<{ id: Mode; label: string; hint: string }> = [
	{ id: "interactive", label: "interactive", hint: "live PTY — talk to the agent" },
	{ id: "oneshot", label: "one-shot", hint: "fire single commands" },
];

export function TerminalWorkspace() {
	const [mode, setMode] = useState<Mode>("interactive");

	useEffect(() => {
		prefetchXterm();
	}, []);

	return (
		<section className="grid min-w-0 gap-3">
			<div className="grid w-full grid-cols-2 items-center gap-px border border-[var(--ret-border)] bg-[var(--ret-border)] sm:flex sm:w-fit">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setMode(tab.id)}
						title={tab.hint}
						className={cn(
							"min-h-11 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors sm:min-h-0",
							mode === tab.id
								? "bg-[var(--ret-bg)] text-[var(--ret-purple)]"
								: "bg-[var(--ret-bg-soft)] text-[var(--ret-text-muted)] hover:text-[var(--ret-text-dim)]",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{mode === "interactive" ? <InteractiveConsole /> : <TerminalPanel />}
		</section>
	);
}

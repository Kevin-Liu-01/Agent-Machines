"use client";

import { useState } from "react";

import { InteractiveConsole } from "@/components/dashboard/InteractiveConsole";
import { TerminalPanel } from "@/components/dashboard/TerminalPanel";
import { cn } from "@/lib/cn";

type Mode = "interactive" | "oneshot";

const TABS: ReadonlyArray<{ id: Mode; label: string; hint: string }> = [
	{ id: "interactive", label: "interactive", hint: "live PTY — talk to the agent" },
	{ id: "oneshot", label: "one-shot", hint: "fire single commands" },
];

export function TerminalWorkspace() {
	const [mode, setMode] = useState<Mode>("interactive");

	return (
		<section className="grid gap-3">
			<div className="flex w-fit items-center gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setMode(tab.id)}
						title={tab.hint}
						className={cn(
							"px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
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

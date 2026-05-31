"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Fleet-level status for the dashboard header. Replaces the machine-scoped
 * gateway/model/agent controls on fleet pages, where there is no single
 * machine in context. Shows a running/total count polled from the fleet
 * endpoint; clicking jumps to the fleet listing.
 */

const POLL_MS = 8000;

type LiveMachine = {
	archived?: boolean;
	live: { ok: true; state: string } | { ok: false; reason: string };
};

type Payload = { ok: boolean; machines: LiveMachine[] };

function isRunning(machine: LiveMachine): boolean {
	return (
		machine.live.ok &&
		(machine.live.state === "ready" || machine.live.state === "starting")
	);
}

export function FleetStatusStrip() {
	const [data, setData] = useState<Payload | null>(null);

	useEffect(() => {
		let stopped = false;
		async function tick(): Promise<void> {
			try {
				const r = await fetch("/api/dashboard/machines", { cache: "no-store" });
				if (!r.ok || stopped) return;
				setData((await r.json()) as Payload);
			} catch {
				// transient; retry next tick
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
	}, []);

	const machines = (data?.machines ?? []).filter((m) => !m.archived);
	const total = machines.length;
	const running = machines.filter(isRunning).length;
	const loaded = data !== null;

	return (
		<div
			className="hidden items-center gap-2 text-[12px] text-[var(--ret-text-muted)] md:flex"
			title={`${running} running of ${total} machines`}
		>
			<span
				aria-hidden
				className={cn(
					"h-1.5 w-1.5 shrink-0 rounded-full",
					running > 0 ? "bg-[var(--ret-green)]" : "bg-[var(--ret-text-muted)]",
				)}
			/>
			<span className="text-[var(--ret-text)] tabular-nums">
				{loaded ? running : "—"}
			</span>
			<span>running</span>
			<span className="text-[var(--ret-text-muted)]">·</span>
			<span className="tabular-nums">{loaded ? total : "—"}</span>
			<span>total</span>
		</div>
	);
}

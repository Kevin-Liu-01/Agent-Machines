"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import type {
	GatewaySummary,
	MachineSummary,
} from "@/lib/dashboard/types";
import type { AgentKind } from "@/lib/user-config/schema";

import { AgentSwitcher } from "./AgentSwitcher";
import { StatusPill } from "./StatusPill";

const POLL_MS = 5000;
const CLERK_READY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

type Props = {
	agentKind: AgentKind;
	activeMachineId?: string;
};

type State = {
	machine: MachineSummary | null;
	gateway: GatewaySummary | null;
	error: string | null;
};

/**
 * Top bar for /dashboard/*. Shows the live machine pill, gateway latency,
 * model id, the agent switcher, and the Clerk user menu. Polls the two
 * cheap endpoints every five seconds; pauses while the tab is hidden so
 * we don't burn budget on a backgrounded laptop.
 */
export function StatusHeader({ agentKind, activeMachineId }: Props) {
	const [state, setState] = useState<State>({
		machine: null,
		gateway: null,
		error: null,
	});

	useEffect(() => {
		let stopped = false;

		async function tick() {
			try {
				const [m, g] = await Promise.all([
					fetch("/api/dashboard/machine", { cache: "no-store" }).then((r) =>
						r.ok ? (r.json() as Promise<MachineSummary>) : null,
					),
					fetch("/api/dashboard/gateway", { cache: "no-store" }).then((r) =>
						r.ok ? (r.json() as Promise<GatewaySummary>) : null,
					),
				]);
				if (stopped) return;
				setState({ machine: m, gateway: g, error: null });
			} catch (err) {
				if (stopped) return;
				const message = err instanceof Error ? err.message : "fetch_failed";
				setState((prev) => ({ ...prev, error: message }));
			}
		}

		tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") tick();
		}, POLL_MS);
		const onVisible = () => {
			if (document.visibilityState === "visible") tick();
		};
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			stopped = true;
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	const machinePhase = state.machine?.phase ?? "loading";
	const gateway = state.gateway;

	return (
		<header
			className={cn(
				"sticky top-0 z-40 flex items-center justify-between gap-4",
				"border-b border-[var(--ret-border)] bg-[var(--ret-bg)]/85 px-5 py-3",
				"backdrop-blur-md",
			)}
		>
			<div className="flex items-center gap-3 min-w-0">
				<Link href="/" className="group flex items-center gap-2.5">
					<BrandMark agent={agentKind} size={20} gap="tight" withLabel={false} />
					<span
						className="hidden text-[18px] leading-none tracking-tight text-[var(--ret-text)] transition-colors group-hover:text-[var(--ret-purple)] md:inline"
						style={{ fontFamily: "var(--font-display-serif)" }}
					>
						agent-machines
					</span>
				</Link>
				<span className="text-[var(--ret-text-muted)]">/</span>
				<StatusPill phase={machinePhase} />
				{state.machine ? (
					<span className="hidden font-mono text-[11px] text-[var(--ret-text-muted)] md:inline">
						{state.machine.machineId.slice(0, 18)}
					</span>
				) : null}
			</div>

			<div className="flex items-center gap-3">
				<GatewayBadge data={gateway} />
				<AgentSwitcher value={agentKind} activeMachineId={activeMachineId} />
				<ThemeToggle />
				{CLERK_READY ? (
					<UserButton
						appearance={{
							elements: {
								avatarBox: "h-7 w-7",
							},
						}}
					/>
				) : null}
			</div>
		</header>
	);
}

function GatewayBadge({ data }: { data: GatewaySummary | null }) {
	if (!data) {
		return (
			<BrailleSpinner
				name="orbit"
				label="gateway"
				className="text-[11px] text-[var(--ret-text-muted)]"
			/>
		);
	}
	const ok = data.ok;
	return (
		<div className="hidden items-center gap-3 font-mono text-[11px] md:flex">
			<span
				className={cn(
					"inline-flex items-center gap-1.5 border px-2 py-0.5",
					ok
						? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
						: "border-[var(--ret-red)]/40 bg-[var(--ret-red)]/10 text-[var(--ret-red)]",
				)}
			>
				<span className="h-1 w-1 bg-current" />
				gateway {ok ? "ok" : "down"}
			</span>
			<span className="text-[var(--ret-text-muted)]">
				{data.latencyMs}
				<span className="ml-0.5 text-[var(--ret-text-muted)]/70">ms</span>
			</span>
			<span className="text-[var(--ret-text-muted)] truncate max-w-[180px]">
				{data.model}
			</span>
		</div>
	);
}

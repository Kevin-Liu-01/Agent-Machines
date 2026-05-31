"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { DASHBOARD_SHELL_HEADER_ROW } from "@/lib/dashboard/shell-chrome";
import { headerDivider } from "@/lib/dashboard/header-chrome";
import { cn } from "@/lib/cn";
import { withMachineId } from "@/lib/dashboard/api-url";
import { usePathname } from "next/navigation";

import type {
	GatewaySummary,
	MachineSummary,
} from "@/lib/dashboard/types";
import type { AgentKind, PublicMachineRef } from "@/lib/user-config/schema";

import { AgentSwitcher } from "./AgentSwitcher";
import { CommandPalette } from "./CommandPalette";
import { FleetStatusStrip } from "./FleetStatusStrip";
import { MachineSwitcher } from "./MachineSwitcher";
import { ModelSwitcher } from "./ModelSwitcher";
import { StatusPill } from "./StatusPill";

const POLL_MS = 5000;
const CLERK_READY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;

type Props = {
	/** Fallback agent for the switcher label when the URL machine isn't resolved. */
	agentKind: AgentKind;
	machines?: PublicMachineRef[];
};

type State = {
	machine: MachineSummary | null;
	gateway: GatewaySummary | null;
	error: string | null;
};

/**
 * Top bar for /dashboard/*. Brand lockup lives in the sidebar (lg+); here
 * we show breadcrumbs, status, and controls. Polls machine + gateway every
 * five seconds; pauses while the tab is hidden.
 */
export function StatusHeader({ agentKind, machines }: Props) {
	const pathname = usePathname();
	const machineMatch = MACHINE_PATH_RE.exec(pathname);
	const urlMachine = machineMatch
		? machines?.find((m) => m.id === machineMatch[1])
		: undefined;
	// In machine view the header is scoped to the URL machine; on fleet
	// pages there is no single machine in context, so we never fall back to
	// the implicit active machine for the machine-scoped controls.
	const inMachineView = Boolean(urlMachine);
	const scopedMachineId = urlMachine?.id ?? null;
	const [state, setState] = useState<State>({
		machine: null,
		gateway: null,
		error: null,
	});

	useEffect(() => {
		if (!inMachineView) {
			setState({ machine: null, gateway: null, error: null });
			return;
		}
		let stopped = false;

		async function tick() {
			try {
				const [m, g] = await Promise.all([
					fetch(withMachineId("/api/dashboard/machine", scopedMachineId), {
						cache: "no-store",
					}).then((r) =>
						r.ok ? (r.json() as Promise<MachineSummary>) : null,
					),
					fetch(withMachineId("/api/dashboard/gateway", scopedMachineId), {
						cache: "no-store",
					}).then((r) =>
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
	}, [scopedMachineId, inMachineView]);

	const machinePhase = state.machine?.phase ?? "loading";
	const gateway = state.gateway;

	return (
		<header
			className={cn(
				DASHBOARD_SHELL_HEADER_ROW,
				"sticky top-0 z-40 justify-between gap-3",
				"bg-[var(--ret-bg)]/90 px-4 backdrop-blur-md md:px-5",
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Link
					href="/"
					className="shrink-0 transition-opacity hover:opacity-80 lg:hidden"
					aria-label="agent-machines home"
				>
					<Logo mark="am" size={20} />
				</Link>
				<nav
					aria-label="Dashboard location"
					className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--ret-text-dim)]"
				>
					{urlMachine ? (
						<>
							<Link
								href="/dashboard/machines"
								className="text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-text)]"
							>
								Fleet
							</Link>
							<span className="text-[var(--ret-text-muted)]" aria-hidden>
								/
							</span>
							<span className="truncate font-medium text-[var(--ret-text)] max-w-[140px] md:max-w-[220px]">
								{urlMachine.name}
							</span>
						</>
					) : (
						<FleetBreadcrumb pathname={pathname} />
					)}
				</nav>
				{inMachineView ? (
					<StatusPill
						phase={machinePhase}
						className="shrink-0 text-[12px] font-medium"
					/>
				) : null}
				<div className="ml-1 hidden sm:block">
					<CommandPalette />
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				{inMachineView ? (
					<>
						<GatewayStrip data={gateway} />
						<span className={headerDivider} aria-hidden />
						<ModelSwitcher activeMachineId={scopedMachineId} />
						<MachineSwitcher />
						<AgentSwitcher
							value={urlMachine?.agentKind ?? agentKind}
							activeMachineId={scopedMachineId ?? undefined}
						/>
					</>
				) : (
					<>
						<FleetStatusStrip />
						<Link
							href="/dashboard/setup"
							className="flex items-center gap-1 border border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)] px-2.5 py-1 text-[12px] font-medium leading-none text-[var(--ret-purple)] transition-colors hover:border-[var(--ret-purple)]"
						>
							<span aria-hidden>+</span>
							<span>Spin up</span>
						</Link>
					</>
				)}
				<span className={headerDivider} aria-hidden />
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

const FLEET_CRUMB: Record<string, string> = {
	"/dashboard": "Overview",
	"/dashboard/machines": "Machines",
	"/dashboard/containers": "Containers",
	"/dashboard/usage": "Usage",
	"/dashboard/settings": "Settings",
	"/dashboard/registry": "Registry",
	"/dashboard/skills": "Skills",
	"/dashboard/mcps": "MCPs",
	"/dashboard/cron": "Cron",
	"/dashboard/setup": "Setup",
};

function FleetBreadcrumb({ pathname }: { pathname: string }) {
	const label = FLEET_CRUMB[pathname];
	if (label) {
		return (
			<span className="font-medium text-[var(--ret-text)]">{label}</span>
		);
	}
	return (
		<>
			<Link
				href="/dashboard"
				className="text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-text)]"
			>
				Fleet
			</Link>
			<span className="text-[var(--ret-text-muted)]" aria-hidden>
				/
			</span>
			<span className="truncate font-medium text-[var(--ret-text)]">
				{pathname.split("/").pop()}
			</span>
		</>
	);
}

function GatewayStrip({ data }: { data: GatewaySummary | null }) {
	if (!data) {
		return (
			<BrailleSpinner
				name="orbit"
				label="gateway"
				className="hidden text-[11px] text-[var(--ret-text-muted)] md:inline-flex"
			/>
		);
	}
	const ok = data.ok;
	return (
		<div
			className="hidden items-center gap-2 text-[12px] text-[var(--ret-text-muted)] md:flex"
			title={data.apiHost}
		>
			<span
				className={cn(
					"h-1.5 w-1.5 shrink-0",
					ok ? "bg-[var(--ret-green)]" : "bg-[var(--ret-red)]",
				)}
				aria-hidden
			/>
			<span className={ok ? "text-[var(--ret-text)]" : "text-[var(--ret-red)]"}>
				Gateway
			</span>
			<span className="text-[var(--ret-text-muted)]">
				{ok ? `${data.latencyMs} ms` : "offline"}
			</span>
		</div>
	);
}

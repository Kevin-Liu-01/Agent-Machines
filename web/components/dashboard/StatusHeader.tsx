"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DASHBOARD_SHELL_HEADER_ROW } from "@/lib/dashboard/shell-chrome";
import { headerDivider } from "@/lib/dashboard/header-chrome";
import { cn } from "@/lib/cn";
import { withMachineId } from "@/lib/dashboard/api-url";
import type {
	GatewaySummary,
	MachineSummary,
} from "@/lib/dashboard/types";
import type { PublicMachineRef } from "@/lib/user-config/schema";

import { CommandPalette } from "./CommandPalette";
import { FleetStatusStrip } from "./FleetStatusStrip";
import { GatewayStrip } from "./GatewayStrip";
import { StatusPill } from "./StatusPill";

const CLERK_READY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;
const POLL_MS = 5000;

type Props = {
	machines?: PublicMachineRef[];
};

type State = {
	machine: MachineSummary | null;
	gateway: GatewaySummary | null;
	error: string | null;
};

/**
 * Fleet and machine header. Machine routes keep global context here while the
 * model/machine/agent selectors live beside the machine identity in the sidebar.
 */
export function StatusHeader({ machines = [] }: Props) {
	const pathname = usePathname();
	const machineMatch = MACHINE_PATH_RE.exec(pathname);
	const machineId = machineMatch?.[1] ?? null;
	const urlMachine = machineId
		? machines.find((machine) => machine.id === machineId)
		: undefined;
	const inMachineView = Boolean(machineId);
	const [state, setState] = useState<State>({
		machine: null,
		gateway: null,
		error: null,
	});

	useEffect(() => {
		if (!machineId) {
			setState({ machine: null, gateway: null, error: null });
			return;
		}
		let stopped = false;

		async function tick() {
			try {
				const [machineResult, gatewayResult] = await Promise.all([
					fetch(withMachineId("/api/dashboard/machine", machineId), {
						cache: "no-store",
					}).then((response) =>
						response.ok ? (response.json() as Promise<MachineSummary>) : null,
					),
					fetch(withMachineId("/api/dashboard/gateway", machineId), {
						cache: "no-store",
					}).then((response) =>
						response.ok ? (response.json() as Promise<GatewaySummary>) : null,
					),
				]);
				if (stopped) return;
				setState({ machine: machineResult, gateway: gatewayResult, error: null });
			} catch (error) {
				if (stopped) return;
				const message = error instanceof Error ? error.message : "fetch_failed";
				setState((previous) => ({ ...previous, error: message }));
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
	}, [machineId]);

	const machinePhase = state.machine?.phase ?? "loading";

	return (
		<header
			className={cn(
				DASHBOARD_SHELL_HEADER_ROW,
				"sticky top-0 z-40 flex-wrap content-center justify-between gap-x-3 gap-y-2",
				"bg-[var(--ret-bg)]/90 px-4 py-1.5 backdrop-blur-md md:px-5",
			)}
		>
			<div className="flex min-w-0 flex-[1_1_340px] items-center gap-3">
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
					{inMachineView ? (
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
							<span className="max-w-[140px] truncate font-medium text-[var(--ret-text)] md:max-w-[220px]">
								{urlMachine?.name ?? machineId}
							</span>
						</>
					) : (
						<FleetBreadcrumb pathname={pathname} />
					)}
				</nav>
				{inMachineView ? (
					<StatusPill
						phase={machinePhase}
						className="shrink-0 whitespace-nowrap text-[12px] font-medium"
					/>
				) : null}
				<div className="ml-1 hidden min-w-[150px] flex-1 sm:block md:max-w-[240px] xl:max-w-[280px]">
					<CommandPalette />
				</div>
			</div>

			<div className="hidden min-w-0 flex-[1_1_520px] flex-wrap items-center justify-end gap-2 md:flex">
				{inMachineView ? (
					<GatewayStrip data={state.gateway} />
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
	"/dashboard/workers": "Workers",
	"/dashboard/benchmarks": "Benchmarks",
	"/dashboard/memory": "Memory",
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

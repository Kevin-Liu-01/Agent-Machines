"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DASHBOARD_SHELL_HEADER_ROW } from "@/lib/dashboard/shell-chrome";
import { headerDivider } from "@/lib/dashboard/header-chrome";
import { cn } from "@/lib/cn";
import { withMachineId } from "@/lib/dashboard/api-url";
import { runtimeUsesGateway } from "@/lib/agents/runtime-capabilities";
import type {
	GatewaySummary,
	MachineSummary,
} from "@/lib/dashboard/types";
import type { PublicMachineRef } from "@/lib/user-config/schema";

import { CommandPalette } from "./CommandPalette";
import { DeferredClerkUserButton } from "./DeferredClerkUserButton";
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
	const gatewayEnabled = runtimeUsesGateway(urlMachine?.agentKind);
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
		let fetching = false;
		const controller = new AbortController();
		setState({ machine: null, gateway: null, error: null });

		async function tick() {
			if (fetching || stopped) return;
			fetching = true;
			try {
				const [machineResult, gatewayResult] = await Promise.all([
					fetch(withMachineId("/api/dashboard/machine", machineId), {
						cache: "no-store",
						signal: controller.signal,
					}).then((response) => {
						if (!response.ok) throw new Error(`Machine status unavailable (HTTP ${response.status})`);
						return response.json() as Promise<MachineSummary>;
					}),
					gatewayEnabled ? fetch(withMachineId("/api/dashboard/gateway", machineId), {
						cache: "no-store",
						signal: controller.signal,
					}).then((response) =>
						response.ok ? (response.json() as Promise<GatewaySummary>) : { ok: false, status: response.status, model: "", apiHost: "Gateway health unavailable", latencyMs: 0, modelCount: null },
					) : Promise.resolve(null),
				]);
				if (stopped) return;
				setState({ machine: machineResult, gateway: gatewayResult, error: null });
			} catch (error) {
				if (stopped) return;
				const message = error instanceof Error ? error.message : "fetch_failed";
				setState((previous) => ({ ...previous, error: message }));
			} finally {
				fetching = false;
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
			controller.abort();
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [machineId, gatewayEnabled]);

	const machinePhase = state.machine?.phase ?? "loading";
	const legacyTimeout = state.machine?.lifecycle?.onTimeout === "kill";
	const expiresAt = state.machine?.endAt ? new Date(state.machine.endAt) : null;

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
					state.error ? <span role="status" className="text-xs text-[var(--ret-amber)]">Status unavailable</span> : gatewayEnabled ? <GatewayStrip data={state.gateway} /> : <span className="text-xs text-[var(--ret-text-muted)]">{urlMachine ? "Native runtime · Console + Terminal" : "Runtime status unavailable"}</span>
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
					<DeferredClerkUserButton />
				) : null}
			</div>
			{inMachineView && legacyTimeout && machinePhase !== "destroyed" && machinePhase !== "destroying" ? (
				<p role="alert" className="w-full rounded border border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/10 px-3 py-2 text-xs leading-relaxed text-[var(--ret-text)]">
					This older sandbox deletes its disk at timeout{expiresAt && Number.isFinite(expiresAt.getTime()) ? ` (${expiresAt.toLocaleString()})` : ""}. Pause it to preserve its state, or migrate while enough time remains. New E2B Workers pause automatically; this Worker’s policy has not changed.
				</p>
			) : null}
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

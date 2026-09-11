"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, SlidersHorizontal, TriangleAlert } from "@/components/ui/icons";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DASHBOARD_SHELL_HEADER_ROW } from "@/lib/dashboard/shell-chrome";
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
const HEADER_LINK = cn(
	"inline-flex min-h-9 shrink-0 items-center rounded-sm text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
	"transition-[color] duration-150 ease-[var(--ret-ease-out)] focus-visible:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none",
);

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
	const optionsRef = useRef<HTMLDetailsElement>(null);
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
		if (optionsRef.current) optionsRef.current.open = false;
	}, [pathname]);

	useEffect(() => {
		const closeOutside = (event: PointerEvent) => {
			if (event.target instanceof Node && !optionsRef.current?.contains(event.target) && optionsRef.current) optionsRef.current.open = false;
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, []);

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
		<>
		<header
			data-dashboard-header
			className={cn(
				DASHBOARD_SHELL_HEADER_ROW,
				"sticky top-0 z-40 gap-2 bg-[var(--ret-bg)] px-[var(--dashboard-gutter,20px)] sm:gap-3",
			)}
		>
				<Link
					href="/"
					className={cn(HEADER_LINK, "w-6 justify-center lg:hidden")}
					aria-label="Agent Machines home"
				>
					<Logo mark="am" size={20} />
				</Link>
				<nav
					aria-label="Dashboard location"
					className={cn("flex min-w-0 max-w-[96px] shrink items-center gap-2 overflow-hidden whitespace-nowrap text-sm text-[var(--ret-text-dim)] sm:max-w-[200px] xl:max-w-[300px]")}
				>
					{inMachineView ? (
						<>
							<Link
								href="/dashboard/machines"
								className={cn(HEADER_LINK, "hidden sm:inline-flex")}
							>
								Fleet
							</Link>
							<span className={cn("hidden text-[var(--ret-text-muted)] sm:inline")} aria-hidden>
								/
							</span>
							<span title={urlMachine?.name ?? machineId ?? undefined} className={cn("min-w-0 truncate font-medium text-[var(--ret-text)]")}>
								{urlMachine?.name ?? machineId}
							</span>
						</>
					) : (
						<FleetBreadcrumb pathname={pathname} />
					)}
				</nav>
				{inMachineView && state.error ? (
					<span role="status" className={cn("hidden shrink-0 whitespace-nowrap text-xs font-medium text-[var(--ret-amber)] lg:inline-flex")}>Status unavailable</span>
				) : inMachineView ? (
					<StatusPill
						phase={machinePhase}
						className="hidden shrink-0 whitespace-nowrap text-xs font-medium lg:inline-flex"
					/>
				) : null}
				<div className={cn("ml-auto min-w-[76px] max-w-[520px] flex-1 sm:ml-4 sm:min-w-[160px]")}>
					<CommandPalette />
				</div>
			<div className={cn("ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2")}>
				{!inMachineView && (
						<Link
							href="/dashboard/setup"
							aria-label="New setup"
							title="New setup"
							className={cn("inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--ret-purple)]/35 bg-[var(--ret-purple-glow)] px-2 text-sm font-medium text-[var(--ret-purple)] transition-colors duration-150 hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none sm:px-3")}
						>
								<Plus className={cn("size-4")} aria-hidden="true" />
								<span className={cn("hidden sm:inline")}>New setup</span>
						</Link>
				)}
				<details ref={optionsRef} className={cn("relative")} onKeyDown={event => {
					if (event.key !== "Escape") return;
					event.currentTarget.open = false;
					event.currentTarget.querySelector("summary")?.focus();
				}}>
					<summary role="button" aria-label={state.error ? "Dashboard options — Worker status unavailable" : "Dashboard options"} title={state.error ? "Worker status unavailable" : "Dashboard options"} className={cn("grid size-9 cursor-pointer list-none place-items-center rounded-md hover:bg-[var(--ret-bg-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)] [&::-webkit-details-marker]:hidden", state.error ? "text-[var(--ret-amber)]" : "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]")}>
						{state.error ? <TriangleAlert className={cn("size-[18px]")} aria-hidden="true" /> : <SlidersHorizontal className={cn("size-[18px]")} aria-hidden="true" />}
					</summary>
					<div className={cn("absolute right-0 top-[calc(100%+8px)] z-50 w-64 space-y-4 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 shadow-xl")}>
						<div className={cn("space-y-2 text-sm")}>
							<p className={cn("font-medium text-[var(--ret-text)]")}>{inMachineView ? "Worker status" : "Fleet status"}</p>
							{inMachineView ? <>
								{!state.error && <StatusPill phase={machinePhase} />}
								{state.error ? <p role="status" className={cn("text-[var(--ret-amber)]")}>Status unavailable</p> : gatewayEnabled ? <GatewayStrip data={state.gateway} /> : <p className={cn("text-[var(--ret-text-muted)]")}>{urlMachine ? "Native runtime · Console + Terminal" : "Runtime status unavailable"}</p>}
							</> : <FleetStatusStrip />}
						</div>
						<div className={cn("space-y-2 border-t border-[var(--ret-border)] pt-3")}>
							<p className={cn("text-sm font-medium")}>Appearance</p>
							<ThemeToggle className="w-fit" />
						</div>
					</div>
				</details>
				{CLERK_READY ? (
					<DeferredClerkUserButton />
				) : null}
			</div>
		</header>
			{inMachineView && legacyTimeout && machinePhase !== "destroyed" && machinePhase !== "destroying" ? (
				<p role="alert" className={cn("sticky top-12 z-30 border-b border-[var(--ret-amber)]/40 bg-[var(--ret-bg)] px-4 py-3 text-sm leading-relaxed text-[var(--ret-text)]")}>
					This older sandbox deletes its disk at timeout{expiresAt && Number.isFinite(expiresAt.getTime()) ? ` (${expiresAt.toLocaleString()})` : ""}. Pause it to preserve its state, or migrate while enough time remains. New E2B Workers pause automatically; this Worker’s policy has not changed.
				</p>
			) : null}
		</>
	);
}

const FLEET_CRUMB: Record<string, string> = {
	"/dashboard": "Overview",
	"/dashboard/machines": "Workspaces",
	"/dashboard/containers": "Containers",
	"/dashboard/usage": "Insights",
	"/dashboard/settings": "Settings",
	"/dashboard/registry": "Toolkit",
	"/dashboard/skills": "Skills",
	"/dashboard/mcps": "MCP servers",
	"/dashboard/cron": "Automations",
	"/dashboard/setup": "Quickstart",
	"/dashboard/workers": "Agent setups",
	"/dashboard/benchmarks": "Benchmarks",
	"/dashboard/memory": "Memory",
	"/dashboard/agents": "Studio",
	"/dashboard/components": "Building blocks",
	"/dashboard/chat": "Console",
	"/dashboard/terminal": "Terminal",
	"/dashboard/logs": "Logs",
	"/dashboard/sessions": "Sessions",
	"/dashboard/artifacts": "Artifacts",
	"/dashboard/loadout": "Loadouts",
};

function FleetBreadcrumb({ pathname }: { pathname: string }) {
	const label = FLEET_CRUMB[pathname];
	if (label) {
		return (
			<span title={label} className={cn("min-w-0 truncate font-medium text-[var(--ret-text)]")}>{label}</span>
		);
	}
	return (
		<>
			<Link
				href="/dashboard"
				className={HEADER_LINK}
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

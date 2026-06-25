"use client";

import {
	Activity,
	ArrowUpRight,
	Bot,
	Brain,
	CheckCircle2,
	CircleDashed,
	Clipboard,
	Clock3,
	Cloud,
	Cpu,
	Database,
	FileText,
	Gauge,
	HardDrive,
	KeyRound,
	Play,
	Power,
	MemoryStick,
	MessagesSquare,
	Rocket,
	RefreshCcw,
	ScrollText,
	Server,
	Shield,
	SquareTerminal,
	Terminal,
	Wifi,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { InteractiveConsole, prefetchXterm } from "@/components/dashboard/InteractiveConsole";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useMachineContext } from "@/components/dashboard/MachineProvider";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MachineIntrospection } from "@/lib/agents/machine-introspection";
import { cn } from "@/lib/cn";
import { withMachineId } from "@/lib/dashboard/api-url";
import { agentLabel, agentLaunchCommand, isCliAgent } from "@/lib/dashboard/agent-launch";
import { formatAge, formatBytes } from "@/lib/dashboard/format";
import type {
	GatewaySummary,
	LiveDataEnvelope,
	LogLine,
	LogsPayload,
} from "@/lib/dashboard/types";
import {
	normalizeMachineUsagePayload,
	type NormalizedMachineUsage,
} from "@/lib/dashboard/usage-metrics";
import {
	AGENT_KINDS,
	AGENT_LABEL,
	PROVIDER_LABEL,
	type AgentKind,
} from "@/lib/user-config/schema";

type MachineRouteResponse =
	| {
			ok: true;
			live?: {
				state?: string;
				rawPhase?: string;
				lastError?: string | null;
				error?: string;
			} | null;
	  }
	| { ok?: false; error?: string; message?: string };

type WakeRouteResponse = {
	ok?: boolean;
	needsBootstrap?: boolean;
	summary?: { phase?: string; state?: string; rawPhase?: string };
	error?: string;
	message?: string;
};

type MutateRouteResponse = {
	ok?: boolean;
	error?: string;
	message?: string;
};

type CollectState =
	| { status: "idle"; message: string | null }
	| { status: "running"; message: string | null }
	| { status: "ok"; message: string | null; collected: number; transitions: number }
	| { status: "warn"; message: string | null };

type LaunchStatus = "idle" | "running" | "done" | "skipped" | "error";

type LaunchStepId = "activate" | "wake" | "bootstrap" | "terminal" | "agent";

type LaunchStep = {
	id: LaunchStepId;
	label: string;
	detail: string;
	status: LaunchStatus;
};

type SnapshotState = {
	machineState: string | null;
	machineRawPhase: string | null;
	machineError: string | null;
	gateway: GatewaySummary | null;
	gatewayError: string | null;
	logs: LogsPayload | null;
	usage: NormalizedMachineUsage | null;
	introspection: MachineIntrospection | null;
	introspectionError: string | null;
	fetchedAt: string | null;
};

type AgentRuntimeProfile = {
	kind: AgentKind;
	label: string;
	mode: string;
	home: string;
	configPath: string;
	entrypoint: string;
	routesThroughGateway: boolean;
	observes: string;
};

type SurfaceTone = "good" | "warn" | "muted";

type ObservabilitySurface = {
	icon: ReactNode;
	label: string;
	value: string;
	detail: string;
	tone: SurfaceTone;
};

const EMPTY_SNAPSHOT: SnapshotState = {
	machineState: null,
	machineRawPhase: null,
	machineError: null,
	gateway: null,
	gatewayError: null,
	logs: null,
	usage: null,
	introspection: null,
	introspectionError: null,
	fetchedAt: null,
};

const POLL_MS = 7_000;
const USAGE_DAYS = 7;
const DEFAULT_AGENT_KIND: AgentKind = "hermes";
const BOOTSTRAP_POLL_MS = 2_500;
const BOOTSTRAP_WAIT_MS = 12 * 60_000;

const AGENT_RUNTIME_PROFILES: Record<AgentKind, AgentRuntimeProfile> = {
	hermes: {
		kind: "hermes",
		label: AGENT_LABEL.hermes,
		mode: "memory runtime",
		home: "~/.agent-machines",
		configPath: "~/.agent-machines/config.yaml",
		entrypoint: "hermes chat",
		routesThroughGateway: true,
		observes: "memory, cron, MCP",
	},
	openclaw: {
		kind: "openclaw",
		label: AGENT_LABEL.openclaw,
		mode: "computer-use runtime",
		home: "~/.openclaw",
		configPath: "~/.openclaw/config.json",
		entrypoint: "openclaw chat",
		routesThroughGateway: true,
		observes: "browser, shell, vision",
	},
	"claude-code": {
		kind: "claude-code",
		label: AGENT_LABEL["claude-code"],
		mode: "native coding CLI",
		home: "~/.claude",
		configPath: "~/.claude/settings.json",
		entrypoint: "claude",
		routesThroughGateway: false,
		observes: "repo, shell, edits",
	},
	codex: {
		kind: "codex",
		label: AGENT_LABEL.codex,
		mode: "native task CLI",
		home: "~/.codex",
		configPath: "~/.codex/config.toml",
		entrypoint: "codex",
		routesThroughGateway: false,
		observes: "tasks, sandbox, CI",
	},
};

function runtimeProfileFor(agentKind: string | null | undefined): AgentRuntimeProfile {
	if (AGENT_KINDS.includes(agentKind as AgentKind)) {
		return AGENT_RUNTIME_PROFILES[agentKind as AgentKind];
	}
	return AGENT_RUNTIME_PROFILES[DEFAULT_AGENT_KIND];
}

type BootstrapPollState = {
	phase?: "idle" | "running" | "succeeded" | "failed";
	current?: string | null;
	lastError?: string | null;
};

type BootstrapPollResponse = {
	ok?: boolean;
	machine?: { bootstrapState?: BootstrapPollState };
	message?: string;
	error?: string;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForBootstrapReady(
	machineId: string,
	onState: (state: BootstrapPollState) => void,
): Promise<void> {
	const deadline = Date.now() + BOOTSTRAP_WAIT_MS;
	while (Date.now() < deadline) {
		const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
			cache: "no-store",
		});
		const body = (await response.json().catch(() => ({}))) as BootstrapPollResponse;
		if (!response.ok || body.ok === false) {
			throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
		}
		const state = body.machine?.bootstrapState;
		if (state) {
			onState(state);
			if (state.phase === "succeeded") return;
			if (state.phase === "failed") {
				throw new Error(state.lastError ?? "bootstrap failed");
			}
		}
		await sleep(BOOTSTRAP_POLL_MS);
	}
	throw new Error("bootstrap did not finish in time");
}

export function AgentViewScreen() {
	const { machineId, machine, isActive } = useMachineContext();
	const searchParams = useSearchParams();
	const [snapshot, setSnapshot] = useState<SnapshotState>(EMPTY_SNAPSHOT);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [collectState, setCollectState] = useState<CollectState>({
		status: "idle",
		message: null,
	});
	const [launching, setLaunching] = useState(false);
	const [launchError, setLaunchError] = useState<string | null>(null);
	const [launchSteps, setLaunchSteps] = useState<LaunchStep[]>(() =>
		defaultLaunchSteps(),
	);
	const [consoleVisible, setConsoleVisible] = useState(false);
	const [consoleAutoLaunch, setConsoleAutoLaunch] = useState(false);
	const [consoleNonce, setConsoleNonce] = useState(0);
	const didAutostart = useRef(false);

	const base = `/dashboard/machines/${encodeURIComponent(machineId)}`;
	const markLaunchStep = useCallback(
		(id: LaunchStepId, patch: Partial<Omit<LaunchStep, "id" | "label">>) => {
			setLaunchSteps((current) =>
				current.map((step) => (step.id === id ? { ...step, ...patch } : step)),
			);
		},
		[],
	);
	const resetLaunchSteps = useCallback(() => {
		setLaunchSteps(defaultLaunchSteps());
	}, []);

	const loadSnapshot = useCallback(
		async ({ includeIntrospection }: { includeIntrospection: boolean }) => {
			setRefreshing(true);
			try {
				const [machineRes, gatewayRes, logsRes, usageRes, introspectionRes] =
					await Promise.allSettled([
						fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
							cache: "no-store",
						}).then((res) => readJson<MachineRouteResponse>(res)),
						fetch(withMachineId("/api/dashboard/gateway", machineId), {
							cache: "no-store",
						}).then((res) => readJson<GatewaySummary | { error?: string; message?: string }>(res)),
						fetch(withMachineId("/api/dashboard/logs?n=32", machineId), {
							cache: "no-store",
						}).then((res) => readJson<LiveDataEnvelope<LogsPayload>>(res)),
						fetch(
							`/api/dashboard/metrics/machines/${encodeURIComponent(machineId)}/usage?days=${USAGE_DAYS}`,
							{ cache: "no-store" },
						).then((res) => readJson<unknown>(res)),
						includeIntrospection
							? fetch(
									`/api/dashboard/machines/${encodeURIComponent(machineId)}/introspection`,
									{ cache: "no-store" },
								).then((res) =>
									readJson<{
										ok?: boolean;
										data?: MachineIntrospection;
										error?: string;
										message?: string;
									}>(res),
								)
							: Promise.resolve(null),
					]);

				setSnapshot((prev) => {
					const next: SnapshotState = { ...prev, fetchedAt: new Date().toISOString() };

					if (machineRes.status === "fulfilled" && machineRes.value.ok) {
						const live = machineRes.value.live;
						next.machineState = live?.state ?? live?.rawPhase ?? "unknown";
						next.machineRawPhase = live?.rawPhase ?? live?.state ?? "unknown";
						next.machineError = live?.lastError ?? live?.error ?? null;
					} else if (machineRes.status === "rejected") {
						next.machineError = machineRes.reason instanceof Error ? machineRes.reason.message : "machine fetch failed";
					}

					if (gatewayRes.status === "fulfilled") {
						const gateway = gatewayRes.value;
						if ("status" in gateway && "latencyMs" in gateway) {
							next.gateway = gateway;
							next.gatewayError = gateway.ok ? null : gateway.error ?? "gateway failed";
						} else {
							next.gateway = null;
							next.gatewayError = gateway.message ?? gateway.error ?? "gateway unavailable";
						}
					} else {
						next.gatewayError = gatewayRes.reason instanceof Error ? gatewayRes.reason.message : "gateway fetch failed";
					}

					if (logsRes.status === "fulfilled" && logsRes.value.ok) {
						next.logs = logsRes.value.data;
					}

					if (usageRes.status === "fulfilled") {
						next.usage = normalizeMachineUsagePayload(
							usageRes.value,
							USAGE_DAYS,
							machineId,
						);
					}

					if (introspectionRes.status === "fulfilled" && introspectionRes.value) {
						if (introspectionRes.value.data) {
							next.introspection = introspectionRes.value.data;
							next.introspectionError = null;
						} else {
							next.introspectionError =
								introspectionRes.value.message ??
								introspectionRes.value.error ??
								"introspection failed";
						}
					} else if (introspectionRes.status === "rejected") {
						next.introspectionError =
							introspectionRes.reason instanceof Error
								? introspectionRes.reason.message
								: "introspection failed";
					}

					return next;
				});
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[machineId],
	);

	const collectUsage = useCallback(async () => {
		setCollectState({ status: "running", message: "collecting now" });
		try {
			const response = await fetch("/api/dashboard/metrics/collect", {
				method: "POST",
				cache: "no-store",
			});
			const body = (await response.json()) as {
				ok?: boolean;
				collected?: number;
				transitions?: number;
				message?: string;
				error?: string;
			};
			if (!response.ok || body.ok === false) {
				setCollectState({
					status: "warn",
					message: body.message ?? body.error ?? `collect failed: HTTP ${response.status}`,
				});
				return;
			}
			setCollectState({
				status: "ok",
				message: "usage sample stored",
				collected: body.collected ?? 0,
				transitions: body.transitions ?? 0,
			});
			await loadSnapshot({ includeIntrospection: false });
		} catch (err) {
			setCollectState({
				status: "warn",
				message: err instanceof Error ? err.message : "collect failed",
			});
		}
	}, [loadSnapshot]);

	const startAgentSession = useCallback(
		async ({ forceBootstrap = false }: { forceBootstrap?: boolean } = {}) => {
			if (!machine) return;
			setLaunching(true);
			setLaunchError(null);
			resetLaunchSteps();
			setConsoleAutoLaunch(false);
			prefetchXterm();

			const launchCommand = agentLaunchCommand(machine.agentKind);
			const hasCli = isCliAgent(machine.agentKind);
			const runtimeProfile = runtimeProfileFor(machine.agentKind);
			const shouldBootstrap =
				forceBootstrap ||
				(runtimeProfile.routesThroughGateway &&
					machine.bootstrapState.phase !== "succeeded");

			try {
				if (isActive) {
					markLaunchStep("activate", {
						status: "skipped",
						detail: "already active",
					});
				} else {
					markLaunchStep("activate", {
						status: "running",
						detail: "setting active machine",
					});
					await fetchJson<MutateRouteResponse>(
						`/api/dashboard/machines/${encodeURIComponent(machineId)}`,
						{
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ active: true }),
						},
					);
					markLaunchStep("activate", {
						status: "done",
						detail: "active for this session",
					});
				}

				markLaunchStep("wake", {
					status: "running",
					detail: "waking provider machine",
				});
				const wake = await fetchJson<WakeRouteResponse>(
					`/api/dashboard/machines/${encodeURIComponent(machineId)}/wake`,
					{ method: "POST" },
				);
				markLaunchStep("wake", {
					status: "done",
					detail:
						wake.summary?.phase ??
						wake.summary?.state ??
						wake.summary?.rawPhase ??
						"awake",
				});

				markLaunchStep("terminal", {
					status: "running",
					detail: "attaching live console",
				});
				setConsoleVisible(true);
				setConsoleNonce((value) => value + 1);
				markLaunchStep("terminal", {
					status: "done",
					detail: "tmux console mounting",
				});

				if (shouldBootstrap || wake.needsBootstrap) {
					markLaunchStep("bootstrap", {
						status: "running",
						detail: forceBootstrap
							? "repairing runtime"
							: runtimeProfile.routesThroughGateway
								? "starting gateway"
								: "checking runtime",
					});
					await fetchJson<MutateRouteResponse>("/api/dashboard/admin/bootstrap", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							machineId,
							force: forceBootstrap,
							background: true,
						}),
					});
					await waitForBootstrapReady(machineId, (state) => {
						markLaunchStep("bootstrap", {
							status: "running",
							detail: state.current
								? `installing · ${state.current}`
								: state.phase === "running"
									? "installing runtime"
									: "queued runtime install",
						});
					});
					markLaunchStep("bootstrap", {
						status: "done",
						detail: "runtime ready",
					});
				} else {
					markLaunchStep("bootstrap", {
						status: "skipped",
						detail: runtimeProfile.routesThroughGateway
							? "gateway current"
							: "runtime current",
					});
				}

				setConsoleAutoLaunch(hasCli);
				markLaunchStep("agent", {
					status: hasCli ? "done" : "skipped",
					detail: launchCommand
						? `queued ${agentLabel(machine.agentKind)}`
						: "no interactive cli",
				});

				void loadSnapshot({ includeIntrospection: true });
				void collectUsage();
			} catch (err) {
				const message = err instanceof Error ? err.message : "launch failed";
				setLaunchError(message);
				setLaunchSteps((current) =>
					current.map((step) =>
						step.status === "running"
							? { ...step, status: "error", detail: message }
							: step,
					),
				);
			} finally {
				setLaunching(false);
			}
		},
		[
			collectUsage,
			isActive,
			loadSnapshot,
			machine,
			machineId,
			markLaunchStep,
			resetLaunchSteps,
		],
	);

	useEffect(() => {
		let stopped = false;
		void loadSnapshot({ includeIntrospection: true });
		void collectUsage();
		const interval = window.setInterval(() => {
			if (!stopped && document.visibilityState === "visible") {
				void loadSnapshot({ includeIntrospection: false });
			}
		}, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, [collectUsage, loadSnapshot]);

	useEffect(() => {
		prefetchXterm();
	}, []);

	const wantsAutolaunch = searchParams.get("launch") === "1";
	useEffect(() => {
		if (!wantsAutolaunch || didAutostart.current || !machine) return;
		didAutostart.current = true;
		void startAgentSession();
	}, [machine, startAgentSession, wantsAutolaunch]);

	const usageTotals = useMemo(() => usageSummary(snapshot.usage), [snapshot.usage]);
	const agentName = machine ? AGENT_LABEL[machine.agentKind] : "Agent";
	const state = snapshot.machineState ?? "loading";
	const gatewayOk = Boolean(snapshot.gateway?.ok);
	const logStatus = snapshot.logs?.status ?? "live";

	if (!machine) return null;
	const runtimeProfile = runtimeProfileFor(machine.agentKind);
	const launchCommand = agentLaunchCommand(machine.agentKind);
	const launchTerminalHref = `${base}/terminal?launch=1`;
	const agentDisplay = agentLabel(machine.agentKind);
	const detectedAgent = snapshot.introspection?.detectedAgent ?? null;
	const detectedAgentLabel =
		detectedAgent && detectedAgent !== "unknown"
			? agentLabel(detectedAgent)
			: "unknown";
	const activeModel = snapshot.gateway?.model ?? snapshot.introspection?.model ?? machine.model;
	const routeValue = gatewayOk
		? `${snapshot.gateway?.latencyMs ?? 0}ms`
		: runtimeProfile.routesThroughGateway
			? "check"
			: "direct";
	const routeTone = gatewayOk
		? "good"
		: runtimeProfile.routesThroughGateway
			? "warn"
			: "muted";
	const routeFootnote = gatewayOk
		? (snapshot.gateway?.apiHost ?? "gateway ready")
		: runtimeProfile.routesThroughGateway
			? (snapshot.gatewayError ?? "not probed")
			: `${agentDisplay} uses native CLI`;
	const observabilitySurfaces: ObservabilitySurface[] = [
		{
			icon: <Bot size={14} />,
			label: "Configured",
			value: agentDisplay,
			detail: `${runtimeProfile.mode} · ${runtimeProfile.observes}`,
			tone: "good" as const,
		},
		{
			icon: <Brain size={14} />,
			label: "Detected",
			value: detectedAgentLabel,
			detail: snapshot.introspection?.configPath ?? runtimeProfile.configPath,
			tone: snapshot.introspection
				? "good"
				: snapshot.introspectionError
					? "warn"
					: "muted",
		},
		{
			icon: <Wifi size={14} />,
			label: "Gateway",
			value: routeValue,
			detail: routeFootnote,
			tone: routeTone,
		},
		{
			icon: <Terminal size={14} />,
			label: "Terminal",
			value: launchCommand ? "ready" : "manual",
			detail: launchCommand ?? runtimeProfile.entrypoint,
			tone: launchCommand ? "good" : "muted",
		},
		{
			icon: <Gauge size={14} />,
			label: "Usage",
			value: usageTotals.active,
			detail: collectFootnote(collectState),
			tone: usageTotals.hasUsage ? "good" : "muted",
		},
		{
			icon: <ScrollText size={14} />,
			label: "Logs",
			value: snapshot.logs ? `${snapshot.logs.lines.length} lines` : "loading",
			detail: snapshot.logs?.message ?? `${snapshot.logs?.files.length ?? 0} files`,
			tone: logStatus === "degraded" ? "warn" : "good",
		},
	];

	return (
		<div className="flex flex-col">
			<PageHeader
				artSlug="machines"
				kicker={`OBSERVABILITY -- ${machine.name}`}
				title={`${agentName} runtime view`}
				description="Inspect state, logs, usage, and config. Hermes stays the default."
				right={
					<div className="flex flex-wrap items-center gap-2">
						<ReticleButton
							as="a"
							href={`${base}/agents`}
							variant="secondary"
							size="sm"
						>
							<Bot size={14} />
							Configure
						</ReticleButton>
						<ReticleButton
							as="a"
							href={`${base}/console`}
							variant="primary"
							size="sm"
						>
							<MessagesSquare size={14} />
							Console
						</ReticleButton>
						<ReticleButton
							as="a"
							href={`${base}/terminal`}
							variant="secondary"
							size="sm"
						>
							<SquareTerminal size={14} />
							Terminal
						</ReticleButton>
						<ReticleButton
							as="a"
							href={`${base}/logs`}
							variant="ghost"
							size="sm"
						>
							<ScrollText size={14} />
							Logs
						</ReticleButton>
						<ReticleButton
							variant="ghost"
							size="sm"
							onClick={() => {
								void loadSnapshot({ includeIntrospection: true });
								void collectUsage();
							}}
							disabled={refreshing || collectState.status === "running"}
						>
							<RefreshCcw size={14} className={cn(refreshing && "animate-spin")} />
							Refresh
						</ReticleButton>
					</div>
				}
			/>
			<DashboardPageBody>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<SignalTile
						icon={<Server size={14} />}
						label="Machine"
						value={state}
						tone={state === "ready" || state === "running" ? "good" : "muted"}
						footnote={snapshot.machineRawPhase ?? machine.providerKind}
						loading={loading && !snapshot.machineState}
					/>
					<SignalTile
						icon={<Wifi size={14} />}
						label="Gateway"
						value={routeValue}
						tone={routeTone}
						footnote={routeFootnote}
						loading={loading && !snapshot.gateway && !snapshot.gatewayError}
					/>
					<SignalTile
						icon={<Gauge size={14} />}
						label="Usage"
						value={usageTotals.active}
						tone={usageTotals.hasUsage ? "good" : "muted"}
						footnote={collectFootnote(collectState)}
						loading={loading && !snapshot.usage}
					/>
					<SignalTile
						icon={<Terminal size={14} />}
						label="Logs"
						value={snapshot.logs ? `${snapshot.logs.lines.length} lines` : "loading"}
						tone={logStatus === "degraded" ? "warn" : "good"}
						footnote={snapshot.logs?.message ?? `${snapshot.logs?.files.length ?? 0} files`}
						loading={loading && !snapshot.logs}
					/>
				</div>

				<AgentLauncherPanel
					agentName={agentDisplay}
					apiHost={snapshot.gateway?.apiHost ?? machine.apiUrl ?? null}
					base={base}
					bootstrapPhase={machine.bootstrapState.phase}
					command={launchCommand}
					configPath={snapshot.introspection?.configPath ?? null}
					consoleAutoLaunch={consoleAutoLaunch}
					consoleNonce={consoleNonce}
					consoleVisible={consoleVisible}
					gatewayOk={gatewayOk}
					launchError={launchError}
					launching={launching}
					launchSteps={launchSteps}
					launchTerminalHref={launchTerminalHref}
					machineId={machineId}
					model={activeModel}
					onOpenConsole={() => {
						setConsoleAutoLaunch(false);
						setConsoleVisible(true);
					}}
					onStart={() => void startAgentSession()}
					onRepair={() => void startAgentSession({ forceBootstrap: true })}
					provider={PROVIDER_LABEL[machine.providerKind]}
					runtimeProfile={runtimeProfile}
					runtime={snapshot.introspection?.detectedAgent ?? machine.agentKind}
				/>

				<Panel
					title="Observability"
					icon={<Activity size={13} />}
					right={
						<ReticleBadge variant={snapshot.introspection ? "success" : "default"}>
							{snapshot.introspection ? "live" : "probing"}
						</ReticleBadge>
					}
				>
					<SurfaceGrid surfaces={observabilitySurfaces} />
					<KeyGrid
						rows={[
							["configured", agentDisplay],
							["detected", detectedAgentLabel],
							["default", agentLabel(DEFAULT_AGENT_KIND)],
							["agent home", runtimeProfile.home],
							["model", activeModel],
							["configure", `${base}/agents`],
						]}
					/>
				</Panel>

				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
					<Panel
						title="Gateway"
						icon={<Cloud size={13} />}
						right={
							<ReticleBadge
								variant={
									gatewayOk
										? "success"
										: runtimeProfile.routesThroughGateway
											? "warning"
											: "default"
								}
							>
								{gatewayOk
									? "online"
									: runtimeProfile.routesThroughGateway
										? "check"
										: "optional"}
							</ReticleBadge>
						}
					>
						<div className="grid gap-3 md:grid-cols-3">
							<Metric label="Model" value={activeModel} />
							<Metric
								label="Mode"
								value={runtimeProfile.routesThroughGateway ? "gateway" : "native"}
							/>
							<Metric
								label="Models"
								value={
									!runtimeProfile.routesThroughGateway
										? "direct"
										: snapshot.gateway?.modelCount == null
										? "unknown"
										: String(snapshot.gateway.modelCount)
								}
							/>
						</div>
						<KeyGrid
							rows={[
								[
									"api host",
									runtimeProfile.routesThroughGateway
										? (snapshot.gateway?.apiHost ?? machine.apiUrl ?? "not set")
										: "native cli",
								],
								[
									"api key",
									runtimeProfile.routesThroughGateway
										? machine.hasApiKey
											? "stored"
											: "missing"
										: "provider key",
								],
								["active", isActive ? "yes" : "no"],
								["error", runtimeProfile.routesThroughGateway ? (snapshot.gatewayError ?? "none") : "none"],
							]}
						/>
					</Panel>

					<Panel
						title="Runtime"
						icon={<Bot size={13} />}
						right={
							<ReticleBadge variant={snapshot.introspection ? "success" : "default"}>
								{snapshot.introspection?.detectedAgent ?? machine.agentKind}
							</ReticleBadge>
						}
					>
						<KeyGrid
							rows={[
								["configured", agentDisplay],
								["detected", detectedAgentLabel],
								["version", snapshot.introspection?.agentVersion ?? "unknown"],
								["home", runtimeProfile.home],
								["config", snapshot.introspection?.configPath ?? runtimeProfile.configPath],
								["sandbox", snapshot.introspection?.sandboxMode ?? "unknown"],
								["approval", snapshot.introspection?.approvalPolicy ?? "unknown"],
								["default", agentLabel(DEFAULT_AGENT_KIND)],
								["command", snapshot.introspectionError ? "degraded" : "available"],
							]}
						/>
						{snapshot.introspectionError ? (
							<p className="border border-[var(--ret-amber)]/30 bg-[var(--ret-amber)]/5 px-3 py-2 font-mono text-[10px] text-[var(--ret-amber)]">
								{snapshot.introspectionError}
							</p>
						) : null}
					</Panel>
				</div>

				<div className="grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
					<Panel title="Machine Spec" icon={<Cpu size={13} />}>
						<div className="grid gap-3 sm:grid-cols-3">
							<Metric label="vCPU" value={String(machine.spec.vcpu)} icon={<Cpu size={14} />} />
							<Metric
								label="RAM"
								value={`${(machine.spec.memoryMib / 1024).toFixed(1)} GiB`}
								icon={<MemoryStick size={14} />}
							/>
							<Metric
								label="Disk"
								value={`${machine.spec.storageGib} GiB`}
								icon={<HardDrive size={14} />}
							/>
						</div>
						<KeyGrid
							rows={[
								["machine id", machineId],
								["provider", PROVIDER_LABEL[machine.providerKind]],
								["bootstrap", machine.bootstrapState.phase],
								["env profile", machine.environmentProfileId ?? "none"],
								["gateway profile", machine.gatewayProfileId ?? "none"],
								["created", formatDate(machine.createdAt)],
							]}
						/>
					</Panel>

					<Panel
						title="Usage"
						icon={<Activity size={13} />}
						right={
							<ReticleBadge
								variant={collectState.status === "warn" ? "warning" : "default"}
							>
								{collectState.status}
							</ReticleBadge>
						}
					>
						<div className="grid gap-3 md:grid-cols-3">
							<Metric label="CPU" value={usageTotals.cpu} />
							<Metric label="Memory" value={usageTotals.memory} />
							<Metric label="Storage" value={usageTotals.storage} />
						</div>
						<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
							<div className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3">
								<ReticleLabel className="text-[9px]">Transitions</ReticleLabel>
								<TransitionList transitions={snapshot.usage?.transitions ?? []} />
							</div>
							<div className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3">
								<ReticleLabel className="text-[9px]">Collector</ReticleLabel>
								<p className="mt-2 text-[12px] text-[var(--ret-text)]">
									{collectFootnote(collectState)}
								</p>
								<p className="mt-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
									refreshed {formatAge(snapshot.fetchedAt)}
								</p>
							</div>
						</div>
					</Panel>
				</div>

				<Panel title="Agent State" icon={<Brain size={13} />}>
					{snapshot.introspection ? (
						<AgentStateGrid data={snapshot.introspection} />
					) : snapshot.introspectionError ? (
						<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
							<div className="border border-[var(--ret-amber)]/30 bg-[var(--ret-amber)]/5 px-4 py-3">
								<ReticleLabel className="text-[9px]">Command probe</ReticleLabel>
								<p className="mt-2 text-[13px] text-[var(--ret-amber)]">
									Runtime introspection degraded.
								</p>
								<p className="mt-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
									{snapshot.introspectionError}
								</p>
							</div>
							<KeyGrid
								rows={[
									["agent", agentDisplay],
									["model", activeModel],
									["gateway", routeValue],
									["logs", logStatus],
								]}
							/>
						</div>
					) : (
						<div className="grid gap-3 md:grid-cols-3">
							<Skeleton className="h-[92px]" />
							<Skeleton className="h-[92px]" />
							<Skeleton className="h-[92px]" />
						</div>
					)}
				</Panel>

				<Panel
					title="Recent Logs"
					icon={<ScrollText size={13} />}
					right={
						<ReticleBadge variant={logStatus === "degraded" ? "warning" : "success"}>
							{logStatus}
						</ReticleBadge>
					}
				>
					<LogTable lines={snapshot.logs?.lines ?? []} />
				</Panel>
			</DashboardPageBody>
		</div>
	);
}

function AgentLauncherPanel({
	agentName,
	apiHost,
	base,
	bootstrapPhase,
	command,
	configPath,
	consoleAutoLaunch,
	consoleNonce,
	consoleVisible,
	gatewayOk,
	launchError,
	launching,
	launchSteps,
	launchTerminalHref,
	machineId,
	model,
	onOpenConsole,
	onRepair,
	onStart,
	provider,
	runtimeProfile,
	runtime,
}: {
	agentName: string;
	apiHost: string | null;
	base: string;
	bootstrapPhase: string;
	command: string | null;
	configPath: string | null;
	consoleAutoLaunch: boolean;
	consoleNonce: number;
	consoleVisible: boolean;
	gatewayOk: boolean;
	launchError: string | null;
	launching: boolean;
	launchSteps: LaunchStep[];
	launchTerminalHref: string;
	machineId: string;
	model: string;
	onOpenConsole: () => void;
	onRepair: () => void;
	onStart: () => void;
	provider: string;
	runtimeProfile: AgentRuntimeProfile;
	runtime: string;
}) {
	const routeLabel = runtimeProfile.routesThroughGateway ? "gateway" : "native";
	const routeValue = runtimeProfile.routesThroughGateway
		? (apiHost ?? "not exposed")
		: "native cli";
	const runRows = [
		{ label: "command", value: command ?? "no interactive cli", copy: command },
		{ label: "terminal", value: launchTerminalHref, href: launchTerminalHref },
		{
			label: runtimeProfile.routesThroughGateway ? "gateway" : "path",
			value: routeValue,
			copy: runtimeProfile.routesThroughGateway ? (apiHost ?? undefined) : undefined,
		},
		{ label: "home", value: runtimeProfile.home, copy: runtimeProfile.home },
		{ label: "config", value: configPath ?? runtimeProfile.configPath, copy: configPath ?? runtimeProfile.configPath },
		{ label: "model", value: model, copy: model },
		{ label: "machine", value: machineId, copy: machineId },
		{ label: "configure", value: `${base}/agents`, href: `${base}/agents` },
		{ label: "logs", value: `${base}/logs`, href: `${base}/logs` },
		{ label: "artifacts", value: `${base}/artifacts`, href: `${base}/artifacts` },
	];

	return (
		<Panel
			title="Agent Launcher"
			icon={<Rocket size={13} />}
			right={
				<ReticleBadge variant={launching ? "accent" : gatewayOk ? "success" : "default"}>
					{launching
						? "booting"
						: gatewayOk
							? "gateway ready"
							: runtimeProfile.routesThroughGateway
								? bootstrapPhase
								: "cli ready"}
				</ReticleBadge>
			}
		>
			<div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
				<div className="grid gap-3">
					<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
						{launchSteps.map((step) => (
							<LaunchStepRow key={step.id} step={step} />
						))}
					</div>
					{launchError ? (
						<div className="border border-[var(--ret-red)]/30 bg-[var(--ret-red)]/5 px-3 py-2 font-mono text-[10px] text-[var(--ret-red)]">
							{launchError}
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-2">
						<ReticleButton
							type="button"
							variant="primary"
							size="sm"
							onClick={onStart}
							disabled={launching}
						>
							<Play size={14} />
							Start {agentName}
						</ReticleButton>
						<ReticleButton
							type="button"
							variant="secondary"
							size="sm"
							onClick={onRepair}
							disabled={launching}
						>
							<Power size={14} />
							Repair boot
						</ReticleButton>
						<ReticleButton
							as="a"
							href={`${base}/agents`}
							variant="secondary"
							size="sm"
						>
							<Bot size={14} />
							Configure
						</ReticleButton>
						<ReticleButton
							as="a"
							href={launchTerminalHref}
							variant="secondary"
							size="sm"
						>
							<SquareTerminal size={14} />
							Terminal
						</ReticleButton>
						<ReticleButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={onOpenConsole}
						>
							<Terminal size={14} />
							Show console
						</ReticleButton>
					</div>
				</div>

				<div className="grid gap-3">
					<div className="grid gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3">
						<div className="grid grid-cols-3 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)] font-mono text-[10px]">
							<MiniDatum label="agent" value={agentName} />
							<MiniDatum label={routeLabel} value={runtime} />
							<MiniDatum label="provider" value={provider} />
						</div>
						<RunSheet rows={runRows} />
					</div>
				</div>
			</div>

			{consoleVisible ? (
				<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
					<div className="flex items-center justify-between gap-3 border-b border-[var(--ret-border)] px-3 py-2">
						<ReticleLabel className="text-[9px]">
							{consoleAutoLaunch ? "Auto-launch console" : "Live console"}
						</ReticleLabel>
						<ReticleBadge variant={consoleAutoLaunch ? "accent" : "default"}>
							tmux
						</ReticleBadge>
					</div>
					<div className="px-3 py-3">
						<InteractiveConsole
							key={consoleNonce}
							autoLaunch={consoleAutoLaunch}
							heightClassName="h-[46dvh] min-h-[320px]"
							showFooter={false}
						/>
					</div>
				</div>
			) : null}
		</Panel>
	);
}

function LaunchStepRow({ step }: { step: LaunchStep }) {
	return (
		<div className="grid grid-cols-[32px_minmax(0,160px)_minmax(0,1fr)_84px] items-center bg-[var(--ret-bg-soft)] text-[12px]">
			<div className="flex h-full items-center justify-center border-r border-[var(--ret-border)] text-[var(--ret-text-muted)]">
				<LaunchStatusIcon status={step.status} />
			</div>
			<div className="border-r border-[var(--ret-border)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{step.label}
			</div>
			<div className="truncate px-3 py-2 font-mono text-[11px] text-[var(--ret-text-dim)]">
				{step.detail}
			</div>
			<div className={cn("px-3 py-2 text-right font-mono text-[10px] uppercase tracking-[0.16em]", launchStatusClass(step.status))}>
				{step.status}
			</div>
		</div>
	);
}

function LaunchStatusIcon({ status }: { status: LaunchStatus }) {
	if (status === "running") {
		return <RefreshCcw size={13} className="animate-spin text-[var(--ret-text)]" />;
	}
	if (status === "done") return <CheckCircle2 size={13} className="text-[var(--ret-text)]" />;
	if (status === "error") return <CircleDashed size={13} className="text-[var(--ret-red)]" />;
	if (status === "skipped") return <CircleDashed size={13} className="text-[var(--ret-text-muted)]" />;
	return <CircleDashed size={13} />;
}

function MiniDatum({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg)] px-2 py-2">
			<p className="uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="mt-1 truncate text-[var(--ret-text)]">{value}</p>
		</div>
	);
}

function RunSheet({
	rows,
}: {
	rows: Array<{ label: string; value: string; copy?: string | null; href?: string }>;
}) {
	return (
		<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
			{rows.map((row) => (
				<div
					key={row.label}
					className="grid grid-cols-[88px_minmax(0,1fr)_40px] items-center bg-[var(--ret-bg)]"
				>
					<div className="border-r border-[var(--ret-border)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{row.label}
					</div>
					<div className="min-w-0 px-3 py-2 font-mono text-[11px] text-[var(--ret-text-dim)]">
						{row.href ? (
							<a
								href={row.href}
								className="group inline-flex max-w-full items-center gap-1 text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]"
							>
								<span className="truncate">{row.value}</span>
								<ArrowUpRight size={12} className="shrink-0 opacity-60 group-hover:opacity-100" />
							</a>
						) : (
							<span className="block truncate" title={row.value}>
								{row.value}
							</span>
						)}
					</div>
					<div className="border-l border-[var(--ret-border)] px-1 py-1">
						<CopyValueButton value={row.copy ?? row.value} disabled={!row.copy && row.href !== undefined} />
					</div>
				</div>
			))}
		</div>
	);
}

function CopyValueButton({ value, disabled }: { value: string; disabled?: boolean }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			disabled={disabled}
			title={copied ? "copied" : "copy"}
			onClick={() => {
				void navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					window.setTimeout(() => setCopied(false), 900);
				});
			}}
			className={cn(
				"ret-pressable flex h-7 w-7 items-center justify-center border border-[var(--ret-border)] text-[var(--ret-text-muted)]",
				disabled
					? "cursor-not-allowed opacity-35"
					: "hover:border-[var(--ret-border-hover)] hover:text-[var(--ret-text)]",
			)}
		>
			{copied ? <CheckCircle2 size={12} /> : <Clipboard size={12} />}
		</button>
	);
}

async function readJson<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => ({}))) as T;
	if (!response.ok) {
		const maybe = body as { message?: string; error?: string };
		throw new Error(maybe.message ?? maybe.error ?? `HTTP ${response.status}`);
	}
	return body;
}

async function fetchJson<T extends { ok?: boolean; message?: string; error?: string }>(
	input: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(input, { cache: "no-store", ...init });
	const body = (await response.json().catch(() => ({}))) as T;
	if (!response.ok || body.ok === false) {
		throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
	}
	return body;
}

function defaultLaunchSteps(): LaunchStep[] {
	return [
		{
			id: "activate",
			label: "active",
			detail: "bind dashboard views",
			status: "idle",
		},
		{
			id: "wake",
			label: "wake",
			detail: "resume provider machine",
			status: "idle",
		},
		{
			id: "bootstrap",
			label: "boot",
			detail: "verify runtime files",
			status: "idle",
		},
		{
			id: "terminal",
			label: "pty",
			detail: "attach tmux console",
			status: "idle",
		},
		{
			id: "agent",
			label: "agent",
			detail: "launch interactive cli",
			status: "idle",
		},
	];
}

function launchStatusClass(status: LaunchStatus): string {
	if (status === "running") return "text-[var(--ret-text)]";
	if (status === "done") return "text-[var(--ret-text)]";
	if (status === "error") return "text-[var(--ret-red)]";
	return "text-[var(--ret-text-muted)]";
}

function usageSummary(usage: NormalizedMachineUsage | null) {
	if (!usage) {
		return {
			active: "none",
			cpu: "0.0 vCPU-hr",
			memory: "0.0 GiB-hr",
			storage: "0.0 GiB-hr",
			hasUsage: false,
		};
	}
	const cpuHours = usage.resources.cpu.total / 3600;
	const memoryHours = usage.resources.memory.total / 3600;
	const storageHours = usage.resources.storage.total;
	return {
		active: formatResourceHours(cpuHours, "vCPU-hr"),
		cpu: formatResourceHours(cpuHours, "vCPU-hr"),
		memory: formatResourceHours(memoryHours, "GiB-hr"),
		storage: formatResourceHours(storageHours, "GiB-hr"),
		hasUsage: cpuHours > 0 || memoryHours > 0 || storageHours > 0,
	};
}

function formatResourceHours(value: number, unit: string): string {
	if (value === 0) return `0 ${unit}`;
	if (value < 0.1) return `<0.1 ${unit}`;
	return `${value.toFixed(1)} ${unit}`;
}

function collectFootnote(state: CollectState): string {
	if (state.status === "ok") {
		return `${state.collected} samples, ${state.transitions} transitions`;
	}
	return state.message ?? state.status;
}

function SurfaceGrid({ surfaces }: { surfaces: ObservabilitySurface[] }) {
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{surfaces.map((surface) => (
				<div
					key={surface.label}
					className="min-h-[112px] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3 transition-colors hover:border-[var(--ret-border-hover)]"
				>
					<div className="flex items-center justify-between gap-3">
						<ReticleLabel className="flex items-center gap-1.5 text-[9px]">
							<span className="text-[var(--ret-text-muted)]">{surface.icon}</span>
							{surface.label}
						</ReticleLabel>
						<span
							className={cn(
								"h-2 w-2 rounded-full",
								surface.tone === "good" && "bg-[var(--ret-border-strong)]",
								surface.tone === "warn" && "bg-[var(--ret-amber)]",
								surface.tone === "muted" && "bg-[var(--ret-border-hover)]",
							)}
						/>
					</div>
					<p className="mt-4 truncate text-[18px] font-semibold tracking-tight text-[var(--ret-text)]">
						{surface.value}
					</p>
					<p
						className="mt-1 truncate font-mono text-[10px] text-[var(--ret-text-muted)]"
						title={surface.detail}
					>
						{surface.detail}
					</p>
				</div>
			))}
		</div>
	);
}

function SignalTile({
	icon,
	label,
	value,
	footnote,
	tone,
	loading,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	footnote: string;
	tone: "good" | "warn" | "muted";
	loading?: boolean;
}) {
	return (
		<ReticleFrame>
			<div className="flex min-h-[104px] flex-col justify-between px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<ReticleLabel className="flex items-center gap-1.5 text-[9px]">
						<span className="text-[var(--ret-text-muted)]">{icon}</span>
						{label}
					</ReticleLabel>
					<span
						className={cn(
							"h-2 w-2 rounded-full",
							tone === "good" && "bg-[var(--ret-border-strong)]",
							tone === "warn" && "bg-[var(--ret-amber)]",
							tone === "muted" && "bg-[var(--ret-border-hover)]",
						)}
					/>
				</div>
				{loading ? (
					<Skeleton className="h-7 w-28" />
				) : (
					<div>
						<p className="truncate text-[22px] font-semibold tracking-tight text-[var(--ret-text)]">
							{value}
						</p>
						<p className="mt-1 truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
							{footnote}
						</p>
					</div>
				)}
			</div>
		</ReticleFrame>
	);
}

function Panel({
	title,
	icon,
	right,
	children,
}: {
	title: string;
	icon: ReactNode;
	right?: ReactNode;
	children: ReactNode;
}) {
	return (
		<ReticleFrame>
			<div className="flex items-center justify-between gap-3 border-b border-[var(--ret-border)] px-4 py-3">
				<h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{icon}
					{title}
				</h2>
				{right}
			</div>
			<div className="flex flex-col gap-3 px-4 py-4">{children}</div>
		</ReticleFrame>
	);
}

function Metric({
	label,
	value,
	icon,
}: {
	label: string;
	value: string;
	icon?: ReactNode;
}) {
	return (
		<div className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3">
			<ReticleLabel className="flex items-center gap-1.5 text-[9px]">
				{icon ? <span>{icon}</span> : null}
				{label}
			</ReticleLabel>
			<p className="mt-2 truncate text-[15px] font-semibold text-[var(--ret-text)]">
				{value}
			</p>
		</div>
	);
}

function KeyGrid({ rows }: { rows: Array<[string, string]> }) {
	return (
		<div className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
			{rows.map(([label, value]) => (
				<div
					key={label}
					className="grid grid-cols-[116px_minmax(0,1fr)] bg-[var(--ret-bg-soft)]"
				>
					<div className="border-r border-[var(--ret-border)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{label}
					</div>
					<div className="truncate px-3 py-2 font-mono text-[11px] text-[var(--ret-text-dim)]">
						{value}
					</div>
				</div>
			))}
		</div>
	);
}

function AgentStateGrid({ data }: { data: MachineIntrospection }) {
	const memoryChars = data.memory.reduce((sum, file) => sum + file.chars, 0);
	const channels = data.channels.filter((channel) => channel.connected).length;
	const stateRows = [
		{
			label: "Identity",
			value: String(data.identity.length),
			footnote: data.identity.map((f) => f.name).join(", ") || "none",
			icon: <FileText size={14} />,
		},
		{
			label: "Memory",
			value: formatBytes(memoryChars),
			footnote: `${data.memory.length} files`,
			icon: <Database size={14} />,
		},
		{
			label: "Skills",
			value: String(data.skills.total),
			footnote: `${data.skills.agentAuthored} agent-authored`,
			icon: <Brain size={14} />,
		},
		{
			label: "Sessions",
			value: String(data.sessions.totalSessions),
			footnote: `${data.sessions.totalTranscripts} transcripts`,
			icon: <Clock3 size={14} />,
		},
		{
			label: "Heartbeat",
			value: data.heartbeat.enabled ? "enabled" : "off",
			footnote: data.heartbeat.intervalMinutes
				? `${data.heartbeat.intervalMinutes}m interval`
				: "default",
			icon: <CheckCircle2 size={14} />,
		},
		{
			label: "Channels",
			value: String(channels),
			footnote: data.channels.length ? `${data.channels.length} checked` : "none",
			icon: <KeyRound size={14} />,
		},
		{
			label: "Vector",
			value: data.vectorMemory.available ? "ready" : "off",
			footnote: `${data.vectorMemory.indexedFiles} files indexed`,
			icon: <Shield size={14} />,
		},
		{
			label: "Subagents",
			value: data.subAgents.available ? String(data.subAgents.maxConcurrent) : "off",
			footnote: `${data.subAgents.activeCount} active`,
			icon: <Bot size={14} />,
		},
	];

	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{stateRows.map((row) => (
				<div
					key={row.label}
					className="min-h-[96px] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-3"
				>
					<ReticleLabel className="flex items-center gap-1.5 text-[9px]">
						{row.icon}
						{row.label}
					</ReticleLabel>
					<p className="mt-2 text-[18px] font-semibold text-[var(--ret-text)]">
						{row.value}
					</p>
					<p className="mt-1 truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
						{row.footnote}
					</p>
				</div>
			))}
		</div>
	);
}

function TransitionList({
	transitions,
}: {
	transitions: NormalizedMachineUsage["transitions"];
}) {
	if (transitions.length === 0) {
		return (
			<p className="mt-3 text-[12px] text-[var(--ret-text-muted)]">
				No transitions yet.
			</p>
		);
	}
	return (
		<div className="mt-3 max-h-[170px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
			{transitions.slice(0, 8).map((transition, index) => (
				<div
					key={`${transition.timestamp}-${index}`}
					className="grid grid-cols-[10px_minmax(0,1fr)] gap-2 border-b border-[var(--ret-border)] py-2 last:border-b-0"
				>
					<span
						className={cn(
							"mt-1.5 h-1.5 w-1.5 rounded-full",
							index === 0 ? "bg-[var(--ret-border-strong)]" : "bg-[var(--ret-border-hover)]",
						)}
					/>
					<div className="min-w-0">
						<p className="truncate text-[12px] text-[var(--ret-text)]">
							{transition.label}
						</p>
						<p className="mt-0.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
							{formatDate(transition.timestamp)}
						</p>
					</div>
				</div>
			))}
		</div>
	);
}

function LogTable({ lines }: { lines: LogLine[] }) {
	if (lines.length === 0) {
		return (
			<div className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 py-6 text-center text-[12px] text-[var(--ret-text-muted)]">
				No log lines yet.
			</div>
		);
	}
	return (
		<div className="max-h-[320px] overflow-y-auto border border-[var(--ret-border)] bg-[var(--ret-bg)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
			<table className="w-full border-collapse font-mono text-[11px]">
				<tbody>
					{lines.slice(-24).map((line, index) => (
						<tr
							key={`${line.at ?? ""}-${index}-${line.message.slice(0, 16)}`}
							className="border-b border-[var(--ret-border)] last:border-b-0"
						>
							<td className="w-[160px] px-3 py-2 align-top text-[var(--ret-text-muted)]">
								{line.at ? shortTime(line.at) : ""}
							</td>
							<td
								className={cn(
									"w-[70px] px-3 py-2 align-top uppercase tracking-[0.16em]",
									line.level === "error" && "text-[var(--ret-red)]",
									line.level === "warn" && "text-[var(--ret-amber)]",
									line.level === "info" && "text-[var(--ret-text)]",
									line.level === "debug" && "text-[var(--ret-text-muted)]",
									line.level === "other" && "text-[var(--ret-text-dim)]",
								)}
							>
								{line.level === "other" ? line.source : line.level}
							</td>
							<td className="break-words px-3 py-2 align-top text-[var(--ret-text-dim)]">
								{line.message}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "unknown";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function shortTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value.slice(0, 19);
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

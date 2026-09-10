"use client";

import { ArrowRight, Check, CloudCog, LoaderCircle } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { cn } from "@/lib/cn";
import { agentLogoMark, providerLogoMark } from "@/lib/fleet/logos";
import {
	AGENT_LABEL,
	PROVIDER_LABEL,
	type AgentKind,
	type ProviderKind,
} from "@/lib/user-config/schema";

import { useDashboardConfig } from "./DashboardConfigProvider";

const RUNTIMES: ReadonlyArray<{
	id: AgentKind;
	detail: string;
}> = [
	{ id: "claude-code", detail: "Deep repository work with Anthropic's coding agent." },
	{ id: "codex", detail: "OpenAI's coding CLI for autonomous implementation." },
	{ id: "hermes", detail: "Persistent generalist with memory, tools, and schedules." },
	{ id: "openclaw", detail: "Computer-use worker with browser, shell, and vision." },
];

const SANDBOXES: ReadonlyArray<{
	id: ProviderKind;
	detail: string;
}> = [
	{ id: "e2b", detail: "Fast pause and resume for focused agent work." },
	{ id: "sprites", detail: "Persistent Linux with auto-sleep and quick wake." },
	{ id: "vercel", detail: "Snapshot-backed Firecracker sandboxes." },
	{ id: "daytona", detail: "Linux sandboxes with stop/start and persistent files." },
];

export function WorkerLaunchpad() {
	const router = useRouter();
	const config = useDashboardConfig();
	const [runtime, setRuntime] = useState<AgentKind | null>(null);
	const [sandbox, setSandbox] = useState<ProviderKind | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const credentialVerdict = useMemo(
		() => (runtime && config ? validateAgentCredentials(runtime, config) : null),
		[runtime, config],
	);

	async function launch(target: ProviderKind) {
		setSandbox(target);
		setError(null);
		if (!runtime || !config) return;
		if (!config.providers[target]?.configured) {
			setError(`Add ${PROVIDER_LABEL[target]} credentials in Settings, then click it again.`);
			return;
		}
		if (credentialVerdict && !credentialVerdict.ok) {
			setError(credentialVerdict.message);
			return;
		}

		setBusy(true);
		try {
			const response = await fetch("/api/dashboard/control-plane/workers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					runtime,
					sandbox: target,
					name: `${AGENT_LABEL[runtime]} worker`,
					migrationPolicy: "live",
				}),
			});
			const body = (await response.json()) as {
				worker?: { id?: string };
				operation?: { id?: string };
				message?: string;
				error?: string;
			};
			if (!response.ok || !body.worker?.id || !body.operation?.id) {
				throw new Error(body.message ?? body.error ?? `Launch failed (HTTP ${response.status}).`);
			}
			router.push(
				`/dashboard/workers/${encodeURIComponent(body.worker.id)}?launch=${encodeURIComponent(body.operation.id)}`,
			);
			router.refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Worker launch failed.");
			setBusy(false);
		}
	}

	return (
		<div id="launch-worker" className={cn("scroll-mt-20")}>
		<ReticleFrame className={cn("overflow-hidden bg-[var(--ret-bg)]")}>
			<div className={cn("flex flex-col gap-3 border-b border-[var(--ret-border)] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5")}>
				<div>
					<h2 className={cn("flex items-center gap-2 text-xl font-medium tracking-tight text-[var(--ret-text)]")}>
						<CloudCog aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-[var(--ret-purple)]")} strokeWidth={1.75} />
						Configure a Worker
					</h2>
					<p className={cn("mt-2 max-w-[62ch] text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
						Choose a runtime, then a sandbox. The sandbox click creates the Worker, provisions its home, and opens the live console.
					</p>
				</div>
				<div className={cn("shrink-0 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[14px] text-[var(--ret-text-muted)]")}>
					Live migration policy
				</div>
			</div>

			<div className={cn("grid border-b border-[var(--ret-border)] lg:grid-cols-[112px_1fr]")}>
				<StepMarker number="01" label="Runtime" active={!runtime} complete={Boolean(runtime)} />
				<div className={cn("grid grid-cols-1 gap-px bg-[var(--ret-border)] sm:grid-cols-2 xl:grid-cols-4")}>
					{RUNTIMES.map((item) => {
						const selected = runtime === item.id;
						return (
							<button
								key={item.id}
								type="button"
								aria-pressed={selected}
								disabled={busy}
								onClick={() => {
									setRuntime(item.id);
									setSandbox(null);
									setError(null);
								}}
								className={cn(
									"group min-h-28 bg-[var(--ret-bg)] p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] disabled:cursor-wait disabled:opacity-60 enabled:active:bg-[var(--ret-purple-glow)]",
									selected
										? "bg-[var(--ret-purple-glow)]"
										: "enabled:hover:bg-[var(--ret-surface)]",
								)}
							>
								<div className={cn("flex items-center justify-between gap-3")}>
									<div className={cn("flex items-center gap-2.5")}>
										<Logo mark={agentLogoMark(item.id)} size={22} />
										<span className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>{AGENT_LABEL[item.id]}</span>
									</div>
									<span aria-hidden="true" className={cn("flex h-5 w-5 shrink-0 items-center justify-center border", selected ? "border-[var(--ret-purple)] bg-[var(--ret-purple)] text-[var(--ret-bg)]" : "border-[var(--ret-border-hover)]")}>
										{selected ? <Check className={cn("h-3 w-3")} strokeWidth={2} /> : null}
									</span>
								</div>
								<p className={cn("mt-3 text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>{item.detail}</p>
							</button>
						);
					})}
				</div>
			</div>

			<div className={cn("grid lg:grid-cols-[112px_1fr]")}>
				<StepMarker number="02" label="Sandbox" active={Boolean(runtime)} complete={Boolean(sandbox)} />
				<div className={cn("grid grid-cols-1 gap-px bg-[var(--ret-border)] sm:grid-cols-2 xl:grid-cols-4")}>
					{SANDBOXES.map((item) => {
						const selected = sandbox === item.id;
						const configured = config?.providers[item.id]?.configured ?? false;
						return (
							<button
								key={item.id}
								type="button"
								aria-pressed={selected}
								disabled={!runtime || !config || busy}
								onClick={() => void launch(item.id)}
								className={cn(
									"group min-h-28 bg-[var(--ret-bg)] p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] disabled:cursor-not-allowed disabled:opacity-60 enabled:active:bg-[var(--ret-purple-glow)]",
									selected
										? "bg-[var(--ret-purple-glow)]"
										: "enabled:hover:bg-[var(--ret-surface)]",
								)}
							>
								<div className={cn("flex items-center justify-between gap-3")}>
									<div className={cn("flex items-center gap-2.5")}>
										<Logo mark={providerLogoMark(item.id)} size={22} />
										<span className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>{PROVIDER_LABEL[item.id]}</span>
									</div>
									{busy && selected ? (
										<LoaderCircle aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-[var(--ret-purple)]")} strokeWidth={1.75} />
									) : (
										<ArrowRight aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-[var(--ret-text-muted)] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] pointer-fine:motion-safe:[@media(hover:hover)]:group-[:hover:not(:disabled):not(:focus-visible)]:translate-x-0.5 group-focus-visible:transition-none")} strokeWidth={1.75} />
									)}
								</div>
								<p className={cn("mt-3 text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>{item.detail}</p>
								<p className={cn(
									"mt-3 font-mono text-[14px]",
									configured ? "text-[var(--ret-green)]" : "text-[var(--ret-text-muted)]",
								)}>
									{busy && selected ? "Launching…" : !config ? "Loading configuration…" : !runtime ? "Select a runtime first" : configured ? "Ready · click to launch" : "Key required"}
								</p>
							</button>
						);
					})}
				</div>
			</div>

			{error ? (
				<div role="alert" className={cn("border-t border-[var(--ret-red)]/35 bg-[var(--ret-red)]/5 px-4 py-3 text-[16px] leading-relaxed text-[var(--ret-red)] sm:px-5")}>
					{error} <a href="/dashboard/settings" className={cn("underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-red)]")}>Open Settings</a>
				</div>
			) : null}
		</ReticleFrame>
		</div>
	);
}

function StepMarker({
	number,
	label,
	active,
	complete,
}: {
	number: string;
	label: string;
	active: boolean;
	complete: boolean;
}) {
	return (
		<div className={cn(
			"flex items-center justify-between gap-3 border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-4 py-3 lg:block lg:border-b-0 lg:border-r",
			active ? "text-[var(--ret-text)]" : "text-[var(--ret-text-muted)]",
		)}>
			<span className={cn("font-mono text-[13px] tabular-nums", complete && "text-[var(--ret-green)]")}>{complete ? "OK" : number}</span>
			<p className={cn("text-[16px] font-medium lg:mt-2")}>{label}</p>
		</div>
	);
}

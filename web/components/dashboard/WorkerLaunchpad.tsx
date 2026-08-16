"use client";

import { ArrowRight, Check, CloudCog, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
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
	{ id: "dedalus", detail: "Persistent microVMs with durable home storage." },
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
		<div id="launch-worker" className="scroll-mt-20">
		<ReticleFrame className="overflow-hidden bg-[var(--ret-bg)]">
			<div className="flex flex-col gap-3 border-b border-[var(--ret-border)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="flex items-center gap-2">
						<CloudCog className="h-3.5 w-3.5 text-[var(--ret-purple)]" strokeWidth={1.75} />
						<ReticleLabel>new worker</ReticleLabel>
					</div>
					<h2 className="ret-display mt-2 text-xl">Assemble the machinery.</h2>
					<p className="mt-1 max-w-[62ch] text-[12px] text-[var(--ret-text-dim)]">
						Choose the replaceable runtime and sandbox. The sandbox click creates the durable Worker, provisions its home, and opens the live console.
					</p>
				</div>
				<div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					one intent · live-migration policy
				</div>
			</div>

			<div className="grid border-b border-[var(--ret-border)] lg:grid-cols-[112px_1fr]">
				<StepMarker number="01" label="Runtime" active={!runtime} complete={Boolean(runtime)} />
				<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] sm:grid-cols-2 xl:grid-cols-4">
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
									"group min-h-28 bg-[var(--ret-bg)] p-4 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]",
									selected
										? "bg-[var(--ret-purple-glow)]"
										: "hover:bg-[var(--ret-surface)]",
								)}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2.5">
										<Logo mark={agentLogoMark(item.id)} size={18} />
										<span className="text-[13px] text-[var(--ret-text)]">{AGENT_LABEL[item.id]}</span>
									</div>
									{selected ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
								</div>
								<p className="mt-3 text-[11px] leading-relaxed text-[var(--ret-text-muted)]">{item.detail}</p>
							</button>
						);
					})}
				</div>
			</div>

			<div className="grid lg:grid-cols-[112px_1fr]">
				<StepMarker number="02" label="Sandbox" active={Boolean(runtime)} complete={Boolean(sandbox)} />
				<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] sm:grid-cols-2 xl:grid-cols-4">
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
									"group min-h-28 bg-[var(--ret-bg)] p-4 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] disabled:cursor-not-allowed disabled:opacity-45",
									selected
										? "bg-[var(--ret-purple-glow)]"
										: "hover:bg-[var(--ret-surface)]",
								)}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2.5">
										<Logo mark={providerLogoMark(item.id)} size={18} />
										<span className="text-[13px] text-[var(--ret-text)]">{PROVIDER_LABEL[item.id]}</span>
									</div>
									{busy && selected ? (
										<LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
									) : (
										<ArrowRight className="h-3.5 w-3.5 text-[var(--ret-text-muted)]" strokeWidth={1.75} />
									)}
								</div>
								<p className="mt-3 text-[11px] leading-relaxed text-[var(--ret-text-muted)]">{item.detail}</p>
								<p className={cn(
									"mt-2 font-mono text-[9px] uppercase tracking-[0.16em]",
									configured ? "text-[var(--ret-green)]" : "text-[var(--ret-text-muted)]",
								)}>
									{configured ? "ready · click to launch" : "key required"}
								</p>
							</button>
						);
					})}
				</div>
			</div>

			{error ? (
				<div className="border-t border-[var(--ret-red)]/35 bg-[var(--ret-red)]/5 px-4 py-3 text-[11px] text-[var(--ret-red)]">
					{error} <a href="/dashboard/settings" className="underline underline-offset-2">Open settings</a>
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
			<span className="font-mono text-[10px] tracking-[0.2em]">{complete ? "OK" : number}</span>
			<p className="font-mono text-[9px] uppercase tracking-[0.2em] lg:mt-2">{label}</p>
		</div>
	);
}

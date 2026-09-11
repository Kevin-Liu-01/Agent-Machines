"use client";

import { ArrowRight, Check, CloudCog, LoaderCircle } from "@/components/ui/icons";
import Link from "next/link";
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
	{ id: "claude-code", detail: "Anthropic's coding CLI in your configured workspace." },
	{ id: "codex", detail: "OpenAI's coding CLI with its native configuration." },
	{ id: "hermes", detail: "A runtime with memory files, tools, and optional schedules." },
	{ id: "openclaw", detail: "A runtime with its own tool and workspace configuration." },
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

	return <section id="launch-worker" className="scroll-mt-20" aria-labelledby="launch-workspace-title">
		<ReticleFrame className="overflow-hidden rounded-lg bg-[var(--ret-bg)]">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ret-border)] px-4 py-3">
				<h2 id="launch-workspace-title" className="flex items-center gap-2 text-lg font-medium tracking-tight"><CloudCog size={20} aria-hidden="true" className="text-[var(--ret-purple)]" />Launch a workspace</h2>
				<span className="text-xs text-[var(--ret-text-muted)]">Your accounts. Your compute.</span>
			</div>
			<div className="grid gap-5 p-4 md:grid-cols-2">
				<fieldset className="min-w-0">
					<legend className="mb-3 text-sm font-medium">Choose a runtime</legend>
					<div className="grid grid-cols-2 gap-2">
						{RUNTIMES.map(item => <button key={item.id} type="button" aria-pressed={runtime === item.id} disabled={busy} title={item.detail}
							onClick={() => { setRuntime(item.id); setSandbox(null); setError(null); }}
							className={cn("flex min-h-16 min-w-0 items-center gap-2.5 rounded-md border px-3 py-3 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50", runtime === item.id ? "border-[var(--ret-purple)]/60 bg-[var(--ret-purple-glow)]" : "border-[var(--ret-border)] hover:bg-[var(--ret-surface)]")}>
							<Logo mark={agentLogoMark(item.id)} size={22} /><span className="min-w-0 flex-1">{AGENT_LABEL[item.id]}</span>{runtime === item.id ? <Check size={16} aria-hidden="true" className="shrink-0 text-[var(--ret-purple)]" /> : null}
						</button>)}
					</div>
				</fieldset>
				<fieldset className="min-w-0">
					<legend className="mb-3 text-sm font-medium">Choose compute</legend>
					<div className="grid grid-cols-2 gap-2">
						{SANDBOXES.map(item => <button key={item.id} type="button" aria-pressed={sandbox === item.id} disabled={!runtime || !config || busy} title={item.detail}
							onClick={() => { setSandbox(item.id); setError(null); }}
							className={cn("flex min-h-16 min-w-0 items-center gap-2.5 rounded-md border px-3 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50", sandbox === item.id ? "border-[var(--ret-purple)]/60 bg-[var(--ret-purple-glow)]" : "border-[var(--ret-border)] enabled:hover:bg-[var(--ret-surface)]")}>
							<Logo mark={providerLogoMark(item.id)} size={22} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{PROVIDER_LABEL[item.id]}</span><span className="mt-0.5 block text-xs text-[var(--ret-text-muted)]">{!config ? "Loading configuration…" : config.providers[item.id]?.configured ? "Credentials saved" : "Credentials required"}</span></span>{sandbox === item.id ? <Check size={16} aria-hidden="true" className="shrink-0 text-[var(--ret-purple)]" /> : null}
						</button>)}
					</div>
				</fieldset>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4">
				<div className="min-w-0 flex-1" aria-live="polite">
					<p className="text-[15px] font-medium">{runtime && sandbox ? `${AGENT_LABEL[runtime]} on ${PROVIDER_LABEL[sandbox]}` : "Choose a runtime and compute account"}</p>
					<p className="mt-1 text-sm leading-5 text-[var(--ret-text-muted)]">{runtime && credentialVerdict && !credentialVerdict.ok ? credentialVerdict.message : sandbox && !config?.providers[sandbox]?.configured ? `Add ${PROVIDER_LABEL[sandbox]} credentials in Settings before launching.` : "Launching creates paid compute. Your providers bill you directly."}</p>
				</div>
				<button type="button" disabled={busy || !runtime || !sandbox || !config?.providers[sandbox]?.configured || !credentialVerdict?.ok} onClick={() => { if (sandbox) void launch(sandbox); }}
					className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--ret-text)] px-4 text-sm font-medium text-[var(--ret-bg)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
					{busy ? <LoaderCircle size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}{busy ? "Launching workspace…" : "Launch workspace"}
				</button>
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--ret-border)] px-4 py-2 text-xs text-[var(--ret-text-muted)]">
				<Link href="/dashboard/settings" className="min-h-8 content-center hover:underline focus-visible:outline-2">Model &amp; provider credentials</Link>
				<Link href="/dashboard/agents" className="min-h-8 content-center hover:underline focus-visible:outline-2">Save a template-based setup first</Link>
			</div>
			{error ? <div role="alert" className="border-t border-[var(--ret-red)]/30 px-4 py-3 text-sm leading-6 text-[var(--ret-red)]">{error} <Link href="/dashboard/settings" className="underline focus-visible:outline-2">Open Settings</Link></div> : null}
		</ReticleFrame>
	</section>;
}

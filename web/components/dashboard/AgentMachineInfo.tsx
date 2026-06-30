"use client";

import Link from "next/link";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { getAgentMeta } from "@/lib/agents";
import {
	type AgentUpstreamReadiness,
	agentUsesRouter,
	requiredNativeUpstream,
} from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";
import {
	PROVIDER_LABEL,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

/**
 * Reusable "what am I about to create" info panels for the spin-up form and
 * machine detail surfaces. AgentInfoPanel summarizes the agent runtime + its
 * upstream requirement (with an optional live readiness line); MachineInfoPanel
 * summarizes the substrate + spec and what provisioning materializes.
 */

const PROVIDER_MARK: Record<ProviderKind, "dedalus" | "e2b" | "sprites" | "vercel"> = {
	dedalus: "dedalus",
	e2b: "e2b",
	sprites: "sprites",
	vercel: "vercel",
};

const READINESS_TONE: Record<AgentUpstreamReadiness["status"], string> = {
	ready: "text-[var(--ret-green)]",
	fallback: "text-[var(--ret-amber)]",
	blocked: "text-[var(--ret-red)]",
};

const READINESS_GLYPH: Record<AgentUpstreamReadiness["status"], string> = {
	ready: "✓",
	fallback: "~",
	blocked: "!",
};

function upstreamSummary(agentKind: AgentKind): string {
	const native = requiredNativeUpstream(agentKind);
	if (native === "openai") return "Native OpenAI key (Responses API)";
	if (native === "anthropic") return "Native Anthropic key (Messages API)";
	if (agentUsesRouter(agentKind)) {
		return "Any OpenAI-compatible router (Vercel / OpenRouter / custom)";
	}
	return "—";
}

export function AgentInfoPanel({
	agentKind,
	readiness,
}: {
	agentKind: AgentKind;
	readiness?: AgentUpstreamReadiness;
}) {
	const meta = getAgentMeta(agentKind);
	return (
		<div className="grid min-w-0 content-start gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<Logo mark={meta.logoMark} size={14} className="shrink-0" />
				<span className="min-w-0 text-[13px] text-[var(--ret-text)]">{meta.name}</span>
				<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					by {meta.by}
				</span>
				<ReticleBadge>{meta.operationModel}</ReticleBadge>
			</div>
			<p className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
				{meta.capabilities}
			</p>
			<dl className="grid gap-1">
				<InfoRow label="runtime" value={meta.runCmd} mono />
				{meta.headlessCmd ? (
					<InfoRow label="headless" value={meta.headlessCmd} mono />
				) : null}
				<InfoRow label="upstream" value={upstreamSummary(agentKind)} />
			</dl>
			{readiness ? (
				<p className={cn("font-mono text-[10px] leading-relaxed", READINESS_TONE[readiness.status])}>
					{READINESS_GLYPH[readiness.status]} {readiness.detail}
				</p>
			) : null}
			<a
				href={meta.docsUrl}
				target="_blank"
				rel="noreferrer"
				className="w-fit font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-purple)]"
			>
				docs ↗
			</a>
		</div>
	);
}

export function MachineInfoPanel({
	provider,
	spec,
	configured,
}: {
	provider: ProviderKind;
	/** Omit on surfaces that use the provider default spec (e.g. one-click). */
	spec?: MachineSpec;
	/** Whether the substrate's provider key is on file (undefined = unknown). */
	configured?: boolean;
}) {
	return (
		<div className="grid min-w-0 content-start gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<Logo mark={PROVIDER_MARK[provider]} size={14} className="shrink-0" />
				<span className="text-[13px] text-[var(--ret-text)]">
					{PROVIDER_LABEL[provider]}
				</span>
				<ReticleBadge>substrate</ReticleBadge>
				{configured === false ? (
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-red)]">
						key missing
					</span>
				) : configured === true ? (
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-green)]">
						key ready
					</span>
				) : null}
			</div>
			{spec ? (
				<dl className="grid grid-cols-3 gap-1">
					<SpecCell label="vCPU" value={`${spec.vcpu}`} />
					<SpecCell label="memory" value={`${(spec.memoryMib / 1024).toFixed(1)} GiB`} />
					<SpecCell label="storage" value={`${spec.storageGib} GiB`} />
				</dl>
			) : null}
			<p className="text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
				Provisions an isolated{" "}
				<code className="font-mono text-[10px] text-[var(--ret-text)]">
					/home/machine
				</code>{" "}
				volume, a dedicated gateway port, and the agent runtime — bootstrapped
				on spin-up.
			</p>
		</div>
	);
}

/** Inline credential gate with a deep-link to where keys are added. Shared by
 *  every provisioning entry point so the "add a key" affordance is identical. */
export function GateBanner({ message }: { message: string }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 px-3 py-2">
			<p className="min-w-0 text-[11px] leading-relaxed text-[var(--ret-red)]">
				! {message}
			</p>
			<Link
				href="/dashboard/settings"
				className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-red)] underline underline-offset-2 hover:text-[var(--ret-text)]"
			>
				add a key in settings →
			</Link>
		</div>
	);
}

function InfoRow({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-2">
			<dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</dt>
			<dd
				className={cn(
					"min-w-0 break-words text-[11px] text-[var(--ret-text-dim)]",
					mono && "font-mono text-[10px] text-[var(--ret-text)]",
				)}
				title={value}
			>
				{value}
			</dd>
		</div>
	);
}

function SpecCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<span className="font-mono text-[11px] text-[var(--ret-text)]">{value}</span>
		</div>
	);
}

"use client";

import Link from "next/link";
import { ExternalLink } from "@/components/ui/icons";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { StatusGlyph } from "@/components/ui/StatusGlyph";
import { getAgentMeta } from "@/lib/agents";
import {
	type AgentUpstreamReadiness,
	agentUsesRouter,
	requiredNativeUpstream,
} from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";
import { normalizeMachineSpec, specMemoryGib } from "@/lib/fleet/view-model";
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

const PROVIDER_MARK: Record<ProviderKind, "daytona" | "e2b" | "sprites" | "vercel" | "retired"> = {
	dedalus: "retired",
	daytona: "daytona",
	e2b: "e2b",
	sprites: "sprites",
	vercel: "vercel",
};

const READINESS_TONE: Record<AgentUpstreamReadiness["status"], string> = {
	ready: "text-[var(--ret-green)]",
	fallback: "text-[var(--ret-amber)]",
	blocked: "text-[var(--ret-red)]",
};

const READINESS_GLYPH = {
	ready: "success",
	fallback: "warning",
	blocked: "error",
} as const;

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
		<div className={cn("grid min-w-0 content-start gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4")}>
			<div className={cn("flex min-w-0 flex-wrap items-center gap-2")}>
				<Logo mark={meta.logoMark} size={24} className={cn("shrink-0")} />
				<span className={cn("min-w-0 text-[18px] font-medium text-[var(--ret-text)]")}>{meta.name}</span>
				<span className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
					by {meta.by}
				</span>
				<ReticleBadge className={cn("text-[13px]")}>{meta.operationModel}</ReticleBadge>
			</div>
			<p className={cn("text-[14px] leading-relaxed text-[var(--ret-text-dim)]")}>
				{meta.capabilities}
			</p>
			<dl className={cn("grid gap-1")}>
				<InfoRow label="runtime" value={meta.runCmd} mono />
				{meta.headlessCmd ? (
					<InfoRow label="headless" value={meta.headlessCmd} mono />
				) : null}
				<InfoRow label="upstream" value={upstreamSummary(agentKind)} />
			</dl>
			{readiness ? (
				<p className={cn("flex items-start gap-1.5 text-[14px] leading-relaxed", READINESS_TONE[readiness.status])}>
					<StatusGlyph status={READINESS_GLYPH[readiness.status]} size={18} className={cn("mt-0.5 shrink-0")} />
					{readiness.detail}
				</p>
			) : null}
			<a
				href={meta.docsUrl}
				target="_blank"
				rel="noreferrer"
				className={cn("flex w-fit items-center gap-1.5 text-sm text-[var(--ret-text-muted)] outline-none hover:text-[var(--ret-purple)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}
			>
				Documentation <ExternalLink size={16} aria-hidden="true" />
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
		<div className={cn("grid min-w-0 content-start gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4")}>
			<div className={cn("flex min-w-0 flex-wrap items-center gap-2")}>
				<Logo mark={PROVIDER_MARK[provider]} size={24} className={cn("shrink-0")} />
				<span className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>
					{PROVIDER_LABEL[provider]}
				</span>
				<ReticleBadge className={cn("text-[13px]")}>Workspace</ReticleBadge>
				{configured === false ? (
					<span className={cn("text-[14px] text-[var(--ret-red)]")}>
						Key missing
					</span>
				) : configured === true ? (
					<span className={cn("text-[14px] text-[var(--ret-green)]")}>
						Key ready
					</span>
				) : null}
			</div>
			{spec ? (
				<dl className={cn("grid grid-cols-3 gap-1")} aria-label="Requested sizing">
					<SpecCell label="requested vCPU" value={`${normalizeMachineSpec(spec).vcpu ?? "—"}`} />
					<SpecCell label="requested memory" value={specMemoryGib(spec)} />
					<SpecCell label="requested storage" value={`${normalizeMachineSpec(spec).storageGib ?? "—"} GiB`} />
				</dl>
			) : null}
			<p className={cn("text-[14px] leading-relaxed text-[var(--ret-text-dim)]")}>
				Creates a cloud workspace and prepares the selected runtime. Requested
				sizing is intent; the provider-reported allocation appears after launch.
			</p>
			{provider === "e2b" ? (
				<p className={cn("text-[14px] leading-relaxed text-[var(--ret-amber)]")}>
					E2B allocation is defined by its template. Sizing requests do not resize
					the sandbox; a larger allocation requires a suitable E2B template.
				</p>
			) : null}
		</div>
	);
}

/** Inline credential gate with a deep-link to where keys are added. Shared by
 *  every provisioning entry point so the "add a key" affordance is identical. */
export function GateBanner({ message }: { message: string }) {
	return (
		<div className={cn("flex flex-wrap items-center justify-between gap-2 border border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 px-3 py-2")}>
			<p className={cn("min-w-0 text-[14px] leading-relaxed text-[var(--ret-red)]")}>
				! {message}
			</p>
			<Link
				href="/dashboard/settings"
				className={cn("shrink-0 text-sm text-[var(--ret-red)] underline underline-offset-2 outline-none hover:text-[var(--ret-text)] focus-visible:ring-2 focus-visible:ring-[var(--ret-red)]")}
			>
				Add a key in Settings <ExternalLink size={16} aria-hidden="true" className={cn("inline")} />
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
		<div className={cn("grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-3")}>
			<dt className={cn("text-sm text-[var(--ret-text-muted)] first-letter:uppercase")}>
				{label}
			</dt>
			<dd
				className={cn(
					"min-w-0 break-words text-[14px] text-[var(--ret-text-dim)]",
					mono && "font-mono text-[var(--ret-text)]",
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
		<div className={cn("flex flex-col gap-0.5")}>
			<span className={cn("text-[13px] text-[var(--ret-text-muted)] first-letter:uppercase")}>
				{label}
			</span>
			<span className={cn("text-[14px] text-[var(--ret-text)]")}>{value}</span>
		</div>
	);
}

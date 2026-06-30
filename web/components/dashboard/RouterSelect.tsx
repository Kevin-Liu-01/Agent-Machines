"use client";

import { ReticleSelect } from "@/components/reticle/ReticleSelect";
import {
	ROUTER_PRESETS,
	agentUsesRouter,
	nativeUpstreamLabel,
	requiredNativeUpstream,
} from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";
import type { AgentKind } from "@/lib/user-config/schema";

type Props = {
	agentKind: AgentKind | null | undefined;
	value: string;
	onChange: (id: string) => void;
	/** Map of which model provider keys are configured (openrouter/openai/anthropic/...). */
	aiConfigured: Record<string, boolean>;
	disabled?: boolean;
	label?: string;
};

/**
 * Choose the LLM upstream for a machine. hermes/openclaw get a router preset
 * dropdown (Vercel AI Gateway / OpenRouter / OpenAI / Google /
 * custom) so they can use the gateway order; codex/claude show their fixed
 * native-key requirement.
 */
export function RouterSelect({
	agentKind,
	value,
	onChange,
	aiConfigured,
	disabled,
	label = "model router (Vercel first)",
}: Props) {
	const native = agentKind ? requiredNativeUpstream(agentKind) : null;

	if (native) {
		const ok = Boolean(aiConfigured[native]);
		return (
			<p
				className={cn(
					"font-mono text-[10px] tracking-[0.04em]",
					ok ? "text-[var(--ret-text-muted)]" : "text-[var(--ret-amber)]",
				)}
			>
				{ok
					? `Uses your ${nativeUpstreamLabel(native)} key.`
					: `Needs native ${native === "openai" ? "OpenAI" : "Anthropic"} key. Add one in Settings, or pick Hermes/OpenClaw.`}
			</p>
		);
	}

	if (!agentUsesRouter(agentKind ?? "hermes")) return null;

	return (
		<div className="grid gap-1">
			<label className="grid w-full max-w-[280px] gap-1">
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{label}
				</span>
				{disabled ? (
					<div className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1.5 font-mono text-[11px] text-[var(--ret-text-muted)]">
						{ROUTER_PRESETS.find((p) => p.id === value)?.label ?? value}
					</div>
				) : (
					<ReticleSelect
						ariaLabel={label}
						value={value}
						onChange={onChange}
						options={ROUTER_PRESETS.map((p) => ({
							value: p.id,
							label: `${p.label}${aiConfigured[p.source] ? "" : " — needs key"}`,
						}))}
					/>
				)}
			</label>
			{!aiConfigured[ROUTER_PRESETS.find((p) => p.id === value)?.source ?? ""] ? (
				<span className="font-mono text-[10px] text-[var(--ret-amber)]">
					This router has no key. Add one in Settings. Bootstrap can use fallbacks.
				</span>
			) : null}
		</div>
	);
}

"use client";

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
	/** Map of which provider keys are configured (dedalus/openai/anthropic/...). */
	aiConfigured: Record<string, boolean>;
	disabled?: boolean;
	label?: string;
};

/**
 * Choose the LLM upstream for a machine. hermes/openclaw get a router preset
 * dropdown (Dedalus / Vercel AI Gateway / OpenAI / OpenRouter / Google /
 * custom) so they aren't locked to Dedalus; codex/claude show their fixed
 * native-key requirement.
 */
export function RouterSelect({
	agentKind,
	value,
	onChange,
	aiConfigured,
	disabled,
	label = "model router (not locked to Dedalus)",
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
					: `Needs a native ${native === "openai" ? "OpenAI" : "Anthropic"} key — the Dedalus router can't drive this CLI. Add one in Settings, or pick Hermes/OpenClaw.`}
			</p>
		);
	}

	if (!agentUsesRouter(agentKind ?? "hermes")) return null;

	return (
		<div className="grid gap-1">
			<label className="grid w-fit gap-1">
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{label}
				</span>
				<select
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[11px] text-[var(--ret-text)] outline-none"
				>
					{ROUTER_PRESETS.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
							{aiConfigured[p.source] ? "" : " — needs key"}
						</option>
					))}
				</select>
			</label>
			{!aiConfigured[ROUTER_PRESETS.find((p) => p.id === value)?.source ?? ""] ? (
				<span className="font-mono text-[10px] text-[var(--ret-amber)]">
					This router has no key yet — add one in Settings, or bootstrap falls back to your first configured provider.
				</span>
			) : null}
		</div>
	);
}

"use client";

import { useEffect, useState } from "react";

import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { RouterSelect } from "@/components/dashboard/RouterSelect";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { DEFAULT_ROUTER_ID } from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Per-machine "change router" control. Switches the machine's model upstream
 * (gateway profile / router preset) and persists it via PATCH. Takes effect on
 * the next bootstrap / wake of the agent.
 */
export function MachineRouterCard() {
	const ctx = useOptionalMachineContext();
	const machineId = ctx?.machineId;
	const agentKind = ctx?.machine?.agentKind ?? null;
	const [value, setValue] = useState<string>(
		ctx?.machine?.gatewayProfileId ?? DEFAULT_ROUTER_ID,
	);
	const [aiConfigured, setAiConfigured] = useState<Record<string, boolean>>({});
	const [status, setStatus] = useState<Status>("idle");
	const [detail, setDetail] = useState<string>("");

	useEffect(() => {
		let alive = true;
		void fetch("/api/dashboard/admin/settings")
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				if (!alive || !j?.config) return;
				const ai = (j.config.aiProviders ?? {}) as Record<string, { configured?: boolean }>;
				const conf: Record<string, boolean> = {};
				for (const k of Object.keys(ai)) conf[k] = Boolean(ai[k]?.configured);
				conf.dedalus = Boolean(j.config.providers?.dedalus?.configured);
				setAiConfigured(conf);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	const save = async (id: string) => {
		if (!machineId) return;
		setValue(id);
		setStatus("saving");
		setDetail("");
		try {
			const r = await fetch(`/api/dashboard/machines/${machineId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ gatewayProfileId: id }),
			});
			if (!r.ok) {
				const e = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
				setStatus("error");
				setDetail(e.message ?? e.error ?? `HTTP ${r.status}`);
				return;
			}
			setStatus("saved");
			setDetail("Saved — re-bootstrap or wake the machine to apply it to the running agent.");
		} catch (err) {
			setStatus("error");
			setDetail(err instanceof Error ? err.message : "save failed");
		}
	};

	return (
		<div className="mx-5 mt-5 grid gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4">
			<div className="flex items-center justify-between gap-2">
				<ReticleLabel>model router</ReticleLabel>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					which LLM upstream this agent talks to
				</span>
			</div>
			<RouterSelect
				agentKind={agentKind}
				value={value}
				onChange={save}
				aiConfigured={aiConfigured}
				disabled={status === "saving"}
			/>
			{status !== "idle" && detail ? (
				<p
					className={cn(
						"font-mono text-[10px] tracking-[0.04em]",
						status === "error" ? "text-[var(--ret-red)]" : "text-[var(--ret-text-dim)]",
					)}
				>
					{detail}
				</p>
			) : null}
		</div>
	);
}

"use client";

import { useEffect, useRef, useState } from "react";

import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { RouterSelect } from "@/components/dashboard/RouterSelect";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { DEFAULT_ROUTER_ID } from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";
import { requestMachineRuntimeUpdate } from "@/lib/dashboard/machine-runtime-update";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Per-machine "change router" control. Switches the machine's model upstream
 * (gateway profile / router preset) through a journaled runtime update.
 * Paused Workers retain the desired change until their next explicit wake.
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
	const targetRef = useRef(machineId);
	targetRef.current = machineId;
	const mountedRef = useRef(true);
	useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
	useEffect(() => {
		setValue(ctx?.machine?.gatewayProfileId ?? DEFAULT_ROUTER_ID);
		setStatus("idle"); setDetail("");
	}, [machineId, ctx?.machine?.gatewayProfileId]);

	useEffect(() => {
		let alive = true;
		void fetch("/api/dashboard/admin/settings")
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				if (!alive || !j?.config) return;
				const ai = (j.config.aiProviders ?? {}) as Record<string, { configured?: boolean }>;
				const conf: Record<string, boolean> = {};
				for (const k of Object.keys(ai)) conf[k] = Boolean(ai[k]?.configured);
				conf.daytona = Boolean(j.config.providers?.daytona?.configured);
				setAiConfigured(conf);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	const save = async (id: string) => {
		if (!machineId || status === "saving") return;
		const selectedTarget = machineId;
		const previous = value;
		const isCurrent = () => mountedRef.current && targetRef.current === selectedTarget;
		setValue(id);
		setStatus("saving");
		setDetail("");
		try {
			const message = await requestMachineRuntimeUpdate(selectedTarget, { gatewayProfileId: id }, (progress) => { if (isCurrent()) setDetail(progress); });
			if (isCurrent()) { setStatus("saved"); setDetail(message); }
		} catch (err) {
			if (isCurrent()) {
				setValue(previous); setStatus("error");
				setDetail(err instanceof Error ? err.message : "Runtime update failed.");
			}
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
					role={status === "error" ? "alert" : "status"}
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

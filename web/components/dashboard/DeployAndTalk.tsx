"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { RouterSelect } from "@/components/dashboard/RouterSelect";
import { DEFAULT_ROUTER_ID, agentUsesRouter } from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";

type Phase = "idle" | "provisioning" | "bootstrapping" | "ready" | "error";

const PROVIDERS = ["sprites", "e2b", "vercel", "dedalus"] as const;
const AGENTS = ["codex", "claude-code", "openclaw", "hermes"] as const;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * One-click: provision a machine, bootstrap the agent, then drop the user
 * straight into the interactive console with the agent CLI auto-launched
 * (`?launch=1`). Polls bootstrap phase for live progress.
 */
export function DeployAndTalk() {
	const router = useRouter();
	const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("sprites");
	const [agent, setAgent] = useState<(typeof AGENTS)[number]>("codex");
	const [phase, setPhase] = useState<Phase>("idle");
	const [detail, setDetail] = useState<string>("");
	const [aiConfigured, setAiConfigured] = useState<Record<string, boolean>>({});
	const [gatewayProfileId, setGatewayProfileId] = useState<string>(DEFAULT_ROUTER_ID);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const busy = phase === "provisioning" || phase === "bootstrapping";

	// Load which provider keys are configured (drives the router "needs key" hints).
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

	const run = useCallback(async () => {
		setPhase("provisioning");
		setDetail("requesting a machine...");
		try {
			const prov = await fetch("/api/dashboard/admin/provision-machine", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					providerKind: provider,
					agentKind: agent,
					force: true,
					...(agentUsesRouter(agent) && gatewayProfileId ? { gatewayProfileId } : {}),
				}),
			});
			const provJson = (await prov.json()) as { ok?: boolean; machineId?: string; message?: string; error?: string };
			if (!prov.ok || !provJson.machineId) {
				setPhase("error");
				setDetail(provJson.message ?? provJson.error ?? "provision failed");
				return;
			}
			const machineId = provJson.machineId;

			setPhase("bootstrapping");
			setDetail("installing the agent (this can take a few minutes)...");

			// Poll bootstrap phase for live progress while the bootstrap POST runs.
			pollRef.current = setInterval(async () => {
				try {
					const r = await fetch(`/api/dashboard/machines/${machineId}`, { cache: "no-store" });
					if (!r.ok) return;
					const j = (await r.json()) as { machine?: { bootstrapState?: { current?: string | null; phase?: string } } };
					const cur = j.machine?.bootstrapState?.current;
					if (cur) setDetail(`bootstrapping · ${cur}`);
				} catch {
					// transient
				}
			}, 2_500);

			const boot = await fetch("/api/dashboard/admin/bootstrap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId }),
			});
			if (pollRef.current) clearInterval(pollRef.current);
			const bootJson = (await boot.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
			if (!boot.ok || bootJson.ok === false) {
				setPhase("error");
				setDetail(bootJson.message ?? bootJson.error ?? "bootstrap failed");
				return;
			}

			setPhase("ready");
			setDetail("agent ready — opening console...");
			await sleep(600);
			router.push(`/dashboard/machines/${machineId}/terminal?launch=1`);
		} catch (err) {
			if (pollRef.current) clearInterval(pollRef.current);
			setPhase("error");
			setDetail(err instanceof Error ? err.message : "deploy failed");
		}
	}, [provider, agent, router, gatewayProfileId]);

	return (
		<div className="grid gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4">
			<div className="flex items-center justify-between gap-2">
				<ReticleLabel>one-click — deploy, bootstrap, talk</ReticleLabel>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					provision → bootstrap → interactive agent CLI
				</span>
			</div>

			<div className="flex flex-wrap items-end gap-3">
				<label className="grid gap-1">
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">substrate</span>
					<select
						value={provider}
						onChange={(e) => setProvider(e.target.value as (typeof PROVIDERS)[number])}
						disabled={busy}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[11px] text-[var(--ret-text)] outline-none"
					>
						{PROVIDERS.map((p) => (
							<option key={p} value={p}>{p}</option>
						))}
					</select>
				</label>
				<label className="grid gap-1">
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">agent</span>
					<select
						value={agent}
						onChange={(e) => setAgent(e.target.value as (typeof AGENTS)[number])}
						disabled={busy}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[11px] text-[var(--ret-text)] outline-none"
					>
						{AGENTS.map((a) => (
							<option key={a} value={a}>{a}</option>
						))}
					</select>
				</label>
				<ReticleButton as="button" type="button" variant="primary" size="sm" disabled={busy} onClick={() => void run()}>
					{busy ? "deploying..." : "Deploy & Talk"}
				</ReticleButton>
				{busy ? <BrailleSpinner name="cascade" className="text-[var(--ret-purple)]" /> : null}
			</div>

			<RouterSelect
				agentKind={agent}
				value={gatewayProfileId}
				onChange={setGatewayProfileId}
				aiConfigured={aiConfigured}
				disabled={busy}
			/>

			{phase !== "idle" ? (
				<p
					className={cn(
						"font-mono text-[11px]",
						phase === "error" ? "text-[var(--ret-red)]" : "text-[var(--ret-text-dim)]",
					)}
				>
					{detail}
				</p>
			) : null}
		</div>
	);
}

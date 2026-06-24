"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentInfoPanel, GateBanner, MachineInfoPanel } from "@/components/dashboard/AgentMachineInfo";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticleSelect } from "@/components/reticle/ReticleSelect";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { RouterSelect } from "@/components/dashboard/RouterSelect";
import { DEFAULT_ROUTER_ID, agentUpstreamReadiness, agentUsesRouter } from "@/lib/agents/upstreams";
import { cn } from "@/lib/cn";
import type { ProviderKind, PublicUserConfig } from "@/lib/user-config/schema";

type Phase = "idle" | "provisioning" | "bootstrapping" | "ready" | "error";

const PROVIDERS = ["dedalus", "sprites", "e2b", "vercel"] as const;
const AGENTS = ["openclaw", "hermes", "codex", "claude-code"] as const;

type EnvironmentOption = PublicUserConfig["environmentProfiles"][number];

function isProvider(value: unknown): value is (typeof PROVIDERS)[number] {
	return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

function isAgent(value: unknown): value is (typeof AGENTS)[number] {
	return typeof value === "string" && (AGENTS as readonly string[]).includes(value);
}

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
	const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("dedalus");
	const [agent, setAgent] = useState<(typeof AGENTS)[number]>("openclaw");
	const [phase, setPhase] = useState<Phase>("idle");
	const [detail, setDetail] = useState<string>("");
	// null until loaded so the credential gate doesn't pre-block.
	const [aiConfigured, setAiConfigured] = useState<Record<string, boolean> | null>(null);
	const [providerConfigured, setProviderConfigured] = useState<Record<string, boolean> | null>(null);
	const [gatewayProfileId, setGatewayProfileId] = useState<string>(DEFAULT_ROUTER_ID);
	const [environmentProfiles, setEnvironmentProfiles] = useState<EnvironmentOption[]>([]);
	const [environmentProfileId, setEnvironmentProfileId] = useState<string>("");
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const busy = phase === "provisioning" || phase === "bootstrapping";

	// Load which provider keys are configured (drives the router hints + gate).
	useEffect(() => {
		let alive = true;
		void fetch("/api/dashboard/admin/settings")
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				if (!alive || !j?.config) return;
				const config = j.config as PublicUserConfig;
				const ai = (config.aiProviders ?? {}) as Record<string, { configured?: boolean }>;
				const conf: Record<string, boolean> = {};
				for (const k of Object.keys(ai)) conf[k] = Boolean(ai[k]?.configured);
				conf.dedalus = Boolean(config.providers?.dedalus?.configured);
				setAiConfigured(conf);
				const provs = (config.providers ?? {}) as Record<string, { configured?: boolean }>;
				const pconf: Record<string, boolean> = {};
				for (const k of Object.keys(provs)) pconf[k] = Boolean(provs[k]?.configured);
				setProviderConfigured(pconf);
				setEnvironmentProfiles(config.environmentProfiles ?? []);
				setEnvironmentProfileId((current) =>
					current || config.environmentProfiles[0]?.id || "",
				);
				if (isProvider(config.draftProviderKind)) setProvider(config.draftProviderKind);
				if (isAgent(config.draftAgentKind)) setAgent(config.draftAgentKind);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	// Credential gate: block deploy when the agent has no usable upstream key
	// or the substrate provider has no key. Neutral while config loads (null).
	const readiness = aiConfigured
		? agentUpstreamReadiness(agent, gatewayProfileId, aiConfigured)
		: null;
	const upstreamBlocked = readiness?.status === "blocked";
	const substrateMissing = providerConfigured !== null && !providerConfigured[provider];
	const blocked = Boolean(upstreamBlocked || substrateMissing);

	const run = useCallback(async () => {
		if (blocked) return;
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
					...(environmentProfileId ? { environmentProfileId } : {}),
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
			await sleep(150);
			router.push(`/dashboard/machines/${machineId}/console`);
		} catch (err) {
			if (pollRef.current) clearInterval(pollRef.current);
			setPhase("error");
			setDetail(err instanceof Error ? err.message : "deploy failed");
		}
	}, [provider, agent, router, gatewayProfileId, environmentProfileId, blocked]);

	return (
		<div className="grid min-w-0 gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4">
			<div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
				<ReticleLabel>one-click — deploy, bootstrap, talk</ReticleLabel>
				<span className="min-w-0 break-words font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] sm:text-right">
					provision → bootstrap → interactive agent CLI
				</span>
			</div>

			<div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
				<label className="grid min-w-0 gap-1 lg:w-40">
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">substrate</span>
					<ReticleSelect
						ariaLabel="substrate"
						value={provider}
						onChange={(v) => setProvider(v as (typeof PROVIDERS)[number])}
						options={PROVIDERS.map((p) => ({ value: p, label: p }))}
					/>
				</label>
				<label className="grid min-w-0 gap-1 lg:w-40">
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">agent</span>
					<ReticleSelect
						ariaLabel="agent"
						value={agent}
						onChange={(v) => setAgent(v as (typeof AGENTS)[number])}
						options={AGENTS.map((a) => ({ value: a, label: a }))}
					/>
				</label>
				{environmentProfiles.length > 0 ? (
					<label className="grid min-w-0 gap-1 lg:w-44">
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">env</span>
						<ReticleSelect
							ariaLabel="environment profile"
							value={environmentProfileId}
							onChange={setEnvironmentProfileId}
							options={[
								{ value: "", label: "none" },
								...environmentProfiles.map((profile) => ({
									value: profile.id,
									label: `${profile.name} · ${profile.varCount}`,
								})),
							]}
						/>
					</label>
				) : null}
				<ReticleButton
					as="button"
					type="button"
					variant="primary"
					size="sm"
					disabled={busy || blocked}
					title={blocked ? "Add the missing key in Settings to deploy" : undefined}
					onClick={() => void run()}
					className="w-full sm:w-auto lg:self-end"
				>
					{busy ? "deploying..." : blocked ? "missing key" : "Deploy & Talk"}
				</ReticleButton>
				{busy ? <BrailleSpinner name="cascade" className="text-[var(--ret-purple)]" /> : null}
			</div>

			<RouterSelect
				agentKind={agent}
				value={gatewayProfileId}
				onChange={setGatewayProfileId}
				aiConfigured={aiConfigured ?? {}}
				disabled={busy}
			/>

			<div className="grid gap-3 md:grid-cols-2">
				<AgentInfoPanel agentKind={agent} readiness={readiness ?? undefined} />
				<MachineInfoPanel
					provider={provider as ProviderKind}
					configured={providerConfigured ? providerConfigured[provider] : undefined}
				/>
			</div>

			{substrateMissing ? (
				<GateBanner message={`No ${provider} key on file — provisioning needs the substrate credential.`} />
			) : null}
			{upstreamBlocked && readiness ? <GateBanner message={readiness.detail} /> : null}

			{phase !== "idle" ? (
				<p
					className={cn(
						"min-w-0 break-words font-mono text-[11px]",
						phase === "error" ? "text-[var(--ret-red)]" : "text-[var(--ret-text-dim)]",
					)}
				>
					{detail}
				</p>
			) : null}
		</div>
	);
}

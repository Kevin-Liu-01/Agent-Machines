"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { AgentInfoPanel, MachineInfoPanel } from "@/components/dashboard/AgentMachineInfo";
import { BootTranscript } from "@/components/dashboard/BootTranscript";
import { RouterSelect } from "@/components/dashboard/RouterSelect";
import { Logo, type Mark } from "@/components/Logo";
import { providerLogoMark } from "@/lib/fleet/logos";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WingBackground } from "@/components/WingBackground";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { waitForControlPlaneOperation } from "@/lib/control-plane/client";
import { onboardingProviderReady, onboardingWorkspaceUrl, submitOnboardingLaunch, type OnboardingLaunch } from "@/lib/onboarding/launch";
import { selectedPreset as resolveSelectedPreset } from "@/lib/onboarding/preset-selection";
import {
	agentCredentialRequirements,
	canBootstrapAgent,
	type DraftAiKeys,
} from "@/lib/agents/credentials";
import {
	type AgentUpstreamReadiness,
	DEFAULT_ROUTER_ID,
	agentUpstreamReadiness,
	agentUsesRouter,
} from "@/lib/agents/upstreams";
import type { Preset } from "@/lib/dashboard/presets";
import {
	AGENT_LABEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
	type AgentKind,
	type ProviderKind,
	type PublicUserConfig,
} from "@/lib/user-config/schema";

const MARK_SET = new Set<string>(["am", "dedalus", "nous", "cursor", "openclaw", "anthropic", "openai"]);
function isMark(value: string): value is Mark { return MARK_SET.has(value); }

type OnboardingAiKeys = {
	vercelAiGateway: string;
	openrouter: string;
	anthropic: string;
	openai: string;
};

type OnboardingAiKeyField = keyof OnboardingAiKeys;

type Props = {
	initialConfig: PublicUserConfig;
	presets: Preset[];
	initialPresetId?: string;
};

type Step = "agent" | "preset" | "provider" | "key" | "boot";

const STEPS: ReadonlyArray<{ id: Step; label: string; hint: string }> = [
	{ id: "agent", label: "Agent", hint: "how it works" },
	{ id: "preset", label: "Preset", hint: "starting instructions" },
	{ id: "provider", label: "Provider", hint: "where it runs" },
	{ id: "key", label: "Keys", hint: "connect accounts" },
	{ id: "boot", label: "Launch", hint: "prepare your Worker" },
];

/** Sentinel preset id for "start blank, no preset". */
const NO_PRESET = "__none__";

const PROVIDERS_META: Record<
	ProviderKind,
	{
		name: string;
		tagline: string;
		keyLabel: string;
		keyPlaceholder: string;
		keyHint: string;
		secondaryFields?: ReadonlyArray<{
			label: string;
			placeholder: string;
			field: string;
		}>;
	}
> = {
	dedalus: {
		name: "Dedalus Machines",
		tagline:
			"Linux machines with persistent disk and preview tunnels. Manual pause is not available through the public adapter.",
		keyLabel: "Dedalus API key",
		keyPlaceholder: "dsk-live-...",
		keyHint: "Get one at dedaluslabs.ai/dashboard/api-keys",
	},
	sprites: {
		name: "Sprites",
		tagline:
			"Linux sandboxes with persistent files, automatic idle sleep, wake on use, and checkpoints.",
		keyLabel: "Sprites token",
		keyPlaceholder: "Your Sprites API token",
		keyHint: "Get one at sprites.dev/account",
	},
	e2b: {
		name: "E2B Sandbox",
		tagline:
			"Linux sandboxes with pause and resume, filesystem and memory snapshots, and per-port URLs.",
		keyLabel: "E2B API key",
		keyPlaceholder: "e2b_...",
		keyHint: "Get one at e2b.dev/dashboard",
	},
	vercel: {
		name: "Vercel Sandbox",
		tagline:
			"Linux microVMs that save filesystem snapshots on stop. Resume the saved workspace; running processes must restart.",
		keyLabel: "Vercel access token",
		keyPlaceholder: "token…",
		keyHint: "Use a Vercel access token with its Team ID and Project ID, or credentials already configured for your account.",
		secondaryFields: [
			{ label: "Team ID", placeholder: "team_…", field: "teamId" },
			{ label: "Project ID", placeholder: "prj_…", field: "projectId" },
		],
	},
};

const COMPARISON_ROWS: ReadonlyArray<{
	label: string;
	dedalus: string;
	e2b: string;
	sprites: string;
	vercel: string;
}> = [
	{ label: "Type", dedalus: "Persistent VM", e2b: "Pausable sandbox", sprites: "Persistent sandbox", vercel: "Persistent microVM" },
	{ label: "Environment", dedalus: "Linux", e2b: "Linux", sprites: "Linux", vercel: "Linux" },
	{ label: "Sleep / wake", dedalus: "No manual pause", e2b: "Pause / resume", sprites: "Automatic idle suspension", vercel: "Snapshot / resume" },
	{ label: "First launch", dedalus: "Includes runtime setup", e2b: "Includes runtime setup", sprites: "Includes runtime setup", vercel: "Includes runtime setup" },
	{ label: "Storage", dedalus: "Persistent disk", e2b: "Retained across pause", sprites: "Persistent filesystem", vercel: "Filesystem snapshots" },
	{ label: "Workspace URLs", dedalus: "Preview tunnels", e2b: "Per-port host", sprites: "Per-sprite URL", vercel: "Per-port URL" },
	{ label: "Snapshots", dedalus: "Not exposed", e2b: "Filesystem and memory", sprites: "Checkpoints", vercel: "Filesystem only" },
	{ label: "Limits", dedalus: "Account-dependent", e2b: "Plan-dependent", sprites: "Account-dependent", vercel: "Plan-dependent" },
	{ label: "Credentials", dedalus: "API key", e2b: "API key", sprites: "API token", vercel: "Token, team, and project" },
];

const AGENT_DESC: Record<
	AgentKind,
	{
		name: string;
		mark: "nous" | "openclaw" | "claudecode" | "codex";
		tagline: string;
		bullets: string[];
		links: ReadonlyArray<{ label: string; href: string }>;
	}
> = {
	hermes: {
		name: "Hermes",
		mark: "nous",
		tagline: "Research and ongoing tasks with saved context.",
		bullets: [
			"Keeps memory files in the Worker's home directory",
			"Saves conversation history for inspection in Sessions",
			"Recurring work starts only after you configure and enable a schedule",
		],
		links: [
			{ label: "Source", href: "https://github.com/NousResearch/hermes-agent" },
			{ label: "Documentation", href: "https://hermes-agent.nousresearch.com/docs/" },
		],
	},
	openclaw: {
		name: "OpenClaw",
		mark: "openclaw",
		tagline: "Browser and shell tasks with saved context.",
		bullets: [
			"Keeps runtime state in .openclaw under the Worker's home directory",
			"Uses browser tools when installed and configured",
			"Runs from the Console or terminal; its optional HTTP gateway is separate",
		],
		links: [
			{ label: "Source", href: "https://github.com/openclaw/openclaw" },
			{ label: "Legacy integration example", href: "https://github.com/dedalus-labs/openclaw-ddls" },
		],
	},
	"claude-code": {
		name: "Claude Code",
		mark: "claudecode",
		tagline: "Edit, debug, and test with Claude Code.",
		bullets: [
			"Uses the native Claude Code CLI in your Worker's workspace",
			"Run tasks from the Console or work in an interactive terminal",
			"API-key setup supports automated runs; terminal sign-in is a separate step",
		],
		links: [
			{ label: "Source", href: "https://github.com/anthropics/claude-code" },
			{ label: "Documentation", href: "https://code.claude.com/docs/" },
		],
	},
	codex: {
		name: "Codex CLI",
		mark: "codex",
		tagline: "Write code and run tests with Codex.",
		bullets: [
			"Uses the native Codex CLI in your Worker's workspace",
			"Run tasks from the Console or work in an interactive terminal",
			"Keeps native session history for inspection in Sessions",
		],
		links: [
			{ label: "Source", href: "https://github.com/openai/codex" },
			{ label: "Documentation", href: "https://developers.openai.com/codex/" },
		],
	},
};

export function OnboardingFlow({ initialConfig, presets, initialPresetId }: Props) {
	const router = useRouter();
	const initialPreset = resolveSelectedPreset(presets, initialPresetId);
	const [step, setStep] = useState<Step>("agent");
	const [agent, setAgent] = useState<AgentKind>(
		initialPreset?.agentKind ?? initialConfig.draftAgentKind ?? "hermes",
	);
	const [provider, setProvider] = useState<ProviderKind>(
		initialConfig.draftProviderKind ?? "dedalus",
	);
	const [routerId, setRouterId] = useState<string>(DEFAULT_ROUTER_ID);
	const [model, setModel] = useState("");
	const wizardAiConfigured = useMemo(() => {
		const ai = (initialConfig.aiProviders ?? {}) as Record<string, { configured?: boolean }>;
		const conf: Record<string, boolean> = {};
		for (const k of Object.keys(ai)) conf[k] = Boolean(ai[k]?.configured);
		return conf;
	}, [initialConfig]);
	// Default to the first curated preset (the "core starter"); NO_PRESET = blank.
	const [presetId, setPresetId] = useState<string>(initialPreset?.id ?? presets[0]?.id ?? NO_PRESET);
	const selectedPreset = useMemo(
		() => presets.find((p) => p.id === presetId) ?? null,
		[presets, presetId],
	);
	const [providerKey, setProviderKey] = useState("");
	const [aiKeys, setAiKeys] = useState<OnboardingAiKeys>({
		vercelAiGateway: "",
		openrouter: "",
		anthropic: "",
		openai: "",
	});
	const [providerSecondary, setProviderSecondary] = useState<
		Record<string, string>
	>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Boot state
	const [bootMachineId, setBootMachineId] = useState<string | null>(null);
	const [bootPhase, setBootPhase] = useState<string | null>(null);
	const [bootDone, setBootDone] = useState(false);
	const launchRef = useRef<(OnboardingLaunch & { intent: string }) | null>(null);
	const launchingRef = useRef(false);

	const hasKey = initialConfig.providers[provider].configured;

	function next() {
		const order = STEPS.map((s) => s.id);
		const i = order.indexOf(step);
		if (i < order.length - 1) setStep(order[i + 1]);
	}
	function back() {
		const order = STEPS.map((s) => s.id);
		const i = order.indexOf(step);
		if (i > 0) setStep(order[i - 1]);
	}

	const provision = useCallback(async () => {
		if (launchingRef.current) return;
		launchingRef.current = true;
		setBusy(true);
		setError(null);
		try {
			// Build provider-specific credentials payload.
			const setupBody: Record<string, unknown> = {
				draftAgentKind: agent,
				draftProviderKind: provider,
			};
			if (providerKey.trim()) {
				const cred: Record<string, unknown> =
					provider === "vercel"
						? { token: providerKey.trim() }
						: { apiKey: providerKey.trim() };
				const meta = PROVIDERS_META[provider];
				if (meta.secondaryFields) {
					for (const f of meta.secondaryFields) {
						const v = providerSecondary[f.field]?.trim();
						if (v) cred[f.field] = v;
					}
				}
				setupBody.providerCredentials = { [provider]: cred };
			}
			const aiProviderKeys: Record<string, string> = {};
			if (aiKeys.vercelAiGateway.trim()) {
				aiProviderKeys.vercelAiGateway = aiKeys.vercelAiGateway.trim();
			}
			if (aiKeys.openrouter.trim()) aiProviderKeys.openrouter = aiKeys.openrouter.trim();
			if (aiKeys.anthropic.trim()) aiProviderKeys.anthropic = aiKeys.anthropic.trim();
			if (aiKeys.openai.trim()) aiProviderKeys.openai = aiKeys.openai.trim();
			if (Object.keys(aiProviderKeys).length > 0) {
				setupBody.aiProviderKeys = aiProviderKeys;
			}
			const intent = JSON.stringify({ agent, presetId, provider, routerId, model });
			if (!launchRef.current || launchRef.current.intent !== intent) {
				launchRef.current = { workerId: crypto.randomUUID(), operationId: null, intent };
				setBootMachineId(null);
			}
			setBootPhase("pending");
			const operationId = await submitOnboardingLaunch(launchRef.current, {
				setup: setupBody,
				presetId: presetId === NO_PRESET ? null : presetId,
				agentKind: agent,
				providerKind: provider,
				gatewayProfileId: agentUsesRouter(agent) && routerId ? routerId : DEFAULT_ROUTER_ID,
				model,
			});
			const completed = await waitForControlPlaneOperation(operationId, {
				onUpdate: (view) => {
					if (view.machineId) setBootMachineId(view.machineId);
					if (view.worker?.status?.phase) setBootPhase(view.worker.status.phase);
				},
			});
			if (!completed.machineId) throw new Error("launch completed without a machine id");
			setBootMachineId(completed.machineId);
			setBootPhase("running");
			setBootDone(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "provision failed");
		} finally {
			launchingRef.current = false;
			setBusy(false);
		}
	}, [agent, aiKeys, presetId, provider, providerKey, providerSecondary, routerId, model]);

	const agentCredDraft: DraftAiKeys = {
		vercelAiGateway: aiKeys.vercelAiGateway,
		openrouter: aiKeys.openrouter,
		anthropic: aiKeys.anthropic,
		openai: aiKeys.openai,
	};
	const agentCredsOk = canBootstrapAgent(
		agent,
		{ providers: initialConfig.providers, aiProviders: initialConfig.aiProviders },
		agentCredDraft,
	);
	const canProvisionInfra = onboardingProviderReady(provider, hasKey, providerKey, providerSecondary);
	const canProvision = canProvisionInfra && agentCredsOk;

	// Live upstream readiness for the info panel — merges on-file keys with what
	// the user is typing this step, so the status flips to "ready" as they fill in.
	const effectiveAiConfigured: Record<string, boolean> = {
		...wizardAiConfigured,
		vercelAiGateway:
			wizardAiConfigured.vercelAiGateway ||
			aiKeys.vercelAiGateway.trim().length > 0,
		openrouter:
			wizardAiConfigured.openrouter || aiKeys.openrouter.trim().length > 0,
		anthropic: wizardAiConfigured.anthropic || aiKeys.anthropic.trim().length > 0,
		openai: wizardAiConfigured.openai || aiKeys.openai.trim().length > 0,
	};
	const agentReadiness = agentUpstreamReadiness(agent, routerId, effectiveAiConfigured);

	// Open the exact machine just launched, even if another tab changed selection.
	useEffect(() => {
		if (!bootDone || !bootMachineId) return;
		const id = window.setTimeout(() => {
			router.replace(onboardingWorkspaceUrl(bootMachineId));
		}, 700);
		return () => window.clearTimeout(id);
	}, [bootDone, bootMachineId, router]);

	function handleStartBoot() {
		setStep("boot");
		void provision();
	}

	return (
		<main className="relative min-h-[100dvh] overflow-hidden bg-[var(--ret-bg)] text-[var(--ret-text)]">
			{/*
			  Ambient brand backdrop. Light mode = cloud-lines plate,
			  dark mode = nyx-lines plate. The kit-builder reads as a
			  designed surface, never a cold form.
			*/}
			<WingBackground variant="cloud" />
			<header className="relative z-10 border-b border-[var(--ret-border)] bg-[var(--ret-bg)]/85 px-6 py-4 backdrop-blur">
				<div className="mx-auto flex max-w-[var(--ret-content-max)] items-center justify-between gap-4">
					<a href="/" className="group flex items-center gap-2.5">
						<BrandMark size={20} gap="tight" withLabel={false} />
						<span
							className="text-[18px] leading-none tracking-tight text-[var(--ret-text)] transition-colors group-hover:text-[var(--ret-purple)]"
							style={{ fontFamily: "var(--font-display-serif)" }}
						>
							agent-machines
						</span>
					</a>
					<div className="flex items-center gap-3">
						<ThemeToggle />
						<a
							href="/dashboard"
							className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
						>
					skip →
					</a>
					</div>
				</div>
			</header>

			<div className="relative z-10 mx-auto grid max-w-[var(--ret-content-max)] gap-px bg-[var(--ret-border)] lg:grid-cols-[1.4fr_1fr]">
				<section className="bg-[var(--ret-bg)] p-6">
					<StepRail step={step} />

					{error && step !== "boot" ? (
					<ReticleFrame className="mt-4 border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
						<p className="text-[11px] text-[var(--ret-red)]">
							{error}
						</p>
					</ReticleFrame>
					) : null}

					<div className="mt-6">
						{step === "agent" ? (
							<AgentStep value={agent} onPick={(a) => setAgent(a)} onNext={next} />
						) : null}
						{step === "preset" ? (
							<PresetStep
								presets={presets}
								selectedId={presetId}
								onPick={setPresetId}
								onBack={back}
								onNext={next}
							/>
						) : null}
						{step === "provider" ? (
							<ProviderPickStep
								value={provider}
								configured={initialConfig.providers}
								onPick={(p) => {
									setProvider(p);
									setProviderKey("");
									setProviderSecondary({});
								}}
								onBack={back}
								onNext={next}
							/>
						) : null}
						{step === "key" ? (
							<div className="grid gap-4">
							{agentUsesRouter(agent) ? (
								<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
									<RouterSelect
										agentKind={agent}
										value={routerId}
										onChange={setRouterId}
										aiConfigured={effectiveAiConfigured}
									/>
								</div>
							) : null}
							<div className="grid gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
								<label htmlFor="onboarding-model" className="text-sm font-medium">Model <span className="font-normal text-[var(--ret-text-muted)]">(optional)</span></label>
								<input
									id="onboarding-model"
									value={model}
									onChange={(event) => setModel(event.target.value)}
									placeholder="Choose automatically for my connection"
									maxLength={200}
									aria-describedby="onboarding-model-help"
									className="w-full rounded border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 text-sm outline-none focus:border-[var(--ret-purple)]"
								/>
								<p id="onboarding-model-help" className="text-xs leading-relaxed text-[var(--ret-text-muted)]">Leave blank to choose a model for your connected AI provider. For Google or a custom endpoint, enter the exact model ID it supports.</p>
							</div>
							<KeyStep
								agent={agent}
								provider={provider}
								config={initialConfig}
								readiness={agentReadiness}
								substrateReady={canProvisionInfra}
								hasKey={hasKey}
								value={providerKey}
								onChange={setProviderKey}
								aiKeys={aiKeys}
								onAiKeyChange={(field, val) =>
									setAiKeys((prev) => ({ ...prev, [field]: val }))
								}
								agentCredsOk={agentCredsOk}
								secondary={providerSecondary}
								onSecondaryChange={(field, val) =>
									setProviderSecondary((prev) => ({ ...prev, [field]: val }))
								}
								busy={busy}
								canProvision={canProvision}
								onBack={back}
								onProvision={handleStartBoot}
							/>
							</div>
						) : null}
						{step === "boot" ? (
							<BootStep
								agent={agent}
								provider={provider}
								machineId={bootMachineId}
								phase={bootPhase}
								done={bootDone}
								busy={busy}
								onRetry={() => void provision()}
								onBack={() => { setError(null); setStep("key"); }}
								error={error}
							/>
						) : null}
					</div>
				</section>

				<aside className="relative hidden overflow-hidden bg-[var(--ret-bg-soft)] lg:block">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute -right-8 -top-8 flex h-[420px] w-[420px] items-start justify-end opacity-[0.07] dark:opacity-[0.10]"
					>
						<Logo mark="am" size={360} tone="auto" />
					</div>
					<RigPreview
						agent={agent}
						provider={provider}
						preset={selectedPreset}
						bootPhase={step === "boot" ? bootPhase : null}
						bootDone={bootDone}
					/>
				</aside>
			</div>
		</main>
	);
}

function StepRail({ step }: { step: Step }) {
	const order = STEPS.map((s) => s.id);
	const i = order.indexOf(step);
	return (
		<ol className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-5">
			{STEPS.map((s, idx) => {
				const isActive = idx === i;
				const isDone = idx < i;
				return (
					<li
						key={s.id}
						className={cn(
							"flex items-center gap-2 bg-[var(--ret-bg)] px-2.5 py-2",
							isActive
								? "bg-[var(--ret-purple-glow)]"
								: isDone
									? "opacity-90"
									: "opacity-60",
						)}
					>
						<span
							className={cn(
								"flex h-4 w-4 items-center justify-center border font-mono text-[9px] tabular-nums",
								isDone
									? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
									: isActive
										? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
										: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
							)}
						>
							{isDone ? "ok" : idx + 1}
						</span>
						<span className="min-w-0">
							<p className="truncate text-[11px] text-[var(--ret-text)]">
								{s.label}
							</p>
							<p className="truncate text-[10px] text-[var(--ret-text-muted)]">
								{s.hint}
							</p>
						</span>
					</li>
				);
			})}
		</ol>
	);
}

function AgentStep({
	value,
	onPick,
	onNext,
}: {
	value: AgentKind;
	onPick: (kind: AgentKind) => void;
	onNext: () => void;
}) {
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>Step 1 · Agent</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					Pick your agent
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					Choose one of four agent runtimes. Claude Code and Codex use their
					native CLIs; tools and HTTP support differ by runtime. No agent HTTP
					gateway is required to use the Console. Memory and runtime files live
					in your Worker&rsquo;s home directory, whose path depends on the provider.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{(Object.keys(AGENT_DESC) as AgentKind[]).map((kind) => {
					const meta = AGENT_DESC[kind];
					const selected = value === kind;
					return (
						<div
							key={kind}
							className={cn(
								"flex flex-col border transition-colors",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<button
								type="button"
								onClick={() => onPick(kind)}
								className="group flex flex-col gap-3 p-4 text-left"
							>
								<div className="flex items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<Logo mark={meta.mark} size={20} />
										<h2 className="text-[14px] font-medium text-[var(--ret-text)]">
											{meta.name}
										</h2>
									</div>
									{selected ? (
										<ReticleBadge variant="accent">selected</ReticleBadge>
									) : null}
								</div>
								<p className="text-[12px] text-[var(--ret-text-dim)]">
									{meta.tagline}
								</p>
								<ul className="space-y-0.5 text-[10px] text-[var(--ret-text-muted)]">
									{meta.bullets.map((b) => (
										<li key={b} className="flex items-start gap-1.5">
											<span>.</span>
											<span>{b}</span>
										</li>
									))}
								</ul>
							</button>
							{/* Source links sit OUTSIDE the picker button so clicking
							    them opens the link instead of selecting the agent. */}
							<div className="flex flex-wrap gap-1.5 border-t border-[var(--ret-border)] px-4 py-2">
								{meta.links.map((l) => (
									<a
										key={l.href}
										href={l.href}
										target="_blank"
										rel="noreferrer"
										className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-purple)]"
									>
									{l.label} →
								</a>
								))}
							</div>
						</div>
					);
				})}
			</div>
			<div className="flex justify-end">
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue →
				</ReticleButton>
			</div>
		</div>
	);
}

function PresetBrand({ brand, size }: { brand?: string; size: number }) {
	if (!brand) return null;
	if (isMark(brand)) return <Logo mark={brand} size={size} />;
	if (isServiceSlug(brand)) return <ServiceIcon slug={brand} size={size} />;
	return null;
}

function PresetStep({
	presets,
	selectedId,
	onPick,
	onBack,
	onNext,
}: {
	presets: Preset[];
	selectedId: string;
	onPick: (id: string) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>Step 2 · Preset</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">Choose a starting specialist</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					A preset supplies specialist memory, instructions, and selected skills
					and MCP servers. Connected tools may still need credentials or setup;
					selection is not verification. Refine the instructions in Memory and
					manage tools in the Registry after launch. Recurring work runs only
					when you configure and enable a schedule.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{presets.map((preset) => {
					const selected = preset.id === selectedId;
					const skillCount = preset.skillIds.filter((id) => id !== "*").length;
					const mcpCount = preset.mcpServerIds.filter((id) => id !== "*").length;
					return (
						<button
							key={preset.id}
							type="button"
							onClick={() => onPick(preset.id)}
							className={cn(
								"flex flex-col gap-2 border p-4 text-left transition-colors",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<div className="flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<PresetBrand brand={preset.brand} size={16} />
									<h2 className="text-[14px] font-medium text-[var(--ret-text)]">
										{preset.name}
									</h2>
								</div>
								{selected ? (
									<ReticleBadge variant="accent">selected</ReticleBadge>
								) : null}
							</div>
							<p className="text-[12px] text-[var(--ret-text-dim)]">
								{preset.description}
							</p>
							<p className="mt-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
								Selected · Skills: {skillCount} · MCP servers: {mcpCount}
							</p>
						</button>
					);
				})}
				<button
					type="button"
					onClick={() => onPick(NO_PRESET)}
					className={cn(
						"flex flex-col gap-2 border p-4 text-left transition-colors",
						selectedId === NO_PRESET
							? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
							: "border-dashed border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
					)}
				>
					<div className="flex items-center justify-between gap-2">
						<h2 className="text-[14px] font-medium text-[var(--ret-text)]">
							Start blank
						</h2>
						{selectedId === NO_PRESET ? (
							<ReticleBadge variant="accent">selected</ReticleBadge>
						) : null}
					</div>
					<p className="text-[12px] text-[var(--ret-text-dim)]">
						No specialist preset selected. Start with basic instructions and
						choose your own tools from the bundled Registry catalog.
					</p>
					<p className="mt-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
						No specialist tools selected
					</p>
				</button>
			</div>
			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack}>
					← Back
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue →
				</ReticleButton>
			</div>
		</div>
	);
}

function ProviderComparison({ selected }: { selected: ProviderKind }) {
	const COLS: ReadonlyArray<{ key: keyof (typeof COMPARISON_ROWS)[number]; label: string }> = [
		{ key: "dedalus", label: "Dedalus" },
		{ key: "e2b", label: "E2B" },
		{ key: "sprites", label: "Sprites" },
		{ key: "vercel", label: "Vercel" },
	];

	return (
		<ReticleFrame>
			<div className="border-b border-[var(--ret-border)] px-4 py-2">
				<ReticleLabel>Compare capabilities · Launch time and limits vary</ReticleLabel>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-[12px]">
					<thead>
						<tr className="border-b border-[var(--ret-border)]">
							<th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								Feature
							</th>
							{COLS.map((col) => (
								<th
									key={col.key}
									className={cn(
										"px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em]",
										selected === col.key
											? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
											: "text-[var(--ret-text-muted)]",
									)}
								>
									<span className="inline-flex items-center gap-1.5">
										<Logo mark={providerLogoMark(col.key as ProviderKind)} size={12} tone="auto" />
										{col.label}
									</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{COMPARISON_ROWS.map((row) => (
							<tr key={row.label} className="border-b border-[var(--ret-border)] last:border-b-0">
								<td className="whitespace-nowrap px-3 py-1.5 text-[var(--ret-text-muted)]">
									{row.label}
								</td>
								{COLS.map((col) => (
									<td
										key={col.key}
										className={cn(
											"px-3 py-1.5",
											selected === col.key
												? "bg-[var(--ret-purple-glow)] text-[var(--ret-text)]"
												: "text-[var(--ret-text-dim)]",
										)}
									>
										<span className="font-mono text-[11px]">{row[col.key]}</span>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</ReticleFrame>
	);
}

function ProviderPickStep({
	value,
	configured,
	onPick,
	onBack,
	onNext,
}: {
	value: ProviderKind;
	configured: Record<ProviderKind, { configured: boolean; scopeHint?: string }>;
	onPick: (kind: ProviderKind) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>Step 3 · Provider</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					Pick where it runs
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					Choose the cloud provider that will host your Worker. Connect its
					account in the next step if needed. Storage, sleep, and recovery
					capabilities differ by provider. The first launch also installs and
					configures your chosen runtime.
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{PROVIDER_KINDS.map((kind) => {
					const meta = PROVIDERS_META[kind];
					const selected = value === kind;
					const hasCreds = configured[kind].configured;
					return (
						<button
							key={kind}
							type="button"
							onClick={() => onPick(kind)}
							className={cn(
								"group flex flex-col gap-3 border p-4 text-left transition-colors",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<Logo mark={providerLogoMark(kind)} size={18} tone="auto" />
									<h2 className="text-[13px] font-medium text-[var(--ret-text)]">
										{meta.name}
									</h2>
								</div>
								<div className="flex items-center gap-1.5">
									{hasCreds ? (
										<ReticleBadge variant="success">key on file</ReticleBadge>
									) : null}
									{selected ? (
										<ReticleBadge variant="accent">selected</ReticleBadge>
									) : null}
								</div>
							</div>
							<p className="text-[12px] text-[var(--ret-text-dim)]">
								{meta.tagline}
							</p>
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								provider: {kind}
							</span>
						</button>
					);
				})}
			</div>
			<ProviderComparison selected={value} />
			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack}>
					← Back
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue →
				</ReticleButton>
			</div>
		</div>
	);
}

function KeyStep({
	agent,
	provider,
	config,
	readiness,
	substrateReady,
	hasKey,
	value,
	onChange,
	aiKeys,
	onAiKeyChange,
	agentCredsOk,
	secondary,
	onSecondaryChange,
	busy,
	canProvision,
	onBack,
	onProvision,
}: {
	agent: AgentKind;
	provider: ProviderKind;
	config: PublicUserConfig;
	readiness: AgentUpstreamReadiness;
	substrateReady: boolean;
	hasKey: boolean;
	value: string;
	onChange: (v: string) => void;
	aiKeys: OnboardingAiKeys;
	onAiKeyChange: (field: OnboardingAiKeyField, val: string) => void;
	agentCredsOk: boolean;
	secondary: Record<string, string>;
	onSecondaryChange: (field: string, val: string) => void;
	busy: boolean;
	canProvision: boolean;
	onBack: () => void;
	onProvision: () => void;
}) {
	const meta = PROVIDERS_META[provider];
	const agentReqs = agentCredentialRequirements(agent);
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>Step 4 · Keys</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					Bring your keys
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					Your {PROVIDER_LABEL[provider]} key creates the machine. Your AI provider
					key powers {AGENT_LABEL[agent]}. Credentials are saved privately to your
					account. Your providers bill you directly for machine and model usage.
				</p>
			</div>
			{/* What you're about to boot — same panels as the spin-up form. */}
			<div className="grid gap-3 md:grid-cols-2">
				<AgentInfoPanel agentKind={agent} readiness={readiness} />
				<MachineInfoPanel provider={provider} configured={substrateReady} />
			</div>
			<ReticleLabel>Cloud provider</ReticleLabel>
			<label className="flex flex-col gap-1.5">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{meta.keyLabel}
				</span>
				<input
					type="password"
					autoComplete="off"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					placeholder={meta.keyPlaceholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
				<span className="text-[10px] text-[var(--ret-text-muted)]">
					{hasKey
						? "On file. Leave blank to keep the existing key."
						: "Required to create the machine."}
				</span>
			</label>
			{meta.secondaryFields?.map((f) => (
				<label key={f.field} className="flex flex-col gap-1.5">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{f.label}
					</span>
					<input
						type="text"
						autoComplete="off"
						placeholder={f.placeholder}
						value={secondary[f.field] ?? ""}
						onChange={(e) => onSecondaryChange(f.field, e.target.value)}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
					/>
				</label>
			))}
			{agentReqs.length > 0 ? (
				<>
					<ReticleLabel>AI connection · {AGENT_LABEL[agent]}</ReticleLabel>
					{agentUsesRouter(agent) ? (
						<p className="text-[11px] text-[var(--ret-text-dim)]">Add at least one AI provider key below. You do not need all four.</p>
					) : null}
					{agentReqs.map((req) => {
						const field = req.field as OnboardingAiKeyField;
						const onFile = config.aiProviders[field]?.configured ?? false;
						return (
							<label key={req.field} className="flex flex-col gap-1.5">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{req.label}
									{req.required ? " *" : ""}
								</span>
								<input
									type="password"
									autoComplete="off"
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									placeholder={req.hint}
									value={aiKeys[field]}
									onChange={(e) => onAiKeyChange(field, e.target.value)}
									className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
								/>
								<span className="text-[10px] text-[var(--ret-text-muted)]">
										{onFile
										? "On file. Leave blank to keep."
										: req.required
											? "Required for automated setup."
											: "Optional if another supported AI connection is available."}
									{req.signupUrl ? (
										<>
											{" "}
											<a
												href={req.signupUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="text-[var(--ret-purple)] underline-offset-2 hover:underline"
											>
												Get a key
											</a>
										</>
									) : null}
								</span>
							</label>
						);
					})}
					{(agent === "claude-code" || agent === "codex") ? (
						<p className="text-[10px] text-[var(--ret-text-muted)]">
							Subscription sign-in ({agent === "claude-code" ? "claude auth login" : "codex login"}) is
							interactive. This setup requires an API key; you can sign in separately in the terminal after launch.
						</p>
					) : null}
				</>
			) : null}
			{!agentCredsOk ? (
				<p className="text-[11px] text-[var(--ret-amber)]">
					Add a supported AI provider key above before launching {AGENT_LABEL[agent]}.
				</p>
			) : null}
			{provider === "vercel" && value.trim() && !substrateReady ? (
				<p className="text-[11px] text-[var(--ret-amber)]">A Vercel access token needs both a Team ID and a Project ID before launch.</p>
			) : null}
			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack} disabled={busy}>
					← Back
				</ReticleButton>
				<ReticleButton
					variant="primary"
					size="md"
					onClick={onProvision}
					disabled={busy || !canProvision}
				>
					{busy ? (
						<BrailleSpinner name="braille" label="Saving..." className="text-sm" />
					) : (
						<>Launch Worker →</>
					)}
				</ReticleButton>
			</div>
		</div>
	);
}

function BootStep({
	agent,
	provider,
	machineId,
	phase,
	done,
	busy,
	error,
	onRetry,
	onBack,
}: {
	agent: AgentKind;
	provider: ProviderKind;
	machineId: string | null;
	phase: string | null;
	done: boolean;
	busy: boolean;
	error: string | null;
	onRetry: () => void;
	onBack: () => void;
}) {
	const isCliAgent = agent === "claude-code" || agent === "codex";
	const machineReady = Boolean(machineId) || phase === "bootstrapping" || phase === "running" || done;
	const steps = [
		{ id: "create", label: "Save Worker and queue launch", isDone: (phase !== null && phase !== "pending") || machineReady },
		{ id: "machine", label: `Create ${PROVIDER_LABEL[provider]} workspace`, isDone: machineReady },
		{ id: "agent", label: `Prepare memory and configure ${AGENT_LABEL[agent]}`, isDone: done },
		{ id: "ready", label: "Check runtime readiness and open Console", isDone: done },
	];
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>Step 5 · Launch</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					{done ? "Your Worker is ready" : "Launching your Worker"}
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					{done
						? "Opening the Console so you can give your Worker its first task…"
						: isCliAgent
							? `Creating a ${PROVIDER_LABEL[provider]} machine, preparing your memory, and configuring the native ${AGENT_LABEL[agent]} CLI. Selected tools may need additional setup.`
							: `Creating a ${PROVIDER_LABEL[provider]} machine, preparing your memory, and connecting ${AGENT_LABEL[agent]} to your chosen AI provider. Selected tools may need additional setup.`}
				</p>
			</div>

			{error ? (
				<ReticleFrame className="border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
					<p className="text-[11px] text-[var(--ret-red)]">{error}</p>
					<div className="mt-2 flex gap-2">
						<ReticleButton variant="secondary" size="sm" onClick={onRetry} disabled={busy}>
							Retry
						</ReticleButton>
						<ReticleButton variant="ghost" size="sm" onClick={onBack} disabled={busy}>
							Edit setup
						</ReticleButton>
					</div>
				</ReticleFrame>
			) : null}

			<ReticleFrame>
				<ol className="divide-y divide-[var(--ret-border)]">
					{steps.map((s, idx) => {
						const active = !s.isDone && (idx === 0 || steps[idx - 1].isDone);
						return (
							<li
								key={s.id}
								className="flex items-center gap-3 px-4 py-2.5 text-[12px]"
							>
								<span
									className={cn(
										"flex h-5 w-5 items-center justify-center border font-mono text-[10px]",
										s.isDone
											? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
											: active
												? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
												: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
									)}
								>
									{s.isDone ? "ok" : active ? <BrailleSpinner /> : "."}
								</span>
								<span
									className={cn(
										"flex-1",
										s.isDone
											? "text-[var(--ret-text)]"
											: active
												? "text-[var(--ret-text)]"
												: "text-[var(--ret-text-muted)]",
									)}
								>
									{s.label}
								</span>
								{idx === 1 && phase ? (
									<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
										{phase}
									</span>
								) : null}
							</li>
						);
					})}
				</ol>
			</ReticleFrame>

			{machineId ? (
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					Machine ID ·{" "}
					<span className="text-[var(--ret-text)]">{machineId}</span>
				</p>
			) : (
				<p className="text-[10px] text-[var(--ret-text-muted)]">
					<BrailleSpinner /> Waiting for the machine to be created…
				</p>
			)}

			{/*
			  Live transcript of every controlplane phase change + on-VM
			  log line we can pull. Replaces the old "this can take a
			  minute" silence with a real running commentary so the
			  operator can see exactly which step the machine is
			  blocked on (and which Dedalus error code if it's failing).
			*/}
			{machineId ? <BootTranscript active={busy && !done} machineId={machineId} maxHeight={280} /> : null}
		</div>
	);
}

function RigPreview({
	agent,
	provider,
	preset,
	bootPhase,
	bootDone,
}: {
	agent: AgentKind;
	provider: ProviderKind;
	preset: Preset | null;
	bootPhase: string | null;
	bootDone: boolean;
}) {
	const meta = AGENT_DESC[agent];
	const skillIds = (preset?.skillIds ?? []).filter((id) => id !== "*");
	const mcpIds = (preset?.mcpServerIds ?? []).filter((id) => id !== "*");
	const spotlight = skillIds.slice(0, 8);

	return (
		<div className="space-y-4 px-5 py-6">
			<div className="flex items-center justify-between gap-2">
				<ReticleLabel>Your Worker</ReticleLabel>
				{bootPhase ? (
					<ReticleBadge variant={bootDone ? "success" : "warning"}>
						{bootDone ? "ready" : bootPhase}
					</ReticleBadge>
				) : null}
			</div>
			<ReticleFrame>
				<div className="flex items-center gap-3 border-b border-[var(--ret-border)] px-4 py-3">
					<Logo mark={meta.mark} size={28} />
					<div>
						<p className="text-[14px] font-medium text-[var(--ret-text)]">
							{meta.name}
						</p>
						<p className="text-[10px] text-[var(--ret-text-muted)]">
							{meta.tagline}
						</p>
						<p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							on {PROVIDER_LABEL[provider]}
						</p>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-px bg-[var(--ret-border)]">
					<Tally label="selected skills" value={skillIds.length} />
					<Tally label="selected MCP servers" value={mcpIds.length} />
				</div>
			</ReticleFrame>

			<ReticleFrame>
				<div className="flex items-center gap-2 border-b border-[var(--ret-border)] px-4 py-2">
					<PresetBrand brand={preset?.brand} size={14} />
					<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						memory preset
					</p>
				</div>
				<div className="px-4 py-3">
					<p className="text-[12px] text-[var(--ret-text)]">
						{preset ? preset.name : "Blank start"}
					</p>
					<p className="mt-0.5 text-[10px] text-[var(--ret-text-dim)]">
						{preset
							? preset.description
							: "No specialist preset selected. The bundled Registry catalog remains available."}
					</p>
				</div>
			</ReticleFrame>

			{mcpIds.length > 0 ? (
				<ReticleFrame>
					<div className="border-b border-[var(--ret-border)] px-4 py-2">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Selected MCP servers · {mcpIds.length}
						</p>
					</div>
					<ul className="divide-y divide-[var(--ret-border)]">
						{mcpIds.map((name) => (
							<li
								key={name}
								className="px-4 py-2 font-mono text-[11px] text-[var(--ret-text)]"
							>
								{name}
							</li>
						))}
					</ul>
				</ReticleFrame>
			) : null}

			{spotlight.length > 0 ? (
				<ReticleFrame>
					<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-2">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Selected skill preview
						</p>
						<span className="font-mono text-[10px] tabular-nums text-[var(--ret-text-muted)]">
							{spotlight.length} / {skillIds.length}
						</span>
					</div>
					<ul className="divide-y divide-[var(--ret-border)]">
						{spotlight.map((skillId) => (
							<li
								key={skillId}
								className="px-4 py-1.5 font-mono text-[11px] text-[var(--ret-text)]"
							>
								<span className="text-[var(--ret-text-muted)]">.</span> {skillId}
							</li>
						))}
					</ul>
				</ReticleFrame>
			) : null}
		</div>
	);
}

function Tally({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex flex-col gap-0.5 bg-[var(--ret-bg)] px-3 py-2">
			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="font-mono text-base tabular-nums text-[var(--ret-text)]">
				{value}
			</p>
		</div>
	);
}
